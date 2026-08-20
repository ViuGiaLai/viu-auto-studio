import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import { findFreePort, getUserDataDir, dirnameOf, type RuntimeConfig } from "./runtime-config"

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
  // 1. Check candidates from known paths
  const fromDisk = candidateChromePaths().find((candidate) => existsSync(candidate))
  if (fromDisk) return fromDisk

  // 2. Check Windows Registry (chrome.exe, msedge.exe)
  if (process.platform === "win32") {
    try {
      const { execSync } = require("node:child_process")
      for (const exe of ["chrome.exe", "msedge.exe"]) {
        for (const hive of ["HKLM", "HKCU"]) {
          try {
            const regPath = `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`
            const output = execSync(`reg query "${regPath}" /ve`, { encoding: "utf-8", windowsHide: true, timeout: 3000 })
            const match = output.match(/REG_SZ\s+(.+)/i)
            if (match) {
              const p = match[1].trim().replace(/^"|"$/g, "")
              if (existsSync(p)) return p
            }
          } catch { /* not found in this hive */ }
        }
      }
    } catch { /* no child_process */ }

    // 3. Try 'where' command
    try {
      const { execSync } = require("node:child_process")
      for (const exe of ["chrome.exe", "msedge.exe"]) {
        try {
          const output = execSync(`where ${exe}`, { encoding: "utf-8", windowsHide: true, timeout: 3000 })
          const firstLine = output.split("\n")[0]?.trim()
          if (firstLine && existsSync(firstLine)) return firstLine
        } catch { /* not in PATH */ }
      }
    } catch { /* no child_process */ }
  }

  return null
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

/**
 * Find the extension ID from Chrome's debug endpoint or from profile directory.
 */
async function findExtensionId(profilePath: string): Promise<string | null> {
  // Method 1: Query /json/list for any chrome-extension:// URL
  try {
    const resp = await fetch(`http://127.0.0.1:${browserPort}/json/list`)
    const targets = await resp.json() as Array<{ url?: string; type?: string }>
    for (const t of targets) {
      const match = t.url?.match(/^chrome-extension:\/\/([a-z]{32})\//i)
      if (match) return match[1]
    }
  } catch { /* continue */ }

  // Method 2: Read from profile's Extensions directory
  try {
    const { readdirSync } = require("node:fs")
    const extDir = path.join(profilePath, "Default", "Extensions")
    if (existsSync(extDir)) {
      const ids = readdirSync(extDir).filter((d: string) => /^[a-z]{32}$/i.test(d))
      if (ids.length > 0) return ids[0]
    }
  } catch { /* continue */ }

  // Method 3: Check Local Extension Settings in profile
  try {
    const { readdirSync } = require("node:fs")
    const settingsDir = path.join(profilePath, "Default", "Local Extension Settings")
    if (existsSync(settingsDir)) {
      const ids = readdirSync(settingsDir).filter((d: string) => /^[a-z]{32}$/i.test(d))
      if (ids.length > 0) return ids[0]
    }
  } catch { /* continue */ }

  return null
}

/**
 * The config payload to inject into the extension.
 */
function buildExtensionConfig(runtime: RuntimeConfig, input: FlowBrowserStartInput) {
  return {
    apiBaseUrl: runtime.apiBaseUrl,
    bootstrapToken: runtime.flowBootstrapToken,
    factorySessionId: input.factorySessionId,
    flowUrl: "https://labs.google/fx/tools/flow",
    paired: true,
    autoFactory: true,
  }
}

/**
 * Try to configure the Flow Connector extension.
 * Uses 3 fallback methods:
 *   1. Find service_worker target via puppeteer (fast but unreliable with MV3 suspending)
 *   2. Open extension's options page and inject config via page.evaluate
 *   3. Use CDP to find any extension context
 */
async function configureExtension(runtime: RuntimeConfig, input: FlowBrowserStartInput, timeoutMs = 15_000): Promise<boolean> {
  if (!browserPort) return false
  const config = buildExtensionConfig(runtime, input)
  const profilePath = path.join(getUserDataDir(), "flow-chrome-profile")

  let browser: Awaited<ReturnType<typeof import("puppeteer-core")["connect"]>> | null = null
  try {
    const puppeteer = await import("puppeteer-core")
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${browserPort}` })

    // === Method 1: Find service worker target (works when SW is active) ===
    const swDeadline = Date.now() + Math.min(timeoutMs, 8000)
    while (Date.now() < swDeadline) {
      const swTarget = browser.targets().find((t) =>
        (t.type() === "service_worker" || t.type() === "background_page") &&
        (t.url().includes("/service-worker.js") || t.url().includes("flow"))
      )
      if (swTarget) {
        try {
          const worker = await swTarget.worker()
          if (worker) {
            await worker.evaluate((cfg) => {
              const c = (globalThis as unknown as { chrome: { storage: { local: { set(v: Record<string, unknown>): Promise<void> } } } }).chrome
              void c.storage.local.set(cfg)
            }, config)
            console.log("[Flow] Configured extension via service worker")
            return true
          }
        } catch { /* worker evaluate failed, try next method */ }
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    // === Method 2: Find extension ID, open options page, inject config ===
    const extId = await findExtensionId(profilePath)
    if (extId) {
      console.log("[Flow] Found extension ID:", extId)
      try {
        const optionsUrl = `chrome-extension://${extId}/options.html`
        const page = await browser.newPage()
        try {
          await page.goto(optionsUrl, { waitUntil: "domcontentloaded", timeout: 10_000 })
          await page.evaluate((cfg) => {
            const c = (globalThis as unknown as { chrome: { storage: { local: { set(v: Record<string, unknown>): Promise<void> } } } }).chrome
            if (c?.storage?.local?.set) {
              void c.storage.local.set(cfg)
            }
          }, config)
          console.log("[Flow] Configured extension via options page")
          return true
        } finally {
          await page.close().catch(() => {})
        }
      } catch (e) {
        console.warn("[Flow] Options page method failed:", e)
      }
    }

    // === Method 3: Try any extension target ===
    const extTarget = browser.targets().find((t) =>
      t.url().startsWith("chrome-extension://")
    )
    if (extTarget) {
      try {
        const page = await extTarget.page()
        if (page) {
          await page.evaluate((cfg) => {
            const c = (globalThis as unknown as { chrome: { storage: { local: { set(v: Record<string, unknown>): Promise<void> } } } }).chrome
            if (c?.storage?.local?.set) void c.storage.local.set(cfg)
          }, config)
          console.log("[Flow] Configured extension via existing extension page")
          return true
        }
      } catch { /* last resort failed */ }
    }

    return false
  } catch {
    return false
  } finally {
    try { await browser?.disconnect() } catch { /* ignore */ }
  }
}

