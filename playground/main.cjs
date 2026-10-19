// A window of its own for trying the idle acts (../src/acts.mjs) without the desk pet running.
// Run: ./node_modules/.bin/electron playground/main.cjs
const { app, BrowserWindow, nativeTheme } = require("electron");
const path = require("node:path");
app.whenReady().then(() => {
  nativeTheme.themeSource = "light";
  const win = new BrowserWindow({ width: 1100, height: 760, title: "Blitz 动画试验场", backgroundColor: "#e9e4d8", webPreferences: { backgroundThrottling: false } });
  win.loadFile(path.join(__dirname, "acts.html"));
});
app.on("window-all-closed", () => app.quit());
