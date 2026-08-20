import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from "electron"
import path from "node:path"
import http from "node:http"
import fs from "node:fs"
import { startBackend, stopBackend } from "./backend-manager"
import { startFlowBrowser, stopFlowBrowser } from "./flow-browser"
import { openAiBrowser, getAiBrowserStatus, logoutAiBrowser, stopAllAiBrowsers, type AiProviderType } from "./ai-browser"
import { readRuntimeConfig, getUserDataDir, dirnameOf, findFreePort } from "./runtime-config"

// __dirname an toàn cho ESM (file: protocol) — preload + dist index.html
const HERE = dirnameOf(import.meta.url)

// Allow loading from the local dev server in development
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let uiServer: http.Server | null = null
let uiBaseUrl = ""

/**
 * Giao diện được phục vụ qua HTTP local thay vì file:// vì:
 * file:// không tải được module script cross-origin và fetch sang http:// backend
 * bị chặn bởi CORS mặc định. Một HTTP server nội bộ trên port trống giải quyết sạch.
 */
async function startUiServer(): Promise<string> {
  const port = await findFreePort("127.0.0.1")
  const distDir = path.join(HERE, "../dist")
  uiServer = http.createServer((req, res) => {
    let urlPath = req.url ? req.url.split("?")[0] : "/index.html"
    if (urlPath === "/") urlPath = "/index.html"
    const safe = path.normalize(urlPath).replace(/^\.\.(\/|\\|$)/, "")
    const file = path.join(distDir, safe)
    if (!file.startsWith(distDir)) {
      res.writeHead(403)
      res.end("forbidden")
      return
    }
    if (!fs.existsSync(file)) {
      // SPA fallback: chỉ cho điều hướng trang (accept: text/html), không áp
      // dụng cho tài sản tĩnh (js/css/png...) để tránh MIME type sai
      const accept = (req.headers?.accept || "") as string
      const wantsHtml = accept.includes("text/html")
      if (wantsHtml) {
        const fallback = path.join(distDir, "index.html")
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        fs.createReadStream(fallback).pipe(res)
        return
      }
      res.writeHead(404)
      res.end("not found")
      return
    }
    const ext = path.extname(file).toLowerCase()
    const ct: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
    }
    res.writeHead(200, { "content-type": ct[ext] || "application/octet-stream" })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise<void>((resolve) => {
    uiServer!.listen(port, "127.0.0.1", () => resolve())
  })
  uiBaseUrl = `http://127.0.0.1:${port}`
  console.log(`[Main] Giao diện phục vụ tại ${uiBaseUrl}`)
  return `${uiBaseUrl}/index.html`
}

function stopUiServer(): void {
  if (uiServer) {
    uiServer.close()
    uiServer = null
  }
}

function createWindow(): void {
  const captureDir = process.env.VIU_CAPTURE_DIR
  console.log("[Main] capture env", JSON.stringify({ captureDir, uiSmoke: process.env.VIU_UI_SMOKE, vite: VITE_DEV_SERVER_URL }))
  // Preload được xuất CJS để Electron nạp ổn định trong package ESM.
  const preloadPath = path.join(HERE, "preload.cjs")
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1366,
    minHeight: 768,
    backgroundColor: "#0a1020",
    // hiddenInset không hoạt động đúng trên X11 (menu/menu-bar mất hoặc màn hình đen);
    // giữ thanh tiêu đề mặc định để tương thích Linux desktop.
    show: false,
    ...(captureDir ? { frame: false } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Disable default generic menu bar (File Edit View Window Help)
  mainWindow.setMenuBarVisibility(false)
  Menu.setApplicationMenu(null)

  // Redirect ALL external web links & window.open calls to real system browser (Chrome/Edge)
  // NEVER spawn an embedded Electron child window with generic menu bar
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:") || url.startsWith("mailto:")) {
      void shell.openExternal(url)
    }
    return { action: "deny" }
  })

  mainWindow.webContents.on("console-message", (_event, _level, message, line, sourceId) => {
    if (message.toLowerCase().includes("error") || message.toLowerCase().includes("exception")) {
      console.error(`[RendererConsole] ${message} (${sourceId}:${line})`)
    }
  })

  mainWindow.on("ready-to-show", () => {
    if (!captureDir) mainWindow.show()
  })

  if (captureDir) {
    console.log("[Capture] enabled", captureDir, "uiSmoke=", process.env.VIU_UI_SMOKE)
    const routes = ["", "projects", "projects/new", "studio", "queue", "library", "voices", "characters", "flow", "analytics", "settings", "guide"]
        mainWindow.webContents.once("did-finish-load", async () => {

      try {
        fs.mkdirSync(captureDir, { recursive: true })
        mainWindow.setContentSize(1920, 1080)
        const base = VITE_DEV_SERVER_URL || uiBaseUrl
        await new Promise((resolve) => setTimeout(resolve, 1200))
        if (process.env.VIU_UI_SMOKE !== "1" && process.env.VIU_CHANNEL_CONFIG_SMOKE !== "1" && process.env.VIU_PROJECTS_SMOKE !== "1") for (const route of routes) {
          if (route) {
            await mainWindow.loadURL(`${base}/${route}`)
            await new Promise((resolve) => setTimeout(resolve, 1200))
          }
          const image = await mainWindow.webContents.capturePage()
          const name = route ? route.replace(/\//g, "-") : "dashboard"
          fs.writeFileSync(path.join(captureDir, `${name}.png`), image.toPNG())
          console.log(`[Capture] ${name}.png`)
        }

        if (process.env.VIU_PROJECTS_SMOKE === "1") {
          const projectsStarted = Date.now()
          await mainWindow.loadURL(`${base}/projects`)
          const loadUrlMs = Date.now() - projectsStarted
          const dataReady = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
            const started = performance.now()
            const check = () => {
              const search = document.querySelector('input[placeholder*="Tìm kiếm dự án"]')
              const skeletons = [...document.querySelectorAll('.animate-pulse')].filter((node) => node.getClientRects().length)
              if (search && skeletons.length === 0) {
                resolve({ readyMs: Math.round(performance.now() - started), skeletons: 0, cards: document.querySelectorAll('a[href^="/projects/"]:not([href="/projects/new"])').length })
              } else {
                setTimeout(check, 25)
              }
            }
            check()
          })`)
          const projectImage = await mainWindow.webContents.capturePage()
          fs.writeFileSync(path.join(captureDir, "projects-page-after-load.png"), projectImage.toPNG())
          fs.writeFileSync(path.join(captureDir, "projects-load-result.json"), JSON.stringify({ loadUrlMs, dataReady }, null, 2), "utf8")
          console.log(`[ProjectsSmoke] ${JSON.stringify({ loadUrlMs, dataReady })}`)
        }

        if (process.env.VIU_UI_SMOKE === "1") {
          const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
          const setControlValue = async (selector: string, value: string) => {
            await mainWindow.webContents.executeJavaScript(`(() => {
              const el = document.querySelector(${JSON.stringify(selector)})
              if (!el) throw new Error("Không tìm thấy control: " + ${JSON.stringify(selector)})
              el.focus()
              if (typeof el.select === "function") el.select()
              else if (el instanceof HTMLTextAreaElement) el.setSelectionRange(0, el.value.length)
            })()`)
            await mainWindow.webContents.insertText(value)
            return mainWindow.webContents.executeJavaScript(`(() => {
              const el = document.querySelector(${JSON.stringify(selector)})
              return el?.value || ""
            })()`)
          }
          const setNumberValue = async (selector: string, value: string) => {
            await mainWindow.webContents.executeJavaScript(`(() => {
              const el = document.querySelector(${JSON.stringify(selector)})
              if (!el) throw new Error("Không tìm thấy number control: " + ${JSON.stringify(selector)})
              el.focus()
              if (typeof el.select === "function") el.select()
            })()`)
            for (const key of value) {
              await mainWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: key })
              await mainWindow.webContents.sendInputEvent({ type: "char", keyCode: key })
              await mainWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: key })
            }
            await mainWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "TAB" })
            await mainWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "TAB" })
            await wait(300)
            return mainWindow.webContents.executeJavaScript(`(() => document.querySelector(${JSON.stringify(selector)})?.value || "")()`)
          }
          const clickButton = async (text: string) => {
            await mainWindow.webContents.executeJavaScript(`(() => {
              const target = [...document.querySelectorAll("button")].find((node) => (node.textContent || "").includes(${JSON.stringify(text)}))
              if (!target) throw new Error("Không tìm thấy nút: " + ${JSON.stringify(text)})
              target.click()
              return true
            })()`)
          }
          const clickTab = async (text: string) => {
            return mainWindow.webContents.executeJavaScript(`(() => {
              const target = [...document.querySelectorAll('button[role="tab"]')].find((node) => (node.textContent || "").includes(${JSON.stringify(text)}))
              if (!target) throw new Error("Không tìm thấy tab: " + ${JSON.stringify(text)})
              target.click()
              return { text: target.textContent || "", value: target.getAttribute("data-value"), selected: target.getAttribute("aria-selected") }
            })()`)
          }
          const readUiState = async () => mainWindow.webContents.executeJavaScript(`(() => ({
            url: location.href,
            tabs: [...document.querySelectorAll('button[role="tab"]')].map((node) => ({ text: node.textContent || "", selected: node.getAttribute("aria-selected") })),
            inputs: [...document.querySelectorAll('input')].map((node) => ({ type: node.type, min: node.min, value: node.value, visible: Boolean(node.getClientRects().length) })),
            buttons: [...document.querySelectorAll('button')].filter((node) => Boolean(node.getClientRects().length)).map((node) => ({ text: (node.textContent || "").trim(), disabled: node.disabled })).slice(-40),
          }))()`)

          await mainWindow.loadURL(`${base}/projects/new`)
          await wait(1200)
          await setControlValue('input[placeholder*="Smart Living"]', "UI Smoke Project")
          await clickButton("Tiếp tục:")
          await wait(350)
          await clickButton("Tiếp tục:")
          await wait(350)
          await clickButton("Tiếp tục:")
          await wait(350)
          await clickButton("Tạo dự án & mở Studio")
          await wait(1800)
          await mainWindow.webContents.capturePage().then((image) => fs.writeFileSync(path.join(captureDir, "ui-smoke-project-editor.png"), image.toPNG()))

          await clickButton("Tự dán kịch bản")
          await wait(300)
          const typedValue = await setControlValue("textarea", "Đây là cảnh mở đầu của video.\nĐây là cảnh chính với thông tin quan trọng.\nĐây là phần kết thúc và lời kêu gọi hành động.")
          fs.writeFileSync(path.join(captureDir, "ui-smoke-after-type.json"), JSON.stringify({ typedValue }, null, 2), "utf8")
          await mainWindow.webContents.capturePage().then((image) => fs.writeFileSync(path.join(captureDir, "ui-smoke-after-type.png"), image.toPNG()))
          await clickButton("Import kịch bản")
          await wait(1200)
          await clickButton("Chia thành phân cảnh")
          await wait(1800)

          const editorUrl = mainWindow.webContents.getURL()
          const smokeProjectId = Number(editorUrl.match(/\/projects\/(\d+)/)?.[1] || 0)
          const clickedTab = await clickTab("Dựng phim")
          await wait(1000)
          await mainWindow.webContents.capturePage().then((image) => fs.writeFileSync(path.join(captureDir, "ui-smoke-timeline-before.png"), image.toPNG()))
          fs.writeFileSync(path.join(captureDir, "ui-smoke-before-duration.json"), JSON.stringify({ clickedTab, ui: await readUiState() }, null, 2), "utf8")
          await wait(300)
          const durationValue = await setNumberValue('input[type="number"][min="0.1"]', "60")
          fs.writeFileSync(path.join(captureDir, "ui-smoke-duration-after-input.json"), JSON.stringify({ durationValue, ui: await readUiState() }, null, 2), "utf8")
          if (String(durationValue) !== "60") throw new Error(`Duration không cập nhật qua input thật: ${durationValue}`)
          await wait(500)
          await clickButton("Lưu timeline")
          await wait(2000)
          const afterSaveUi = await mainWindow.webContents.executeJavaScript(`(() => ({
            bodyText: document.body.innerText,
            savedBadge: [...document.querySelectorAll("span,div")].map((node) => ({ text: (node.textContent || "").trim(), className: String(node.className || "") })).find((item) => item.text.includes("Đã lưu") && item.text.length < 80) || null,
          }))()`)
          fs.writeFileSync(path.join(captureDir, "ui-smoke-after-save.json"), JSON.stringify(afterSaveUi, null, 2), "utf8")
          const saveConfirmed = Boolean(afterSaveUi.savedBadge) || afterSaveUi.bodyText.includes("Đã lưu timeline")
          if (!saveConfirmed) throw new Error("UI chưa xác nhận đã lưu timeline sau PUT")
          await mainWindow.webContents.capturePage().then((image) => fs.writeFileSync(path.join(captureDir, "ui-smoke-timeline-after.png"), image.toPNG()))
          const clickedPublishTab = await clickTab("Xuất bản")
          await wait(500)
          const publishTabBeforePolling = await readUiState()
          await wait(5000)
          const publishTabAfterPolling = await readUiState()
          fs.writeFileSync(path.join(captureDir, "ui-smoke-publish-tab-stability.json"), JSON.stringify({ clickedPublishTab, before: publishTabBeforePolling, after: publishTabAfterPolling }, null, 2), "utf8")
          const publishSelected = (publishTabAfterPolling.tabs || []).some((tab: { selected?: string; text?: string }) => tab.selected === "true" && (tab.text || "").includes("Xuất bản"))
          if (!publishSelected) throw new Error("Tab Xuất bản bị tự chuyển sau khi polling")
          await mainWindow.webContents.capturePage().then((image) => fs.writeFileSync(path.join(captureDir, "ui-smoke-publish-tab-after.png"), image.toPNG()))
          fs.writeFileSync(path.join(captureDir, "ui-smoke-result.json"), JSON.stringify({ projectId: smokeProjectId, editorUrl }, null, 2), "utf8")
        }

        if (process.env.VIU_CHANNEL_CONFIG_SMOKE === "1") {
          const waitChannel = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
          const requestChannelApi = async (pathName: string, init?: RequestInit) => {
            const runtime = readRuntimeConfig()
            if (!runtime?.apiBaseUrl) throw new Error("Backend runtime chưa sẵn sàng")
            const response = await fetch(`${runtime.apiBaseUrl}/api${pathName}`, init)
            const body = await response.text()
            if (!response.ok) throw new Error(`${response.status}: ${body}`)
            return body ? JSON.parse(body) : null
          }
          const clickChannelButton = async (text: string) => {
            await mainWindow.webContents.executeJavaScript(`(() => {
              const target = [...document.querySelectorAll("button")].find((node) => (node.textContent || "").includes(${JSON.stringify(text)}))
              if (!target) throw new Error("Không tìm thấy nút: " + ${JSON.stringify(text)})
              target.click()
              return true
            })()`)
          }
          const setChannelControl = async (selector: string, value: string) => {
            await mainWindow.webContents.executeJavaScript(`(() => {
              const el = document.querySelector(${JSON.stringify(selector)})
              if (!el) throw new Error("Không tìm thấy control: " + ${JSON.stringify(selector)})
              el.focus()
              if (typeof el.select === "function") el.select()
            })()`)
            await mainWindow.webContents.insertText(value)
          }
          const channel = await requestChannelApi("/channels", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Electron Channel Config Smoke", description: "fixture", niche: "fixture" }),
          }) as { id: number }
          const channelProject = await requestChannelApi("/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Electron Channel Config Project", channel_id: channel.id, topic: "fixture", video_type: "long", aspect_ratio: "16:9", language: "vi", target_duration: 60, project_type: "ai_studio" }),
          }) as { id: number }
          await mainWindow.loadURL(`${base}/projects/${channelProject.id}`)
          await waitChannel(1500)
          const headerState = await mainWindow.webContents.executeJavaScript(`(() => ({
            buttons: [...document.querySelectorAll("button")].map((node) => (node.textContent || "").trim()),
            url: location.href,
          }))()`)
          const requiredHeaderButtons = ["Dự án", "Cấu hình kênh", "Thư mục dự án", "Đổi thư mục"]
          if (requiredHeaderButtons.some((label) => !headerState.buttons.some((text: string) => text.includes(label)))) {
            throw new Error("Thiếu nút header dự án: " + requiredHeaderButtons.join(", "))
          }
          await clickChannelButton("Dự án")
          await waitChannel(500)
          if (!mainWindow.webContents.getURL().endsWith("/projects")) throw new Error("Nút Dự án không điều hướng về danh sách dự án")
          await mainWindow.loadURL(`${base}/projects/${channelProject.id}`)
          await waitChannel(1200)
          await clickChannelButton("Thư mục dự án")
          await waitChannel(500)
          fs.writeFileSync(path.join(captureDir, "project-header-result.json"), JSON.stringify({ headerState, projectsUrl: mainWindow.webContents.getURL(), folderActionTriggered: true }, null, 2), "utf8")
          await clickChannelButton("Cấu hình kênh")
          await waitChannel(700)
          await mainWindow.webContents.capturePage().then((image) => fs.writeFileSync(path.join(captureDir, "channel-config-before.png"), image.toPNG()))
          await setChannelControl('input[placeholder*="Siberia"]', "Sinh tồn điện ảnh vùng băng giá")
          await clickChannelButton("Sắc gọn kiểu tin tức")
          await setChannelControl('textarea[placeholder*="kể chuyện sinh tồn"]', "Kênh kể chuyện có nhịp nhanh, câu ngắn, ưu tiên dữ kiện kiểm chứng và kết thúc rõ ràng.")
          await clickChannelButton("Test kết nối")
          await waitChannel(700)
          await clickChannelButton("Lưu cấu hình")
          await waitChannel(1200)
          await mainWindow.loadURL(`${base}/projects/${channelProject.id}`)
          await waitChannel(1200)
          await clickChannelButton("Cấu hình kênh")
          await waitChannel(700)
          const persistedConfig = await mainWindow.webContents.executeJavaScript(`(() => ({
            niche: document.querySelector('input[placeholder*="Siberia"]')?.value || "",
            description: document.querySelector('textarea[placeholder*="kể chuyện sinh tồn"]')?.value || "",
            bodyText: document.body.innerText,
          }))()`)
          fs.writeFileSync(path.join(captureDir, "channel-config-after-reload.png"), (await mainWindow.webContents.capturePage()).toPNG())
          fs.writeFileSync(path.join(captureDir, "channel-config-result.json"), JSON.stringify({ channelId: channel.id, projectId: channelProject.id, persistedConfig }, null, 2), "utf8")
          const persisted = persistedConfig.niche === "Sinh tồn điện ảnh vùng băng giá" && persistedConfig.description.includes("nhịp nhanh")
          if (!persisted) throw new Error("Cấu hình kênh không persistence sau reload")
          await clickChannelButton("Đóng")
          const unchannelProject = await requestChannelApi("/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Electron Unattached Project", topic: "fixture", video_type: "long", aspect_ratio: "16:9", language: "vi", target_duration: 60, project_type: "ai_studio" }),
          }) as { id: number }
          await mainWindow.loadURL(`${base}/projects/${unchannelProject.id}`)
          await waitChannel(1200)
          await clickChannelButton("Cấu hình kênh")
          await waitChannel(900)
          const projectScopedBody = await mainWindow.webContents.executeJavaScript(`document.body.innerText`)
          const projectScopedBodyNormalized = String(projectScopedBody).toLocaleLowerCase("vi-VN")
          if (!projectScopedBodyNormalized.includes("electron unattached project") || !projectScopedBodyNormalized.includes("cấu hình riêng") || !projectScopedBodyNormalized.includes("bộ não ai, giọng")) throw new Error("Cấu hình project không mở trực tiếp khi chưa gắn channel")
          await setChannelControl('input[placeholder*="Siberia"]', "Cấu hình riêng của project hiện tại")
          await clickChannelButton("Lưu cấu hình")
          await waitChannel(900)
          await mainWindow.loadURL(`${base}/projects/${unchannelProject.id}`)
          await waitChannel(1200)
          await clickChannelButton("Cấu hình kênh")
          await waitChannel(700)
          const projectConfigPersisted = await mainWindow.webContents.executeJavaScript(`(() => ({ niche: document.querySelector('input[placeholder*="Siberia"]')?.value || "", bodyText: document.body.innerText }))()`)
          fs.writeFileSync(path.join(captureDir, "project-scoped-config-result.json"), JSON.stringify({ projectId: unchannelProject.id, projectConfigPersisted }, null, 2), "utf8")
          if (projectConfigPersisted.niche !== "Cấu hình riêng của project hiện tại") throw new Error("Cấu hình project không persistence sau reload")
          await clickChannelButton("Đóng")
          await requestChannelApi(`/projects/${unchannelProject.id}`, { method: "DELETE" })
          await requestChannelApi(`/projects/${channelProject.id}`, { method: "DELETE" })
          await requestChannelApi(`/channels/${channel.id}`, { method: "DELETE" })
          fs.writeFileSync(path.join(captureDir, "channel-config-cleanup.json"), JSON.stringify({ cleaned: true, channelId: channel.id, projectId: channelProject.id, unchannelProjectId: unchannelProject.id }, null, 2), "utf8")
        }

        const projectId = process.env.VIU_CAPTURE_PROJECT_ID
        if (projectId) {
          await mainWindow.loadURL(`${base}/projects/${projectId}`)
          await new Promise((resolve) => setTimeout(resolve, 1500))
          const stages = ["Ý tưởng", "Kịch bản & Giọng", "Phân cảnh Visual", "Nhân vật", "Media", "Dựng phim", "Xuất bản"]
          for (let index = 0; index < stages.length; index += 1) {
            const label = stages[index]
            await mainWindow.webContents.executeJavaScript(`(() => { const el = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes(${JSON.stringify(label)})); if (!el) throw new Error('Không tìm thấy bước: ' + ${JSON.stringify(label)}); el.click(); })()`)
            await new Promise((resolve) => setTimeout(resolve, 800))
            const image = await mainWindow.webContents.capturePage()
            fs.writeFileSync(path.join(captureDir, `studio-${index + 1}.png`), image.toPNG())
            console.log(`[Capture] studio-${index + 1}.png`)
          }
        }
      } catch (error) {
        console.error("[Capture] failed:", error)
        process.exitCode = 1
      } finally {
        app.quit()
      }
    })
  }

  // Load only after the capture listener is registered; otherwise the first
  // did-finish-load event can be missed and UI automation never starts.
  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: "detach" })
  } else if (uiBaseUrl) {
    void mainWindow.loadURL(`${uiBaseUrl}/index.html`)
  } else {
    void mainWindow.loadFile(path.join(HERE, "../dist/index.html"))
  }
}

// IPC helpers exposed to the renderer
ipcMain.handle("ping", async () => true)
ipcMain.handle("getRuntimeConfig", async () => readRuntimeConfig())
ipcMain.handle("flow:start", async (_event, input: { projectId: number; factorySessionId: string }) => {
  const runtime = readRuntimeConfig()
  if (!runtime) return { ok: false, status: "failed", message: "Runtime backend chưa sẵn sàng" }
  return startFlowBrowser(runtime, input)
})
ipcMain.handle("flow:stop", async () => {
  stopFlowBrowser()
  return { ok: true }
})
ipcMain.handle("getUserDataDir", async () => getUserDataDir())
ipcMain.handle("dialog:select-directory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] })
  return result.canceled ? null : result.filePaths[0] || null
})
ipcMain.handle("open:external", (_e, url: string) => {
  void shell.openExternal(url)
})
ipcMain.handle("shell:open-path", async (_e, target: string) => {
  const targetPath = String(target || "").trim()
  if (!targetPath) return { ok: false, message: "Đường dẫn trống" }
  const error = await shell.openPath(targetPath)
  return { ok: !error, message: error || "" }
})

ipcMain.handle("aiBrowser:open", async (_event, input: { provider: AiProviderType }) => {
  return openAiBrowser(input.provider)
})
ipcMain.handle("aiBrowser:status", async (_event, input: { provider: AiProviderType }) => {
  return getAiBrowserStatus(input.provider)
})
ipcMain.handle("aiBrowser:logout", async (_event, input: { provider: AiProviderType }) => {
  return logoutAiBrowser(input.provider)
})

// Máy không có GPU / Xvfb: chuyển GPU process sang software để tránh viz_main crash
// khiến cửa sổ không hiển thị. Flags này chỉ ảnh hưởng renderer, không ảnh backend.

app.commandLine.appendSwitch("use-angle", "swiftshader")
app.commandLine.appendSwitch("use-gl", "swiftshader")

app.whenReady().then(async () => {
  // 1. Khởi động FastAPI backend local (dev + production).
  //    Production: dùng Python đóng gói trong resources/python nếu có.
  try {
    const started = await startBackend()
    console.log("[Main] Backend API URL:", started.apiBaseUrl)
  } catch (err) {
    console.error("[Main] Backend failed to start:", err)
    // Tiếp tục hiển thị app — người dùng có thể bật backend ngoài (dev mode).
  }

  // 2. Giao diện: HTTP local trên port trống (xem startUiServer ở trên).
  try {
    await startUiServer()
  } catch (err) {
    console.error("[Main] UI server failed:", err)
  }

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  stopAllAiBrowsers()
  stopBackend()
  stopUiServer()
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", () => {
  stopAllAiBrowsers()
  stopFlowBrowser()
  stopBackend()
  stopUiServer()
})