/**
 * Keep retrying configureExtension in background every 5s for up to 2 minutes.
 * This lets the user log in first while we wait for the extension to become available.
 */
function tryConfigureInBackground(runtime: RuntimeConfig, input: FlowBrowserStartInput): void {
  let attempts = 0
  const maxAttempts = 24 // 24 × 5s = 2 minutes
  const interval = setInterval(async () => {
    attempts++
    if (!browserProcess || !browserPort || attempts > maxAttempts) {
      clearInterval(interval)
      return
    }
    const ok = await configureExtension(runtime, input, 3000)
    if (ok) {
      clearInterval(interval)
      console.log("[Flow] Extension configured successfully in background (attempt", attempts, ")")
    }
  }, 5000)
}

/**
 * Check if user has logged in to Google in the Flow Chrome profile (on disk).
 */
export function isFlowGoogleLoggedIn(): { loggedIn: boolean; email: string } {
  const profilePath = path.join(getUserDataDir(), "flow-chrome-profile")
  // Check Preferences for Google account_info
  const prefsFiles = [
    path.join(profilePath, "Default", "Preferences"),
    path.join(profilePath, "Preferences"),
  ]
  for (const prefsFile of prefsFiles) {
    if (existsSync(prefsFile)) {
      try {
        const { readFileSync } = require("node:fs")
        const prefs = JSON.parse(readFileSync(prefsFile, "utf-8"))
        const accounts = prefs?.account_info || prefs?.google?.account_info
        if (Array.isArray(accounts) && accounts.length > 0) {
          const email = accounts[0].email || accounts[0].account_id || ""
          if (email) return { loggedIn: true, email }
        }
      } catch { /* continue */ }
    }
  }
  // Check cookies for Google SID/HSID
  const cookieFiles = [
    path.join(profilePath, "Default", "Network", "Cookies"),
    path.join(profilePath, "Default", "Cookies"),
    path.join(profilePath, "Network", "Cookies"),
  ]
  for (const cookieFile of cookieFiles) {
    if (existsSync(cookieFile)) {
      try {
        const { readFileSync } = require("node:fs")
        const buf = readFileSync(cookieFile)
        const str = buf.toString("latin1")
        if (str.includes("__Secure-1PSID") || str.includes("HSID") || str.includes("SSID")) {
          return { loggedIn: true, email: "Google Account" }
        }
      } catch { /* continue */ }
    }
  }
  return { loggedIn: false, email: "" }
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

  // Reuse existing browser if running
  if (browserProcess && browserPort && await waitForDevTools(browserPort, 500)) {
    const ok = await configureExtension(runtime, input, 5000)
    if (ok) return { ok: true, status: "reused", message: "Đã tái sử dụng Chrome Flow profile.", profilePath }
    // Extension not ready but Chrome is alive — start background config retry
    tryConfigureInBackground(runtime, input)
    return { ok: true, status: "reused", message: "Chrome Flow đang chạy. Extension sẽ tự kết nối khi sẵn sàng.", profilePath }
  }

  // Launch new Chrome
  browserPort = await findFreePort("127.0.0.1")
  const args = [
    `--user-data-dir=${profilePath}`,
    `--remote-debugging-port=${browserPort}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    `--load-extension=${extensionPath}`,
    `--disable-extensions-except=${extensionPath}`,
    "--new-window",
    "https://labs.google/fx/tools/flow",
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

  // Try to configure extension — if it fails, DON'T kill Chrome
  // Let the user log in and the background retrier will configure later
  const configured = await configureExtension(runtime, input, 10_000)
  if (configured) {
    return { ok: true, status: "started", message: "Đã mở Chrome Flow profile và nạp Flow Connector.", profilePath }
  }
  // Extension not ready yet but Chrome is alive — start background retry
  tryConfigureInBackground(runtime, input)
  const googleStatus = isFlowGoogleLoggedIn()
  return {
    ok: true,
    status: "started",
    message: googleStatus.loggedIn
      ? `Chrome Flow đã mở. Đăng nhập Google: ${googleStatus.email}. Extension sẽ tự kết nối.`
      : "Chrome Flow đã mở. Hãy đăng nhập Google; extension sẽ tự kết nối khi sẵn sàng.",
    profilePath,
  }
}

function resolveFlowConnectorPath(): string | null {
  // dirnameOf handles both ESM file:// URLs and CJS paths after Vite bundling
  let here: string
  try {
    here = dirnameOf(import.meta.url)
  } catch {
    here = __dirname ?? process.cwd()
  }
  const candidates = [
    // Development: flow-connector at project root (viu-auto-studio/flow-connector)
    path.resolve(process.cwd(), "flow-connector"),
    path.resolve(process.cwd(), "../flow-connector"),
    // Relative to bundled dist-electron/main.mjs → ../../flow-connector
    path.resolve(here, "../../flow-connector"),
    path.resolve(here, "../flow-connector"),
    path.resolve(here, "flow-connector"),
    // Electron packaged app: resources/flow-connector
    path.join(process.resourcesPath || "", "flow-connector"),
    // app.asar.unpacked
    path.join(process.resourcesPath || "", "app.asar.unpacked", "flow-connector"),
  ]
  return candidates.find((candidate) => existsSync(path.join(candidate, "manifest.json"))) || null
}

export function stopFlowBrowser(): void {
  const proc = browserProcess
  browserProcess = null
  browserPort = 0
  if (proc) terminateBrowserTree(proc)
}

export async function logoutFlowBrowser(runtime?: RuntimeConfig): Promise<{ ok: boolean; message: string }> {
  let backendWarning = ""
  if (runtime?.apiBaseUrl && runtime.flowBootstrapToken) {
    try {
      const response = await fetch(`${runtime.apiBaseUrl}/api/flow-connection/logout`, {
        method: "POST",
        headers: { "x-viu-flow-token": runtime.flowBootstrapToken },
      })
      if (!response.ok) backendWarning = `Backend không cập nhật được trạng thái logout (HTTP ${response.status})`
    } catch (error) {
      backendWarning = String(error instanceof Error ? error.message : error)
    }
  }
  stopFlowBrowser()
  await new Promise((resolve) => setTimeout(resolve, process.platform === "win32" ? 800 : 200))
  const profilePath = path.join(getUserDataDir(), "flow-chrome-profile")
  try {
    rmSync(profilePath, { recursive: true, force: true })
  } catch (error) {
    backendWarning = backendWarning || `Không xóa được Chrome profile: ${String(error instanceof Error ? error.message : error)}`
  }
  return { ok: !backendWarning, message: backendWarning || "Đã đăng xuất và xóa Chrome Flow profile riêng." }
}
