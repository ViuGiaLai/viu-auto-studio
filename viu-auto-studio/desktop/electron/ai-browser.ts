import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import path from "node:path"
import { findFreePort, getUserDataDir } from "./runtime-config"

export type AiProviderType = "chatgpt" | "gemini"

export type AiBrowserStatus = {
  connected: boolean
  email?: string
  model?: string
  plan?: string
  browserRunning?: boolean
  message?: string
  lastChecked?: string
}

type RunningBrowser = {
  process: ChildProcess
  port: number
  provider: AiProviderType
  profilePath: string
}

const activeBrowsers = new Map<AiProviderType, RunningBrowser>()

function terminateProcess(proc: ChildProcess): void {
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

export function candidateBrowsers(): string[] {
  const env = process.env.VIU_CHROME_PATH || process.env.VIU_BROWSER_PATH
  const values: string[] = env ? [env] : []

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

  return [...new Set(values)].filter((candidate) => existsSync(candidate))
}

function findBrowserPath(): string | null {
  const candidates = candidateBrowsers()
  return candidates[0] || null
}

function getSessionsFilePath(): string {
  return path.join(getUserDataDir(), "ai-browser-sessions.json")
}

function readSavedSessions(): Record<string, AiBrowserStatus> {
  try {
    const file = getSessionsFilePath()
    if (existsSync(file)) {
      const data = readFileSync(file, "utf8")
      return JSON.parse(data)
    }
  } catch {
    // Ignore read errors
  }
  return {}
}

function saveSessions(sessions: Record<string, AiBrowserStatus>): void {
  try {
    const file = getSessionsFilePath()
    writeFileSync(file, JSON.stringify(sessions, null, 2), "utf8")
  } catch (err) {
    console.error("[AiBrowser] Failed to save sessions:", err)
  }
}

async function waitForPort(port: number, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return true
    } catch {
      // Waiting
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

export async function openAiBrowser(provider: AiProviderType): Promise<{
  ok: boolean
  status: string
  message: string
  profilePath?: string
  browserName?: string
}> {
  const browserPath = findBrowserPath()
  if (!browserPath) {
    return {
      ok: false,
      status: "unavailable",
      message: "Không tìm thấy trình duyệt Google Chrome hoặc Microsoft Edge trên máy. Vui lòng cài đặt Chrome hoặc Edge.",
    }
  }

  const profileDirName = `${provider}-browser-profile`
  const profilePath = path.join(getUserDataDir(), profileDirName)
  mkdirSync(profilePath, { recursive: true })

  const targetUrl = provider === "chatgpt" ? "https://chatgpt.com/" : "https://gemini.google.com/app"
  const browserName = browserPath.toLowerCase().includes("edge") || browserPath.toLowerCase().includes("msedge") ? "Microsoft Edge" : "Google Chrome"

  // If browser is already running on port, focus / reuse
  const existing = activeBrowsers.get(provider)
  if (existing && (await waitForPort(existing.port, 500))) {
    try {
      const puppeteer = await import("puppeteer-core")
      const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${existing.port}` })
      const pages = await browser.pages()
      if (pages.length > 0) {
        await pages[0].bringToFront()
      }
      await browser.disconnect()
      return {
        ok: true,
        status: "reused",
        message: `Đã chuyển tới cửa sổ ${browserName} của ${provider === "chatgpt" ? "ChatGPT" : "Gemini"}.`,
        profilePath,
        browserName,
      }
    } catch {
      // Re-launch if connect fails
    }
  }

  const port = await findFreePort("127.0.0.1")
  const args = [
    `--user-data-dir=${profilePath}`,
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--window-size=1280,800",
    targetUrl,
  ]

  const child = spawn(browserPath, args, { detached: false, windowsHide: false, stdio: "ignore" })
  const running: RunningBrowser = { process: child, port, provider, profilePath }
  activeBrowsers.set(provider, running)

  child.once("exit", () => {
    if (activeBrowsers.get(provider)?.process === child) {
      activeBrowsers.delete(provider)
    }
  })

  // Short wait for port
  const ready = await waitForPort(port, 4000)
  if (!ready && child.exitCode !== null) {
    activeBrowsers.delete(provider)
    return {
      ok: false,
      status: "closed",
      message: `Trình duyệt đã bị đóng.`,
      profilePath,
      browserName,
    }
  }

  // Launch background inspector to automatically detect user login
  void inspectAiSession(provider, port).catch(() => {})

  return {
    ok: true,
    status: "started",
    message: `Đã mở cửa sổ ${browserName} riêng để đăng nhập ${provider === "chatgpt" ? "ChatGPT" : "Gemini"}.`,
    profilePath,
    browserName,
  }
}

export async function inspectAiSession(provider: AiProviderType, port?: number): Promise<AiBrowserStatus> {
  const running = activeBrowsers.get(provider)
  const targetPort = port || running?.port

  const savedSessions = readSavedSessions()
  let currentStatus: AiBrowserStatus = savedSessions[provider] || { connected: false }

  if (targetPort && (await waitForPort(targetPort, 500))) {
    try {
      const puppeteer = await import("puppeteer-core")
      const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${targetPort}` })
      try {
        const pages = await browser.pages()
        for (const page of pages) {
          const url = page.url()

          if (provider === "gemini" && url.includes("gemini.google.com")) {
            // Check Gemini login state in page
            const info = await page.evaluate(() => {
              const text = document.body ? document.body.innerText : ""
              const hasSignInBtn = Boolean(
                document.querySelector('a[href*="accounts.google.com/ServiceLogin"]') ||
                document.querySelector('button[aria-label*="Sign in"]') ||
                text.includes("Sign in to save activity") ||
                text.includes("Đăng nhập để lưu hoạt động")
              )
              const hasPromptInput = Boolean(
                document.querySelector('[contenteditable="true"]') ||
                document.querySelector('textarea') ||
                document.querySelector('rich-textarea')
              )
              const emailEl = document.querySelector('button[aria-label*="@"], a[aria-label*="@"], [data-email]')
              const email = emailEl ? (emailEl.getAttribute("data-email") || emailEl.getAttribute("aria-label") || "") : ""
              return { hasSignInBtn, hasPromptInput, email }
            }).catch(() => null)

            if (info && !info.hasSignInBtn && info.hasPromptInput) {
              let extractedEmail = ""
              if (info.email) {
                const match = info.email.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
                if (match) extractedEmail = match[0]
              }
              currentStatus = {
                connected: true,
                email: extractedEmail || currentStatus.email || "Gemini Account",
                model: "3.5 Flash",
                browserRunning: true,
                lastChecked: new Date().toISOString(),
              }
              savedSessions[provider] = currentStatus
              saveSessions(savedSessions)
              return currentStatus
            }
          }

          if (provider === "chatgpt" && url.includes("chatgpt.com")) {
            // Check ChatGPT login state in page
            const info = await page.evaluate(() => {
              const text = document.body ? document.body.innerText : ""
              const hasLoginBtn = Boolean(
                document.querySelector('button[data-testid="login-button"]') ||
                document.querySelector('a[href*="/auth/login"]') ||
                text.includes("Log in") ||
                text.includes("Đăng nhập")
              )
              const hasProfile = Boolean(
                document.querySelector('button[data-testid="profile-button"]') ||
                document.querySelector('[aria-label*="User"]') ||
                document.querySelector('[aria-label*="Profile"]') ||
                document.querySelector('#prompt-textarea')
              )
              const profileEl = document.querySelector('button[data-testid="profile-button"]')
              const email = profileEl ? (profileEl.getAttribute("aria-label") || profileEl.textContent || "") : ""
              return { hasLoginBtn, hasProfile, email }
            }).catch(() => null)

            if (info && info.hasProfile && !info.hasLoginBtn) {
              let extractedEmail = ""
              if (info.email) {
                const match = info.email.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
                if (match) extractedEmail = match[0]
              }
              currentStatus = {
                connected: true,
                email: extractedEmail || currentStatus.email || "rmahviu05.gl@gmail.com",
                plan: "Plus/Free",
                browserRunning: true,
                lastChecked: new Date().toISOString(),
              }
              savedSessions[provider] = currentStatus
              saveSessions(savedSessions)
              return currentStatus
            }
          }
        }
      } finally {
        await browser.disconnect()
      }
    } catch {
      // Connect / inspect error
    }
  }

  currentStatus.browserRunning = Boolean(running)
  return currentStatus
}

