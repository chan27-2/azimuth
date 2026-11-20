// When you run from source, macOS shows the development Electron bundle's name: the Dock label,
// ⌘-Tab and Finder use the bundle's folder name, and the menu bar uses CFBundleName. Rename the bundle to
// Busscope.app, point the electron package at it, set its names and icon, and re-sign it ad hoc.
// Runs after install-electron and only touches node_modules; packaged builds don't need it.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") process.exit(0);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = path.join(root, "node_modules/electron");
const dist = path.join(electronDir, "dist");
const from = path.join(dist, "Electron.app");
const app = path.join(dist, "Busscope.app");

if (existsSync(from)) {
  if (existsSync(app)) execFileSync("rm", ["-rf", app]);
  renameSync(from, app);
}
if (!existsSync(app)) {
  console.warn("brand-electron: no Electron bundle found, skipping");
  process.exit(0);
}
const set = (plist, key, value) => execFileSync("plutil", ["-replace", key, "-string", value, plist]);

// Main executable: Contents/MacOS/Electron → Busscope (this is the process name in Activity Monitor).
const macos = path.join(app, "Contents/MacOS");
if (existsSync(path.join(macos, "Electron"))) renameSync(path.join(macos, "Electron"), path.join(macos, "Busscope"));
const plist = path.join(app, "Contents/Info.plist");
set(plist, "CFBundleExecutable", "Busscope");
set(plist, "CFBundleName", "Busscope");
set(plist, "CFBundleDisplayName", "Busscope");
set(plist, "CFBundleIdentifier", "com.busscope.dev");

// Helper apps: Electron finds them as "<executable name> Helper*.app", the same renaming electron-packager does.
const frameworks = path.join(app, "Contents/Frameworks");
for (const suffix of ["", " (GPU)", " (Plugin)", " (Renderer)"]) {
  const oldApp = path.join(frameworks, `Electron Helper${suffix}.app`);
  const newApp = path.join(frameworks, `Busscope Helper${suffix}.app`);
  if (existsSync(oldApp)) renameSync(oldApp, newApp);
  if (!existsSync(newApp)) continue;
  const oldExe = path.join(newApp, "Contents/MacOS", `Electron Helper${suffix}`);
  if (existsSync(oldExe)) renameSync(oldExe, path.join(newApp, "Contents/MacOS", `Busscope Helper${suffix}`));
  const helperPlist = path.join(newApp, "Contents/Info.plist");
  set(helperPlist, "CFBundleExecutable", `Busscope Helper${suffix}`);
  set(helperPlist, "CFBundleName", `Busscope Helper${suffix}`);
  set(helperPlist, "CFBundleDisplayName", `Busscope Helper${suffix}`);
}

// The electron package launches whatever path.txt names.
writeFileSync(path.join(electronDir, "path.txt"), "Busscope.app/Contents/MacOS/Busscope");

const icns = path.join(root, "brand/icon.icns");
if (existsSync(icns)) copyFileSync(icns, path.join(app, "Contents/Resources/electron.icns"));

// Editing Info.plist invalidates Electron's signature; an ad hoc one keeps macOS happy.
execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "ignore" });
// Make Launch Services pick up the new name and icon instead of a cached "Electron".
execFileSync("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", app], { stdio: "ignore" });
console.log("brand-electron: development bundle is now Busscope.app");
