// Blitzcrank lives in one transparent window laid over the work area, above other windows, and
// clicks go straight through it everywhere except on him and his thought bubble. The page tells us
// when the pointer is over something of his (or he is aiming) and we stop ignoring the mouse for
// just that long. Explanations come from this machine's Claude Code (`claude -p`), as in Aparté.
const { app, BrowserWindow, ipcMain, powerMonitor, screen, Tray, Menu, nativeImage, nativeTheme, clipboard, globalShortcut, systemPreferences, shell } = require("electron");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { mkdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { explain } = require("./src/claude.cjs");
const { recorder } = require("./src/recorder.cjs");
let rec = null; // made once the app is ready (it needs the screen module)

let win = null;
let tray = null;
// The settings both menus show (the menu bar's and his own right-click one).
let prefs = { drift: true, phones: false, shades: false };
const running = new Map();

function fit() {
  if (!win) return;
  win.setBounds(screen.getPrimaryDisplay().workArea);
}

function create() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    ...workArea,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    acceptFirstMouse: true,
    backgroundColor: "#00000000",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, "index.html"));
  screen.on("display-metrics-changed", fit);
  screen.on("display-added", fit);
  screen.on("display-removed", fit);
}

const send = (...a) => win && !win.isDestroyed() && win.webContents.send(...a);

ipcMain.on("hit", (_e, on) => win?.setIgnoreMouseEvents(!on, { forward: true }));
ipcMain.handle("clip", () => clipboard.readText());
ipcMain.handle("idle", () => powerMonitor.getSystemIdleTime());
// The text on screen, read with Vision (native/ocr), in the window's px. Our own window is kept out
// of the shot for the moment it is taken.
// Packaged, the helpers sit outside the asar archive, where they can run.
const native = (name) => path.join(__dirname, "native", name).replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const run = (cmd, args) =>
  new Promise((ok, no) => execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, out, errOut) => (err ? no(new Error(String(errOut || err.message).trim())) : ok(out))));
