import { ChildProcess, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import fs from "node:fs"
import path from "node:path"
import {
  findFreePort,
  getUserDataDir,
  ensureUserDataDirs,
  readRuntimeConfig,
  writeRuntimeConfig,
  dirnameOf,
  type RuntimeConfig,
} from "./runtime-config"

export const BACKEND_HOST = "127.0.0.1"

/**
 * BackendManager — khởi động FastAPI local khi ứng dụng mở, dừng khi thoát.
 * Port: tự tìm port TCP còn trống (không cố định 8000).
 * Python: ưu tiên Python đóng gói trong resources/python (embeddable),
 *         fallback tìm python/python3 trong PATH.
 * Dữ liệu: SQLite, projects, logs lưu trong thư mục userData của từng người dùng.
 * Sau khi backend sẵn sàng, ghi runtime.json (API URL + đường dẫn) để
 * React (qua preload) và Flow Connector Extension (qua trang options) sử dụng.
 */
function resolveBackendRoot(): { dir: string; mode: "packaged" | "source" } | null {
  // 1) Packaged: <app>/resources/backend (electron-builder extraResources)
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    const packaged = path.join(resourcesPath, "backend")
    if (existsSync(path.join(packaged, "main.py"))) {
      return { dir: packaged, mode: "packaged" }
    }
  }
  // 2) Source checkout: ../../backend relative to this built file
  const here = dirnameOf(import.meta.url)
  const source = path.resolve(here, "..", "..", "backend")
  if (existsSync(path.join(source, "main.py"))) {
    return { dir: source, mode: "source" }
  }
  // 3) Same directory as electron build (for `electron .` from repo root)
  const sibling = path.resolve(here, "..", "backend")
  if (existsSync(path.join(sibling, "main.py"))) {
    return { dir: sibling, mode: "source" }
  }
  return null
}

/**
 * Tìm đường dẫn Python thực thi backend.
 * Ưu tiên: resources/python/python(.exe)/pythonw — Python embeddable đóng gói sẵn.
 * Fallback: python / python3 trong PATH.
 */
export function resolvePython(): { python: string; isBundled: boolean } | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    const pyDir = path.join(resourcesPath, "python")
    const candidates =
      process.platform === "win32"
        ? ["python.exe", "pythonw.exe", path.join("python", "python.exe")]
        : ["bin/python3", "bin/python", "python3", "python"]
    for (const c of candidates) {
      const p = path.join(pyDir, c)
      if (existsSync(p)) return { python: p, isBundled: true }
    }
  }
  const pathPython = process.platform === "win32" ? "python" : "python3"
  return { python: pathPython, isBundled: false }
}

/**
 * Tìm đường dẫn FFmpeg/FFprobe đóng gói sẵn (resources/ffmpeg) hoặc trong PATH.
 */
export function resolveFFmpeg(): { ffmpegPath: string; ffprobePath: string; isBundled: boolean } {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    const ffDir = path.join(resourcesPath, "ffmpeg")
    if (process.platform === "win32") {
      const exe = path.join(ffDir, "ffmpeg.exe")
      const probe = path.join(ffDir, "ffprobe.exe")
      if (existsSync(exe) && existsSync(probe)) {
        return { ffmpegPath: exe, ffprobePath: probe, isBundled: true }
      }
    } else {
      const exe = path.join(ffDir, "ffmpeg")
      const probe = path.join(ffDir, "ffprobe")
      if (existsSync(exe) && existsSync(probe)) {
        return { ffmpegPath: exe, ffprobePath: probe, isBundled: true }
      }
    }
  }
  return { ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", isBundled: false }
}

