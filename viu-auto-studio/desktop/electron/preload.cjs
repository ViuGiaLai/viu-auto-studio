const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke("ping"),
  openExternal: (url) => ipcRenderer.invoke("open:external", url),
  getRuntimeConfig: () => ipcRenderer.invoke("getRuntimeConfig"),
  getUserDataDir: () => ipcRenderer.invoke("getUserDataDir"),
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
})
