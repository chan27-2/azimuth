// When you run from source, macOS names the app after the Electron.app bundle ("Electron" in the menu bar
// and Dock). Rename that development bundle to Busscope, give it the icon, and re-sign it ad hoc.
// Runs after install-electron. Only touches node_modules; packaged builds don't need it.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") process.exit(0);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "node_modules/electron/dist/Electron.app");
const plist = path.join(app, "Contents/Info.plist");
if (!existsSync(plist)) {
  console.warn("brand-electron: Electron.app not found, skipping");
  process.exit(0);
}

const set = (key, value) => execFileSync("plutil", ["-replace", key, "-string", value, plist]);
set("CFBundleName", "Busscope");
set("CFBundleDisplayName", "Busscope");

const icns = path.join(root, "brand/icon.icns");
if (existsSync(icns)) copyFileSync(icns, path.join(app, "Contents/Resources/electron.icns"));

// Editing Info.plist invalidates Electron's signature; an ad hoc one keeps macOS happy.
execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "ignore" });
console.log("brand-electron: development bundle renamed to Busscope");
