import { contextBridge, ipcRenderer } from "electron"
import type { RuntimeConfig } from "./runtime-config"

// Bundled to dist-electron/preload.cjs as CommonJS (see vite.config.ts).
// Electron cannot load ESM `import` inside a .cjs preload file.
contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke("ping"),
  openExternal: (url: string) => ipcRenderer.invoke("open:external", url),
  openPath: (target: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke("shell:open-path", target),
  getRuntimeConfig: (): Promise<RuntimeConfig | null> => ipcRenderer.invoke("getRuntimeConfig"),
  getUserDataDir: (): Promise<string> => ipcRenderer.invoke("getUserDataDir"),
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke("dialog:select-directory"),
  startFlow: (input: { projectId: number; factorySessionId: string }): Promise<{ ok: boolean; status: string; message: string; profilePath?: string }> => ipcRenderer.invoke("flow:start", input),
  stopFlow: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("flow:stop"),
  logoutFlow: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke("flow:logout"),
  openAiBrowser: (input: { provider: "chatgpt" | "gemini" }): Promise<{ ok: boolean; status: string; message: string; profilePath?: string; browserName?: string }> => ipcRenderer.invoke("aiBrowser:open", input),
  getAiBrowserStatus: (input: { provider: "chatgpt" | "gemini" }): Promise<{ connected: boolean; email?: string; model?: string; plan?: string; browserRunning?: boolean; message?: string }> => ipcRenderer.invoke("aiBrowser:status", input),
  logoutAiBrowser: (input: { provider: "chatgpt" | "gemini" }): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke("aiBrowser:logout", input),
})
