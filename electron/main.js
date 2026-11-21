import { app, BrowserWindow, ipcMain, shell, nativeTheme } from "electron";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NAME = "Azimuth";
app.setName(NAME);
app.setAboutPanelOptions({
  applicationName: NAME,
  applicationVersion: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version,
  version: "",
  copyright: "MIT License",
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Finder-launched apps don't inherit the shell PATH; everything goes through `az`.
process.env.PATH = ["/opt/homebrew/bin", "/usr/local/bin", process.env.PATH].join(path.delimiter);

// AZIMUTH_DEMO=1 swaps every Azure call for fictional data (see electron/demo/).
const demo = !!process.env.AZIMUTH_DEMO;
const [core, sb, fn, ai] = await Promise.all(
  demo
    ? ["core", "servicebus", "functions", "insights"].map((m) => import(`./demo/${m}.js`))
    : ["./core.js", "./servicebus.js", "./functions.js", "./insights.js"].map((m) => import(m)),
);

// Every IPC channel the window can call, as "tool.method". Nothing else is reachable from the renderer.
const handlers = {
  "core.account": core.account,
  "core.subscriptions": core.subscriptions,
  "core.addAccount": core.addAccount,
  "core.cancelAddAccount": core.cancelAddAccount,
  "sb.namespaces": sb.namespaces,
  "sb.entities": sb.entities,
  "sb.access": sb.access,
  "sb.setConnectionString": sb.setConnectionString,
  "sb.clearConnectionString": sb.clearConnectionString,
  "sb.peek": sb.peek,
  "fn.apps": fn.apps,
  "fn.functions": fn.functions,
  "fn.access": fn.access,
  "fn.insights": fn.insights,
  "fn.stats": fn.stats,
  "fn.invocations": fn.invocations,
  "fn.findInvocation": fn.findInvocation,
  "fn.run": fn.run,
  "fn.cancelRun": fn.cancelRun,
  "ai.components": ai.components,
  "ai.overview": ai.overview,
  "ai.requests": ai.requests,
  "ai.logs": ai.logs,
  "ai.trace": ai.trace,
  "ai.traceAcross": ai.traceAcross,
  "ai.findTrace": ai.findTrace,
  "ai.query": ai.query,
};
for (const [name, handler] of Object.entries(handlers)) {
  ipcMain.handle(name, async (_e, arg) => {
    try {
      return { ok: true, data: await handler(arg) };
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e), code: e?.code, detail: e?.detail };
    }
  });
}
ipcMain.handle("openExternal", (_e, url) => {
  // Only web links, so a crafted value can't open local files or apps.
  if (/^https:\/\//i.test(String(url))) return shell.openExternal(url);
});

const iconPath = path.join(__dirname, "../brand/icon-1024.png");
const icon = existsSync(iconPath) ? iconPath : undefined;

// Window chrome follows each platform's convention. The 52px header row is the title bar on all of them.
// macOS: traffic lights inset on the left, centred on that row.
// Windows: native min/max/close drawn by the OS on the right (Window Controls Overlay).
// Linux: the window manager's own frame, since title bar layouts vary by desktop.
const HEADER = 52;
function chrome() {
  if (process.platform === "darwin") return { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 19 } };
  if (process.platform === "win32") return { titleBarStyle: "hidden", titleBarOverlay: { color: "#0a0a0a", symbolColor: "#a1a1a1", height: HEADER - 1 } };
  return { autoHideMenuBar: true };
}

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
    title: NAME,
    ...chrome(),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, additionalArguments: demo ? ["--azimuth-demo"] : [] },
  });
  // Links inside the app open in the browser, never in a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // The window only ever shows the app itself; reloads are fine, leaving for another site isn't.
  win.webContents.on("will-navigate", (e, url) => {
    if (new URL(url).origin !== new URL(win.webContents.getURL()).origin) e.preventDefault();
  });
  // Back/forward that arrive outside the page: macOS swipe (three-finger setting), Windows browser keys and mouse buttons.
  win.on("swipe", (_e, dir) => (dir === "left" || dir === "right") && win.webContents.send("nav", dir === "right" ? "back" : "forward"));
  win.on("app-command", (_e, cmd) => {
    if (cmd === "browser-backward") win.webContents.send("nav", "back");
    if (cmd === "browser-forward") win.webContents.send("nav", "forward");
  });
  if (process.env.VITE_DEV) win.loadURL("http://localhost:5199");
  else win.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