export async function getAiBrowserStatus(provider: AiProviderType): Promise<AiBrowserStatus> {
  const saved = readSavedSessions()
  const current = saved[provider] || { connected: false }
  const running = activeBrowsers.get(provider)
  current.browserRunning = Boolean(running)

  // If browser is active, do a live inspection
  if (running) {
    return inspectAiSession(provider, running.port)
  }
  return current
}

export async function logoutAiBrowser(provider: AiProviderType): Promise<{ ok: boolean; message: string }> {
  const running = activeBrowsers.get(provider)
  if (running) {
    terminateProcess(running.process)
    activeBrowsers.delete(provider)
  }

  // Small delay to allow Chrome process termination before wiping folder
  await new Promise((r) => setTimeout(r, 400))

  const profileDirName = `${provider}-browser-profile`
  const profilePath = path.join(getUserDataDir(), profileDirName)
  try {
    if (existsSync(profilePath)) {
      rmSync(profilePath, { recursive: true, force: true })
    }
  } catch (err) {
    console.warn(`[AiBrowser] Could not completely wipe profile ${profileDirName}:`, err)
  }

  const saved = readSavedSessions()
  saved[provider] = {
    connected: false,
    email: undefined,
    browserRunning: false,
    lastChecked: new Date().toISOString(),
  }
  saveSessions(saved)

  return {
    ok: true,
    message: `Đã đăng xuất và xóa sạch dữ liệu phiên ${provider === "chatgpt" ? "ChatGPT" : "Gemini"}.`,
  }
}

export function stopAllAiBrowsers(): void {
  for (const [provider, running] of activeBrowsers.entries()) {
    terminateProcess(running.process)
    activeBrowsers.delete(provider)
  }
}
