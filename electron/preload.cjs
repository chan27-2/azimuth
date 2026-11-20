const { contextBridge, ipcRenderer } = require("electron");
const call = (name) => async (arg) => {
  const r = await ipcRenderer.invoke(name, arg);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};
contextBridge.exposeInMainWorld("bus", {
  account: call("account"),
  subscriptions: call("subscriptions"),
  namespaces: call("namespaces"),
  entities: call("entities"),
  peek: call("peek"),
  openExternal: (url) => ipcRenderer.invoke("openExternal", url),
});
