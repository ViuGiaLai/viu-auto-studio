import { spawn, execSync, type ChildProcess } from "node:child_process"
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

function findFromWhereCommand(exeName: string): string | null {
  if (process.platform !== "win32") return null
  try {
    const out = execSync(`where ${exeName}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    const firstLine = out.split(/\r?\n/)[0]?.trim()
    if (firstLine && existsSync(firstLine)) return firstLine
  } catch {
    // not in PATH
  }
  return null
}

function findFromRegistry(exeName: string): string | null {
  if (process.platform !== "win32") return null
  for (const hive of ["HKLM", "HKCU"]) {
    try {
      const out = execSync(`reg query "${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}" /ve`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      const match = out.match(/REG_SZ\s+(.+)$/m)
      if (match && match[1]) {
        const cleanPath = match[1].trim().replace(/^"|"$/g, "")
        if (existsSync(cleanPath)) return cleanPath
      }
    } catch {
      // not found in this hive
    }
  }
  return null
}

export function candidateBrowsers(): string[] {
  const env = process.env.VIU_CHROME_PATH || process.env.VIU_BROWSER_PATH
  const values: string[] = env ? [env] : []

  if (process.platform === "win32") {
    // 1. Registry queries (finds custom install paths & enterprise installs)
    const chromeFromReg = findFromRegistry("chrome.exe")
    if (chromeFromReg) values.push(chromeFromReg)
    const edgeFromReg = findFromRegistry("msedge.exe")
    if (edgeFromReg) values.push(edgeFromReg)

    // 2. PATH queries (via where.exe)
    const chromeFromWhere = findFromWhereCommand("chrome.exe")
    if (chromeFromWhere) values.push(chromeFromWhere)
    const edgeFromWhere = findFromWhereCommand("msedge.exe")
    if (edgeFromWhere) values.push(edgeFromWhere)

    // 3. Standard Program Files and LocalAppData locations
    const drive = process.env.SystemDrive || "C:"
    const programFiles = process.env.ProgramFiles || `${drive}\\Program Files`
    const programFilesX86 = process.env["ProgramFiles(x86)"] || `${drive}\\Program Files (x86)`
    const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : "")

    if (programFiles) {
      values.push(
        path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
      )
    }
    if (programFilesX86) {
      values.push(
        path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe")
      )
    }
    if (localAppData) {
      values.push(
        path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
      )
    }
  } else if (process.platform === "darwin") {
    values.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    )
  } else {
    try {
      const whichOut = execSync("which google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser 2>/dev/null", { encoding: "utf8" })
      for (const line of whichOut.split("\n")) {
        const trimmed = line.trim()
        if (trimmed && existsSync(trimmed)) values.push(trimmed)
      }
    } catch { /* proceed */ }
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
    "--new-window",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-features=Translate,OptimizationHints",
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

  // Launch background inspector loop to automatically detect login
  startBackgroundWatcher(provider, port)

  return {
    ok: true,
    status: "started",
    message: `Đã mở cửa sổ ${browserName} riêng để đăng nhập ${provider === "chatgpt" ? "ChatGPT" : "Gemini"}.`,
    profilePath,
    browserName,
  }
}

function startBackgroundWatcher(provider: AiProviderType, port: number): void {
  let count = 0
  const maxAttempts = 90 // 90 * 2s = 3 minutes
  const timer = setInterval(async () => {
    count += 1
    if (count > maxAttempts || !activeBrowsers.has(provider)) {
      clearInterval(timer)
      return
    }
    const status = await inspectAiSession(provider, port)
    if (status.connected) {
      clearInterval(timer)
    }
  }, 2000)
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

          if (provider === "gemini" && (url.includes("gemini.google.com") || url.includes("google.com"))) {
            // 1. Check cookies for Google authentication
            const cookies = await page.cookies().catch(() => [])
            const hasGoogleAuthCookie = cookies.some((c) =>
              c.name === "SID" ||
              c.name === "__Secure-1PSID" ||
              c.name === "__Secure-3PSID" ||
              c.name === "HSID" ||
              c.name === "SSID" ||
              c.name === "OSID" ||
              c.name === "SAPISID"
            )

            // 2. Check DOM for account avatar / email
            const domInfo = await page.evaluate(() => {
              const accountEl = document.querySelector(
                'a[aria-label*="Google Account"], button[aria-label*="Google Account"], a[aria-label*="Tài khoản Google"], button[aria-label*="Tài khoản Google"], [data-email], a[href*="accounts.google.com/SignOutOptions"]'
              )
              const accountText = accountEl ? (accountEl.getAttribute("aria-label") || accountEl.getAttribute("data-email") || accountEl.textContent || "") : ""
              const fullText = document.body ? document.body.innerText : ""
              const match = (accountText + " " + fullText).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
              const hasPrompt = Boolean(
                document.querySelector('[contenteditable="true"]') ||
                document.querySelector('rich-textarea') ||
                document.querySelector('textarea')
              )
              return { hasAccountEl: Boolean(accountEl), email: match ? match[0] : "", hasPrompt }
            }).catch(() => null)

            if (hasGoogleAuthCookie || (domInfo && (domInfo.hasAccountEl || domInfo.email))) {
              const extractedEmail = (domInfo && domInfo.email) || currentStatus.email || "Tài khoản Google"
              currentStatus = {
                connected: true,
                email: extractedEmail,
                model: "3.5 Flash",
                browserRunning: true,
                lastChecked: new Date().toISOString(),
              }
              savedSessions[provider] = currentStatus
              saveSessions(savedSessions)
              return currentStatus
            }
          }

          if (provider === "chatgpt" && (url.includes("chatgpt.com") || url.includes("openai.com"))) {
            // 1. Check cookies for REAL OpenAI authentication
            // NOTE: oai-did, oai-sc, __cf_bm, __cflb, __oailb, g_state are NOT auth cookies
            // They are set for ALL visitors including unauthenticated ones
            const cookies = await page.cookies().catch(() => [])
            const hasRealAuthCookie = cookies.some((c) =>
              c.name === "__Secure-next-auth.session-token" ||
              c.name === "_puid" ||
              c.name === "__Secure-next-auth.callback-url"
            )

            // 2. Check DOM: must NOT have "Log in" button AND must have profile button
            const domInfo = await page.evaluate(() => {
              const hasLoginBtn = Boolean(
                document.querySelector('button[data-testid="login-button"]') ||
                document.querySelector('a[href*="/auth/login"]') ||
                document.querySelector('[data-testid="welcome-login-button"]')
              )
              // Also check visible text for "Log in" / "Sign up" buttons in nav
              const navText = (document.querySelector('nav')?.textContent || "") + " " + (document.querySelector('header')?.textContent || "")
              const hasLoginText = navText.includes("Log in") || navText.includes("Sign up")

              const profileEl = document.querySelector(
                'button[data-testid="profile-button"], [data-testid="user-menu"]'
              )
              const profileText = profileEl ? (profileEl.getAttribute("aria-label") || profileEl.textContent || "") : ""
              const match = profileText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
              return {
                hasLoginBtn: hasLoginBtn || hasLoginText,
                hasProfile: Boolean(profileEl),
                email: match ? match[0] : "",
              }
            }).catch(() => null)

            // Only mark as connected if: real auth cookie exists AND no login button visible
            const isLoggedIn = hasRealAuthCookie && domInfo && !domInfo.hasLoginBtn
            if (isLoggedIn) {
              const extractedEmail = (domInfo && domInfo.email) || currentStatus.email || "Tài khoản OpenAI"
              currentStatus = {
                connected: true,
                email: extractedEmail,
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

function findEmailInProfile(profileDir: string): string {
  try {
    const emailRegex = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g
    const checkPaths = [
      path.join(profileDir, "Default", "Preferences"),
      path.join(profileDir, "Default", "Network", "Network Persistent State"),
    ]
    for (const cp of checkPaths) {
      if (existsSync(cp)) {
        const content = readFileSync(cp, "latin1")
        const matches = content.match(emailRegex)
        if (matches) {
          const valid = matches.find((m) => !m.endsWith(".png") && !m.endsWith(".jpg") && !m.endsWith(".js") && !m.endsWith(".css") && !m.endsWith(".google.com"))
          if (valid) return valid
        }
      }
    }
  } catch {
    // Continue
  }
  return ""
}

export function inspectProfileOnDisk(provider: AiProviderType): AiBrowserStatus {
  const profileDirName = `${provider}-browser-profile`
  const profilePath = path.join(getUserDataDir(), profileDirName)
  if (!existsSync(profilePath)) {
    return { connected: false, browserRunning: activeBrowsers.has(provider) }
  }

  // 1. Check Preferences JSON for Google accounts
  const prefFile = path.join(profilePath, "Default", "Preferences")
  if (existsSync(prefFile)) {
    try {
      const data = JSON.parse(readFileSync(prefFile, "utf8"))
      if (Array.isArray(data.account_info) && data.account_info.length > 0) {
        const acc = data.account_info[0]
        if (acc.email) {
          return {
            connected: true,
            email: acc.email,
            model: "3.5 Flash",
            plan: "Google",
            browserRunning: activeBrowsers.has(provider),
            lastChecked: new Date().toISOString(),
          }
        }
      }
    } catch {
      // Continue
    }
  }

  // 2. Deep scan for email and auth cookies in files
  const cookieFiles = [
    path.join(profilePath, "Default", "Network", "Cookies"),
    path.join(profilePath, "Network", "Cookies"),
    path.join(profilePath, "Default", "Cookies"),
  ]
  for (const cookieFile of cookieFiles) {
    if (existsSync(cookieFile)) {
      try {
        const buf = readFileSync(cookieFile)
        const str = buf.toString("latin1")
        if (provider === "gemini") {
          if (str.includes("SID") || str.includes("__Secure-1PSID") || str.includes("HSID") || str.includes("SSID")) {
            const email = findEmailInProfile(profilePath) || "Tài khoản Google"
            return {
              connected: true,
              email,
              model: "3.5 Flash",
              browserRunning: activeBrowsers.has(provider),
              lastChecked: new Date().toISOString(),
            }
          }
        } else if (provider === "chatgpt") {
          // ONLY __Secure-next-auth.session-token and _puid are REAL auth cookies
          // oai-did, oai-sc, __cf_bm, __cflb, __oailb, g_state are NOT — they exist for ALL visitors
          if (str.includes("__Secure-next-auth.session-token") || str.includes("_puid")) {
            const email = findEmailInProfile(profilePath) || "Tài khoản ChatGPT"
            return {
              connected: true,
              email,
              plan: "Plus/Free",
              browserRunning: activeBrowsers.has(provider),
              lastChecked: new Date().toISOString(),
            }
          }
        }
      } catch {
        // Continue
      }
    }
  }

  return { connected: false, browserRunning: activeBrowsers.has(provider) }
}

export async function getAiBrowserStatus(provider: AiProviderType): Promise<AiBrowserStatus> {
  const running = activeBrowsers.get(provider)
  if (running) {
    const live = await inspectAiSession(provider, running.port)
    if (live.connected) return live
  }

  // Check on disk directly
  const diskStatus = inspectProfileOnDisk(provider)
  if (diskStatus.connected) {
    const saved = readSavedSessions()
    saved[provider] = diskStatus
    saveSessions(saved)
    return diskStatus
  }

  const saved = readSavedSessions()
  const current = saved[provider] || { connected: false }
  current.browserRunning = Boolean(running)
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
