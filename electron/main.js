import { app, BrowserWindow, ipcMain, shell, nativeTheme } from "electron";

app.setName("Busscope");
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as azure from "./azure.js";
import { demo } from "./demo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Finder-launched apps don't inherit the shell PATH; AzureCliCredential needs `az`.
process.env.PATH = ["/opt/homebrew/bin", "/usr/local/bin", process.env.PATH].join(":");

const az = process.env.BUSSCOPE_DEMO ? demo : azure;
const handlers = {
  account: az.account,
  subscriptions: az.subscriptions,
  addAccount: az.addAccount,
  namespaces: az.namespaces,
  entities: az.entities,
  access: az.access,
  setConnectionString: az.setConnectionString,
  clearConnectionString: az.clearConnectionString,
  peek: az.peek,
};
const iconPath = path.join(__dirname, "../brand/icon-1024.png");
const icon = existsSync(iconPath) ? iconPath : undefined;
for (const [name, fn] of Object.entries(handlers)) {
  ipcMain.handle(name, async (_e, arg) => {
    try {
      return { ok: true, data: await fn(arg) };
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e), code: e?.code, detail: e?.detail };
    }
  });
}
ipcMain.handle("openExternal", (_e, url) => shell.openExternal(url));

function createWindow() {
  nativeTheme.themeSource = "dark";
  if (process.platform === "darwin" && icon) app.dock?.setIcon(icon);
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: "#0a0a0a",
    icon,
    title: "Busscope",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  if (process.env.VITE_DEV) win.loadURL("http://localhost:5199");
  else win.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