ipcMain.handle("scan", async () => {
  if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("screen") !== "granted") {
    return { error: `要读屏幕上的字，需要在 系统设置 › 隐私与安全性 › 屏幕与系统录音 里允许这个程序（${app.isPackaged ? "Blitz Boy" : "Electron"}），然后重开 Blitz。` };
  }
  const dir = path.join(tmpdir(), "blitz-pet");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `screen-${Date.now()}.png`);
  try {
    // While recording, he stays in the shot (the log says when the screen was read instead).
    if (rec?.on) rec.mark({ type: "scan" });
    else win.setContentProtection(true);
    await run("/usr/sbin/screencapture", ["-x", "-m", "-t", "png", file]);
  } catch (e) {
    return { error: `截屏失败：${e.message}` };
  } finally {
    win?.setContentProtection(false);
  }
  try {
    const res = JSON.parse(await run(native("ocr"), [file]));
    const d = screen.getPrimaryDisplay();
    const k = d.bounds.width / res.w;
    const ox = d.workArea.x - d.bounds.x, oy = d.workArea.y - d.bounds.y;
    const lines = res.lines.map((l) => ({
      t: l.t,
      b: [l.b[0] * k - ox, l.b[1] * k - oy, l.b[2] * k, l.b[3] * k],
      c: l.c.map((e) => (e.length === 2 && e[1] > e[0] ? [e[0] * k - ox, e[1] * k - ox] : null)),
    }));
    return { lines };
  } catch (e) {
    return { error: `识别失败：${e.message}` };
  } finally {
    rmSync(file, { force: true });
  }
});
// The sentence under a point through the Accessibility API (native/ax-at), in the window's px.
ipcMain.handle("ax-at", async (_e, x, y, scope) => {
  const d = screen.getPrimaryDisplay();
  try {
    const r = JSON.parse(await run(native("ax-at"), [String(x + d.workArea.x), String(y + d.workArea.y), String(process.pid), scope === "paragraph" ? "paragraph" : "sentence"]));
    const shift = ([rx, ry, rw, rh]) => [rx - d.workArea.x, ry - d.workArea.y, rw, rh];
    if (r.rects) r.rects = r.rects.map(shift);
    if (Array.isArray(r.window)) r.window = shift(r.window);
    return r;
  } catch (e) {
    return { error: e.message };
  }
});
ipcMain.handle("ax-trust", () => require("electron").systemPreferences.isTrustedAccessibilityClient(true));
// Open what a bubble points at: a web page in the browser, a vault note in Obsidian, a file in its app.
ipcMain.on("open", (_e, target) => {
  const t = String(target || "");
  if (/^https?:/.test(t)) return shell.openExternal(t);
  const file = t.startsWith("file://") ? decodeURIComponent(new URL(t).pathname) : t;
  if (file.endsWith(".md") && file.includes("/Obsidian/")) return shell.openExternal(`obsidian://open?path=${encodeURIComponent(file)}`);
  if (file.startsWith("/")) shell.openPath(file);
});
ipcMain.on("rec", (_e, ev) => {
  rec?.event(ev);
  // A take ends a moment after his run does, so the fall and the handheld closing are on film.
  if (take && ev?.type === "game_over") {
    take = false;
    setTimeout(() => rec?.on && setRecording(false), 1500);
  }
});
function setRecording(on, opts) {
  if (on) rec.start(opts);
  else rec.stop();
  send("cmd", on ? "rec-on" : "rec-off");
  menu();
}
// One take of the handheld for a promo video (⌥⇧R): every other app is hidden so only the desktop
// is behind him, recording starts, and once screencapture is filming he plays a run by himself;
// recording stops on its own when the run is over. Don't point at him meanwhile: that ends his run.
let take = false;
function recordGame() {
  if (take || rec?.on) return;
  take = true;
  if (process.platform === "darwin") Menu.sendActionToFirstResponder("hideOtherApplications:");
  send("cmd", "rec-quiet");
  setRecording(true, { clicks: false });
  setTimeout(() => send("cmd", "autoplay"), 1200);
}
ipcMain.on("pref", (_e, p) => {
  prefs = { ...prefs, ...p };
  menu();
});
ipcMain.on("copy", (_e, text) => clipboard.writeText(String(text ?? "")));

// While he aims, Esc puts the hook away. The window never takes focus, so Esc is borrowed globally
// for just that long.
ipcMain.on("aiming", (_e, on) => {
  if (on) globalShortcut.register("Escape", () => send("cmd", "cancel"));
  else globalShortcut.unregister("Escape");
});

ipcMain.on("explain", async (_e, { id, q }) => {
  for (const c of running.values()) c.abort();
  running.clear();
  const ctl = new AbortController();
  running.set(id, ctl);
  for await (const ev of explain(q, ctl.signal)) send("explain", { id, ...ev });
  running.delete(id);
});
ipcMain.on("explain-stop", () => {
  for (const c of running.values()) c.abort();
  running.clear();
});

