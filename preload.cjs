const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("host", {
  /** Catch the mouse (true) while it is over him or his bubble, let it through (false) everywhere else. */
  hit: (on) => ipcRenderer.send("hit", on),
  /** Borrow Esc while he aims. */
  aiming: (on) => ipcRenderer.send("aiming", on),
  clip: () => ipcRenderer.invoke("clip"),
  /** Seconds since the last keyboard or mouse input anywhere on the computer. */
  idle: () => ipcRenderer.invoke("idle"),
  /** The lines of text on screen, with boxes and character edges, in window px. */
  scan: () => ipcRenderer.invoke("scan"),
  /** scope: "sentence" | "paragraph" */
  axAt: (x, y, scope) => ipcRenderer.invoke("ax-at", x, y, scope),
  axTrust: () => ipcRenderer.invoke("ax-trust"),
  copy: (text) => ipcRenderer.send("copy", text),
  /** An event for the recording log (only sent while recording; points in window px). */
  rec: (ev) => ipcRenderer.send("rec", ev),
  /** Open a URL, a file:// URL or a path (vault notes open in Obsidian). */
  open: (target) => ipcRenderer.send("open", target),
  /** q: { text, context?, title?, app? } */
  explain: (id, q) => ipcRenderer.send("explain", { id, q }),
  stop: () => ipcRenderer.send("explain-stop"),
  onExplain: (fn) => ipcRenderer.on("explain", (_e, ev) => fn(ev)),
  /** His settings changed from his own menu, so the menu bar's checkmarks follow: { drift?, night? } */
  pref: (p) => ipcRenderer.send("pref", p),
  onCommand: (fn) => ipcRenderer.on("cmd", (_e, c) => fn(c)),
});
