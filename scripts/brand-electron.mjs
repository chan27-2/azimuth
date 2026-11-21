// When you run from source, macOS shows the development Electron bundle's name: the Dock label,
// ⌘-Tab and Finder use the bundle's folder name, and the menu bar uses CFBundleName. Rename the bundle to
// Azimuth.app, point the electron package at it, set its names and icon, and re-sign it ad hoc.
// Runs after install-electron and only touches node_modules; packaged builds don't need it.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") process.exit(0);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = path.join(root, "node_modules/electron");
const dist = path.join(electronDir, "dist");
const NAME = "Azimuth";
const ID = "com.azimuth.dev";
const app = path.join(dist, `${NAME}.app`);
// Fresh installs have Electron.app; older checkouts may have a bundle under a previous name.
const from = readdirSync(dist).find((f) => f.endsWith(".app") && f !== `${NAME}.app`);
if (from) {
  if (existsSync(app)) execFileSync("rm", ["-rf", app]);
  renameSync(path.join(dist, from), app);
}
if (!existsSync(app)) {
  console.warn("brand-electron: no Electron bundle found, skipping");
  process.exit(0);
}
const set = (plist, key, value) => execFileSync("plutil", ["-replace", key, "-string", value, plist]);

// Main executable: Contents/MacOS/Electron → Azimuth (this is the process name in Activity Monitor).
const macos = path.join(app, "Contents/MacOS");
const exe = readdirSync(macos)[0];
if (exe && exe !== NAME) renameSync(path.join(macos, exe), path.join(macos, NAME));
const plist = path.join(app, "Contents/Info.plist");
set(plist, "CFBundleExecutable", NAME);
set(plist, "CFBundleName", NAME);
set(plist, "CFBundleDisplayName", NAME);
set(plist, "CFBundleIdentifier", ID);

// Helper apps: Electron finds them as "<executable name> Helper*.app", the same renaming electron-packager does.
const frameworks = path.join(app, "Contents/Frameworks");
for (const suffix of ["", " (GPU)", " (Plugin)", " (Renderer)"]) {
  const want = `${NAME} Helper${suffix}`;
  const old = readdirSync(frameworks).find((f) => f.endsWith(` Helper${suffix}.app`) && f !== `${want}.app`);
  if (old) renameSync(path.join(frameworks, old), path.join(frameworks, `${want}.app`));
  const helper = path.join(frameworks, `${want}.app`);
  if (!existsSync(helper)) continue;
  const helperMacos = path.join(helper, "Contents/MacOS");
  const helperExe = readdirSync(helperMacos)[0];
  if (helperExe && helperExe !== want) renameSync(path.join(helperMacos, helperExe), path.join(helperMacos, want));
  const helperPlist = path.join(helper, "Contents/Info.plist");
  set(helperPlist, "CFBundleExecutable", want);
  set(helperPlist, "CFBundleName", want);
  set(helperPlist, "CFBundleDisplayName", want);
}

// The electron package launches whatever path.txt names.
writeFileSync(path.join(electronDir, "path.txt"), `${NAME}.app/Contents/MacOS/${NAME}`);

const icns = path.join(root, "brand/icon.icns");
if (existsSync(icns)) copyFileSync(icns, path.join(app, "Contents/Resources/electron.icns"));

// Editing Info.plist invalidates Electron's signature; an ad hoc one keeps macOS happy.
execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "ignore" });
// Make Launch Services pick up the new name and icon instead of a cached "Electron".
execFileSync("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", app], { stdio: "ignore" });
console.log(`brand-electron: development bundle is now ${NAME}.app`);
