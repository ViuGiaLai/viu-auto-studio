import { app } from "electron"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { fileURLToPath } from "node:url"
import path from "node:path"

/** Helper an toàn cả ESM (file: protocol) lẫn CJS — thay __filename. */
export function dirnameOf(importMetaUrl: string): string {
  return path.dirname(importMetaUrl.startsWith("file://") ? fileURLToPath(importMetaUrl) : importMetaUrl)
}

/**
 * RuntimeConfig — cấu hình động được Electron tạo khi khởi động.
 * Mọi thành phần (React, Flow Extension) đọc API URL / port / đường dẫn
 * từ file này thay vì dùng giá trị cố định của máy phát triển.
 * File được lưu tại userData/ViuAutoStudio/runtime.json
 */
export interface RuntimeConfig {
  apiBaseUrl: string // ví dụ http://127.0.0.1:8217
  backendPort: number
  ffmpegPath: string
  ffprobePath: string
  dataDir: string
  projectsDir: string
  logsDir: string
  dbPath: string
  pythonPath: string
  updatedAt: string
}

export const RUNTIME_FILE_NAME = "runtime.json"

export function getUserDataDir(): string {
  // Electron userData: %APPDATA%/Viu Auto Studio (win) / ~/.../vda (linux)
  const dir = app ? app.getPath("userData") : process.env.VIU_USER_DATA_DIR || ""
  if (!dir) throw new Error("userData dir không xác định")
  return dir
}

export function ensureUserDataDirs(): {
  dataDir: string
  projectsDir: string
  logsDir: string
} {
  const root = getUserDataDir()
  const dataDir = path.join(root, "data")
  const projectsDir = path.join(root, "projects")
  const logsDir = path.join(root, "logs")
  for (const d of [root, dataDir, projectsDir, logsDir]) {
    mkdirSync(d, { recursive: true })
  }
  return { dataDir, projectsDir, logsDir }
}

/** Tìm một TCP port còn trống. 0 = hệ điều hành tự chọn. */
export function findFreePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on("error", reject)
    srv.listen(0, host, () => {
      const addr = srv.address()
      const port = addr && typeof addr === "object" ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

/** Đọc cấu hình runtime đã lưu (nếu có). */
export function readRuntimeConfig(): RuntimeConfig | null {
  try {
    const dir = getUserDataDir()
    const file = path.join(dir, RUNTIME_FILE_NAME)
    if (!existsSync(file)) return null
    return JSON.parse(readFileSync(file, "utf-8")) as RuntimeConfig
  } catch {
    return null
  }
}

/** Ghi cấu hình runtime để React (qua preload) và Extension (qua hướng dẫn/options) đọc. */
export function writeRuntimeConfig(cfg: RuntimeConfig): void {
  const dir = getUserDataDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, RUNTIME_FILE_NAME), JSON.stringify(cfg, null, 2))
}
