// Which OS we're on, for title bar layout and shortcut labels. The preload script passes process.platform.
const os = (window as unknown as { azimuthIpc?: { platform?: string } }).azimuthIpc?.platform ?? "darwin";

export const isMac = os === "darwin";
export const isWindows = os === "win32";

// Shortcut label: ⌘K on macOS, Ctrl+K elsewhere.
export const mod = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);
export const modClick = isMac ? "⌘-click" : "Ctrl+click";

document.documentElement.dataset.platform = os;
