import { app, BrowserWindow, dialog, ipcMain } from "electron"
import path from "node:path"
import http from "node:http"
import fs from "node:fs"
import { startBackend, stopBackend } from "./backend-manager"
import { startFlowBrowser, stopFlowBrowser } from "./flow-browser"
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

  mainWindow.on("ready-to-show", () => {
    if (!captureDir) mainWindow.show()
  })

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: "detach" })
  } else if (uiBaseUrl) {
    void mainWindow.loadURL(`${uiBaseUrl}/index.html`)
  } else {
    void mainWindow.loadFile(path.join(HERE, "../dist/index.html"))
  }
  if (captureDir) {
    const routes = ["", "projects", "projects/new", "studio", "queue", "library", "voices", "characters", "flow", "analytics", "settings", "guide"]
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        fs.mkdirSync(captureDir, { recursive: true })
        mainWindow.setContentSize(1920, 1080)
        const base = VITE_DEV_SERVER_URL || uiBaseUrl
        await new Promise((resolve) => setTimeout(resolve, 1200))
        for (const route of routes) {
          if (route) {
            await mainWindow.loadURL(`${base}/${route}`)
            await new Promise((resolve) => setTimeout(resolve, 1200))
          }
          const image = await mainWindow.webContents.capturePage()
          const name = route ? route.replace(/\//g, "-") : "dashboard"
          fs.writeFileSync(path.join(captureDir, `${name}.png`), image.toPNG())
          console.log(`[Capture] ${name}.png`)
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
  void import("electron").then(({ shell }) => shell.openExternal(url))
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
  stopBackend()
  stopUiServer()
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", () => {
  stopFlowBrowser()
  stopBackend()
  stopUiServer()
})