// Hide him and bring him back: the window goes away, he and his state stay as they were.
function toggleShown() {
  if (!win || win.isDestroyed()) return;
  console.log(`[blitz] toggle: visible=${win.isVisible()}`);
  if (win.isVisible()) win.hide();
  else win.showInactive();
  menu();
}
// His entrance (acts.mjs "enter"); from hidden too, so a take can start with him not there at all.
function enter() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) send("cmd", "act:enter");
  else {
    // Start him out of sight before the window comes back, so its first frame isn't the old one.
    send("cmd", "enter-hidden");
    setTimeout(() => (win.showInactive(), menu()), 150);
  }
  menu();
}
function menu() {
  tray ??= new Tray(nativeImage.createFromPath(path.join(__dirname, "assets", "trayTemplate.png")));
  tray.setToolTip("Blitz Boy");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: win && !win.isDestroyed() && !win.isVisible() ? "显示 Blitz Boy" : "隐藏 Blitz Boy", accelerator: "Control+Shift+H", click: toggleShown },
      { label: "出钩抓一句", accelerator: "Alt+Q", click: () => send("cmd", "aim") },
      { label: "回到右下角", click: () => send("cmd", "home") },
      { type: "separator" },
      { label: "待机时自己玩（飘 / 跳）", type: "checkbox", checked: prefs.drift, click: (i) => ((prefs.drift = i.checked), send("cmd", i.checked ? "drift-on" : "drift-off")) },
      { label: "现在就飘", click: () => send("cmd", "drift-now") },
      { type: "separator" },
      { label: "玩 Doodle Jump（鼠标左右，Esc 结束）", click: () => send("cmd", "play") },
      { label: "看他自己跳", click: () => send("cmd", "autoplay") },
      { type: "separator" },
      {
        label: "待机动画",
        submenu: [
          ["ring", "打嗝冒烟圈"],
          ["sneeze", "火苗打喷嚏"],
          ["punch", "试一拳"],
          ["nap", "打盹"],
          ["dash", "超速冲刺"],
          ["chime", "整点报时"],
          ["snatch", "抓鼠标"],
          ["doodle", "画一幅小画"],
          ["music", "戴耳机听歌"],
          ["guitar", "弹吉他"],
          ["dj", "打碟"],
          ["sing", "唱歌"],
          ["violin", "拉小提琴"],
        ]
          .map(([name, label]) => ({ label, click: () => send("cmd", `act:${name}`) })),
      },
      {
        // What he wears: headphones and sunglasses, each on its own.
        label: "装饰",
        submenu: [
          { label: "戴耳机", type: "checkbox", checked: prefs.phones, click: (i) => ((prefs.phones = i.checked), send("cmd", i.checked ? "phones-on" : "phones-off")) },
          { label: "戴墨镜", type: "checkbox", checked: prefs.shades, click: (i) => ((prefs.shades = i.checked), send("cmd", i.checked ? "shades-on" : "shades-off")) },
        ],
      },
      // Recording and promo takes are for working on him from the source tree.
      ...(app.isPackaged ? [] : [
        { type: "separator" },
        { label: rec?.on ? "停止录制" : "开始录制（录屏 + 事件日志）", type: "checkbox", checked: !!rec?.on, click: () => setRecording(!rec?.on) },
        // A promo take: the same recording and log, without the red ring on his antenna.
        { label: "宣传片录制（不显示红圈）", enabled: !rec?.on, click: () => (send("cmd", "rec-quiet"), setRecording(true, { clicks: false })) },
        { label: "录一段掌机（干净桌面，自动停止）", accelerator: "Alt+Shift+R", click: recordGame },
        { label: "入场动画（从底下缓缓飞上来）", accelerator: "Control+Shift+E", click: enter },
        { label: "打开录制文件夹", click: () => shell.openPath(path.join(__dirname, "recordings")) },
      ]),
      { type: "separator" },
      { label: "退出", role: "quit" },
    ])
  );
}

app.whenReady().then(() => {
  // His drawings follow the system's dark mode; on a desktop they sit on their own paper, so keep them light.
  nativeTheme.themeSource = "light";
  rec = recorder(screen);
  if (process.platform === "darwin") app.dock.hide();
  create();
  menu();
  const keys = { "Alt+Q": () => send("cmd", "aim"), "Control+Shift+E": enter, "Control+Shift+H": toggleShown };
  if (!app.isPackaged) keys["Alt+Shift+R"] = recordGame;
  for (const [key, fn] of Object.entries(keys)) if (!globalShortcut.register(key, fn)) console.warn(`[blitz] shortcut ${key} is taken by another app`);
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  rec?.stop();
});
app.on("window-all-closed", () => app.quit());
