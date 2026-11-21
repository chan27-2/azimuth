const { contextBridge, ipcRenderer } = require("electron");
// Errors lose their custom fields (code, detail) when thrown across the context bridge, so results
// cross as plain { ok, data | error, code, detail } objects and src/lib/api.ts turns them back into errors.
contextBridge.exposeInMainWorld("azimuthIpc", {
  invoke: (name, arg) => ipcRenderer.invoke(name, arg),
  openExternal: (url) => ipcRenderer.invoke("openExternal", url),
  platform: process.platform,
});
