const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke("ping"),
  openExternal: (url) => ipcRenderer.invoke("open:external", url),
  getRuntimeConfig: () => ipcRenderer.invoke("getRuntimeConfig"),
  getUserDataDir: () => ipcRenderer.invoke("getUserDataDir"),
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
  openPath: (target) => ipcRenderer.invoke("shell:open-path", target),
  startFlow: (input) => ipcRenderer.invoke("flow:start", input),
  stopFlow: () => ipcRenderer.invoke("flow:stop"),
  logoutFlow: () => ipcRenderer.invoke("flow:logout"),
  flowGoogleStatus: () => ipcRenderer.invoke("flow:googleStatus"),
  openAiBrowser: (input) => ipcRenderer.invoke("aiBrowser:open", input),
  getAiBrowserStatus: (input) => ipcRenderer.invoke("aiBrowser:status", input),
  logoutAiBrowser: (input) => ipcRenderer.invoke("aiBrowser:logout", input),
})