async function checkHealth(host: string, port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${port}/api/health`, {
      signal: AbortSignal.timeout(2500),
    })
    return res.ok
  } catch {
    return false
  }
}

async function waitForBackend(host: string, port: number, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await checkHealth(host, port)) return true
    await new Promise((r) => setTimeout(r, 800))
  }
  return false
}

let backendProcess: ChildProcess | null = null
let currentPort = 0

export async function startBackend(): Promise<{ port: number; apiBaseUrl: string }> {
  // 1) Nếu đã có cấu hình runtime hợp lệ từ lần chạy trước, thử dùng lại cùng port
  const saved = readRuntimeConfig()
  if (saved && (await checkHealth(BACKEND_HOST, saved.backendPort))) {
    console.log("[BackendManager] Backend đã chạy ở port", saved.backendPort, "— tái sử dụng.")
    currentPort = saved.backendPort
    return { port: currentPort, apiBaseUrl: `http://${BACKEND_HOST}:${currentPort}` }
  }

  // 2) Tìm port còn trống
  const port = await findFreePort(BACKEND_HOST)
  if (!port) throw new Error("Không tìm được port TCP trống để khởi động backend.")
  currentPort = port

  const root = resolveBackendRoot()
  const py = resolvePython()
  const ff = resolveFFmpeg()
  const { dataDir, projectsDir, logsDir } = ensureUserDataDirs()

  const logFile = path.join(logsDir, `backend-${port}.log`)
  const logStream = fs.createWriteStream(logFile, { flags: "a" })

  if (!root || !py) {
    throw new Error(
      "Không tìm thấy thư mục backend (FastAPI). Vui lòng kiểm tra bộ cài đặt của ứng dụng.",
    )
  }
  const repoRoot = path.resolve(root.dir, "..")
  const isWin = process.platform === "win32"

  // PYTHONPATH: repo root khi source; khi packaged, thư mục cha của backend
  const pythonPath = root.mode === "source" ? repoRoot : path.dirname(root.dir)

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONPATH: pythonPath,
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONIOENCODING: "utf-8",
    // Truyền cấu hình runtime cho FastAPI qua biến môi trường — không hardcode
    VIU_HOST: BACKEND_HOST,
    VIU_PORT: String(port),
    VIU_DATA_DIR: dataDir,
    VIU_PROJECTS_DIR: projectsDir,
    VIU_FFMPEG_BIN: ff.ffmpegPath,
    VIU_FFPROBE_BIN: ff.ffprobePath,
    VIU_LOG_DIR: logsDir,
  }

  const args = [
    "-u",
    "-m",
    "uvicorn",
    "backend.main:app",
    "--host",
    BACKEND_HOST,
    "--port",
    String(port),
  ]

  console.log(
    `[BackendManager] Khởi động FastAPI: python=${py.python} (bundled=${py.isBundled}) port=${port} dataDir=${dataDir}`,
  )
  logStream.write(`[${new Date().toISOString()}] Backend start port=${port} python=${py.python}\n`)

  backendProcess = spawn(py.python, args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env,
    windowsHide: true,
  })
  backendProcess.stdout?.on("data", (chunk: Buffer) => {
    const s = chunk.toString().trim()
    if (s) {
      console.log("[Backend]", s)
      logStream.write(`${s}\n`)
    }
  })
  backendProcess.stderr?.on("data", (chunk: Buffer) => {
    const s = chunk.toString().trim()
    if (s) {
      console.error("[Backend]", s)
      logStream.write(`[ERR] ${s}\n`)
    }
  })
  backendProcess.on("exit", (code) => {
    console.log(`[BackendManager] Backend thoát với mã ${code}`)
    logStream.write(`[${new Date().toISOString()}] Backend exit code=${code}\n`)
    backendProcess = null
  })

  const ready = await waitForBackend(BACKEND_HOST, port)
  if (!ready) {
    throw new Error(
      `Backend không khởi động được trên port ${port}. Xem log tại: ${logFile}` +
        (py.isBundled ? "" : " (Máy này chưa cài Python — hãy dùng bộ cài đầy đủ của Viu Auto Studio)."),
    )
  }

  // 3) Ghi runtime.json để React + Extension đọc API URL động
  const cfg: RuntimeConfig = {
    apiBaseUrl: `http://${BACKEND_HOST}:${port}`,
    backendPort: port,
    ffmpegPath: ff.ffmpegPath,
    ffprobePath: ff.ffprobePath,
    dataDir,
    projectsDir,
    logsDir,
    dbPath: path.join(dataDir, "app.db"),
    pythonPath: py.python,
    updatedAt: new Date().toISOString(),
  }
  writeRuntimeConfig(cfg)

  // 4) Ghi extension-config.json — Flow Connector Extension đọc API URL động từ đây
  try {
    const extCfgFile = path.join(getUserDataDir(), "extension-config.json")
    fs.writeFileSync(
      extCfgFile,
      JSON.stringify({ apiBaseUrl: cfg.apiBaseUrl, backendPort: port, updatedAt: new Date().toISOString() }, null, 2),
    )
    console.log("[BackendManager] extension-config.json đã ghi:", extCfgFile)
  } catch (err) {
    console.error("[BackendManager] Không ghi được extension-config.json:", err)
  }

  console.log("[BackendManager] Backend sẵn sàng tại", cfg.apiBaseUrl, "| runtime.json đã ghi.")
  return { port, apiBaseUrl: cfg.apiBaseUrl }
}

export function stopBackend(): void {
  if (backendProcess) {
    console.log("[BackendManager] Dừng backend...")
    backendProcess.kill("SIGTERM")
    const proc = backendProcess
    backendProcess = null
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill("SIGKILL")
    }, 5000)
  }
}

process.on("exit", stopBackend)
