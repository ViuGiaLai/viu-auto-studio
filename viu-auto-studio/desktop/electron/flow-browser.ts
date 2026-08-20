import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { findFreePort, getUserDataDir, type RuntimeConfig } from "./runtime-config"

type FlowBrowserStartInput = {
  projectId: number
  factorySessionId: string
}

type FlowBrowserStartResult = {
  ok: boolean
  status: "started" | "reused" | "unavailable" | "failed"
  message: string
  profilePath?: string
}

let browserProcess: ChildProcess | null = null
let browserPort = 0

function terminateBrowserTree(proc: ChildProcess): void {
  if (!proc.pid) return
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(proc.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    })
  } else {
    proc.kill("SIGTERM")
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill("SIGKILL")
    }, 3000)
  }
}

function candidateChromePaths(): string[] {
  const env = process.env.VIU_CHROME_PATH || process.env.VIU_BROWSER_PATH
  const values = env ? [env] : []
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles || "C:\\Program Files"
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local")
    values.push(
      // Google Chrome
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      // Microsoft Edge
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
    )
  } else if (process.platform === "darwin") {
    values.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    )
  } else {
    values.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/microsoft-edge",
      "/usr/bin/microsoft-edge-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    )
  }
  return [...new Set(values)].filter(Boolean)
}

function findChrome(): string | null {
  return candidateChromePaths().find((candidate) => existsSync(candidate)) || null
}

async function waitForDevTools(port: number, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return true
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function configureExtension(runtime: RuntimeConfig, input: FlowBrowserStartInput): Promise<void> {
  const puppeteer = await import("puppeteer-core")
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${browserPort}` })
  try {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const serviceWorkerTarget = browser.targets().find((target) => target.type() === "service_worker" && target.url().includes("/service-worker.js"))
      if (serviceWorkerTarget) {
        const worker = await serviceWorkerTarget.worker()
        if (worker) {
          await worker.evaluate((config) => {
            const chromeApi = (globalThis as unknown as { chrome: { storage: { local: { set(values: Record<string, unknown>): Promise<void> } } } }).chrome
            void chromeApi.storage.local.set({
              apiBaseUrl: config.apiBaseUrl,
              bootstrapToken: config.bootstrapToken,
              factorySessionId: config.factorySessionId,
              flowUrl: config.flowUrl,
              paired: true,
              autoFactory: true,
            })
          }, {
            apiBaseUrl: runtime.apiBaseUrl,
            bootstrapToken: runtime.flowBootstrapToken,
            factorySessionId: input.factorySessionId,
            flowUrl: "https://labs.google/fx/tools/flow",
          })
          return
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error("Không tìm thấy Flow Connector service worker trong Chrome")
  } finally {
    await browser.disconnect()
  }
}

export async function startFlowBrowser(runtime: RuntimeConfig, input: FlowBrowserStartInput): Promise<FlowBrowserStartResult> {
  if (!runtime.flowBootstrapToken) {
    return { ok: false, status: "failed", message: "Flow bootstrap token chưa sẵn sàng" }
  }
  const chrome = findChrome()
  if (!chrome) {
    return { ok: false, status: "unavailable", message: "Không tìm thấy Google Chrome. Cài Chrome hoặc đặt VIU_CHROME_PATH." }
  }
  const extensionPath = resolveFlowConnectorPath()
  if (!extensionPath) {
    return { ok: false, status: "failed", message: "Không tìm thấy thư mục flow-connector trong bản Desktop." }
  }
  const profilePath = path.join(getUserDataDir(), "flow-chrome-profile")
  mkdirSync(profilePath, { recursive: true })
  if (browserProcess && browserPort && await waitForDevTools(browserPort, 500)) {
    try {
      await configureExtension(runtime, input)
      return { ok: true, status: "reused", message: "Đã tái sử dụng Chrome Flow profile.", profilePath }
    } catch {
      // The old process may be stale; continue with a new browser process.
    }
  }
  browserPort = await findFreePort("127.0.0.1")
  const args = [
    `--user-data-dir=${profilePath}`,
    `--remote-debugging-port=${browserPort}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    `--load-extension=${extensionPath}`,
    `--disable-extensions-except=${extensionPath}`,
    "--app=https://labs.google/fx/tools/flow",
  ]
  browserProcess = spawn(chrome, args, { detached: false, windowsHide: false, stdio: "ignore" })
  browserProcess.once("exit", () => {
    browserProcess = null
    browserPort = 0
  })
  if (!(await waitForDevTools(browserPort))) {
    terminateBrowserTree(browserProcess)
    browserProcess = null
    browserPort = 0
    return { ok: false, status: "failed", message: "Chrome không mở được remote debugging session." }
  }
  try {
    await configureExtension(runtime, input)
    return { ok: true, status: "started", message: "Đã mở Chrome Flow profile và nạp Flow Connector.", profilePath }
  } catch (error) {
    terminateBrowserTree(browserProcess)
    browserProcess = null
    browserPort = 0
    return { ok: false, status: "failed", message: String(error instanceof Error ? error.message : error), profilePath }
  }
}

function resolveFlowConnectorPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "flow-connector"),
    path.resolve(process.cwd(), "../flow-connector"),
    path.resolve(__dirname, "../../flow-connector"),
    path.join(process.resourcesPath || "", "flow-connector"),
  ]
  return candidates.find((candidate) => existsSync(path.join(candidate, "manifest.json"))) || null
}

export function stopFlowBrowser(): void {
  const proc = browserProcess
  browserProcess = null
  browserPort = 0
  if (proc) terminateBrowserTree(proc)
}
