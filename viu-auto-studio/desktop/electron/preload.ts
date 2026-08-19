import { contextBridge, ipcRenderer } from "electron"
import type { RuntimeConfig } from "./runtime-config"

// Expose a minimal, safe API surface to the renderer.
// Electron khởi động FastAPI backend và ghi runtime.json (API URL + đường dẫn).
// Renderer đọc cấu hình đó qua bridge này — không hardcode port/URL.
contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke("ping"),
  openExternal: (url: string) => ipcRenderer.invoke("open:external", url),
  getRuntimeConfig: (): Promise<RuntimeConfig | null> => ipcRenderer.invoke("getRuntimeConfig"),
  getUserDataDir: (): Promise<string> => ipcRenderer.invoke("getUserDataDir"),
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke("dialog:select-directory"),
})
