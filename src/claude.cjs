// One explanation from this machine's Claude Code CLI (`claude -p`), streamed. The same runner as
// Aparté's lib/claude.ts, trimmed to what a desk pet needs:
// 1. The desktop app's bundled CLI is preferred; claudeBin in config.json (or CLAUDE_BIN) overrides.
// 2. Variables inherited from a parent Claude Code session (CLAUDE*, ANTHROPIC_*) are dropped.
// 3. Hooks, plugins, MCP servers, CLAUDE.md, skills and tools are all skipped.
// 4. A GUI start misses the shell's proxy, so the macOS system proxy is passed on.
const { spawn, execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, readdirSync, readFileSync } = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const readline = require("node:readline");

/**
 * The model settings, from config.json at the project root, read on every call so an edit takes
 * effect at the next hook. BLITZ_MODEL, BLITZ_EFFORT, CLAUDE_BIN and BLITZ_CLAUDE_CONFIG_DIR override it.
 */
function settings() {
  let c = {};
  try {
    c = JSON.parse(readFileSync(join(__dirname, "..", "config.json"), "utf8"));
  } catch {}
  return {
    model: process.env.BLITZ_MODEL || c.model || "claude-opus-5-5",
    effort: process.env.BLITZ_EFFORT || c.effort || "low",
    bin: process.env.CLAUDE_BIN || c.claudeBin || "",
    configDir: process.env.BLITZ_CLAUDE_CONFIG_DIR || c.configDir || "",
  };
}

const SYSTEM = `你是桌面上的一个小机器人。用户在电脑上用钩子抓了一句话，请你解释这句话。
用户的消息里有：这句话所在的 App 和窗口标题，这句话周围的文字（上下文），以及被抓的这句话。
- 结合上下文，说清这句话在这里是什么意思、在上下文里起什么作用。上下文只用来理解，不要复述或总结上下文本身。
- 有专有名词、人名、典故、比喻、术语，就点出来是什么。
- 外文：先给出自然的中文意思，再做解释。代码或命令：说清它做什么。
- 上下文可能夹着界面上的按钮和菜单文字，忽略它们。没有上下文时，就按这句话本身解释。
用简体中文，2 到 4 句，纯文本，不用 Markdown 标题和列表，不用破折号，不要开场白。`;
// Explanations in English, when the language is set to English in his menu.
const SYSTEM_EN = `You are a small robot on the desktop. The user hooked a sentence on their screen; explain it.
The user's message gives the app and window title it was in, the text around it (context), and the sentence itself.
- Using the context, say what the sentence means here and what it does in its context. The context is only for understanding: don't repeat or summarise it.
- Point out what any proper nouns, names, allusions, metaphors or terms refer to.
- Text in another language: give its natural meaning in English first, then explain it. Code or a command: say what it does.
- The context may include button and menu text from the interface; ignore it. Without context, explain the sentence on its own.
Answer in English, 2 to 4 sentences, plain text, no Markdown headings or lists, no dashes, no preamble.`;

/** The user's message: where the sentence was, the text round it, and the sentence itself. */
function promptFor(q) {
  const where = [q.app, q.title && `「${q.title}」`].filter(Boolean).join(" ");
  const parts = [];
  if (where) parts.push(`位置：${where}`);
  if (q.context && q.context.trim() && q.context.trim() !== q.text.trim()) parts.push(`上下文：\n<context>\n${q.context.slice(0, 8000)}\n</context>`);
  if (q.ocr) parts.push("这些文字是从屏幕截图里识别出来的：公式、上下标和特殊符号可能识别错（比如 √dₖ 变成 Vdk），请按上下文还原后再解释，不要照抄错字。");
  if (q.scope === "paragraph") parts.push(`被抓的这一段：\n<paragraph>\n${q.text.slice(0, 6000)}\n</paragraph>\n这是一整段，请说清这段在讲什么、在上下文里起什么作用，可以写到 3 到 5 句。`);
  else parts.push(`被抓的这句话：\n<sentence>\n${q.text.slice(0, 4000)}\n</sentence>`);
  return parts.join("\n\n");
}

function desktopCli() {
  const root = join(homedir(), "Library/Application Support/Claude/claude-code");
  const ver = (s) => s.split(".").map(Number);
  const newer = (a, b) => {
    const [x, y] = [ver(a), ver(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
    return 0;
  };
  try {
    for (const v of readdirSync(root).filter((d) => /^\d+(\.\d+)*$/.test(d)).sort(newer))
      for (const h of readdirSync(join(root, v))) {
        const bin = join(root, v, h, "claude.app/Contents/MacOS/claude");
        if (existsSync(bin)) return bin;
      }
  } catch {}
  return null;
}

function claudeBin() {
  const candidates = [settings().bin, desktopCli(), join(homedir(), ".local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
  return candidates.find((p) => p && existsSync(p)) ?? "claude";
}

function macProxy() {
  if (process.platform !== "darwin") return null;
  try {
    const out = execFileSync("/usr/sbin/scutil", ["--proxy"], { encoding: "utf8" });
    const get = (k) => out.match(new RegExp(`${k} : (\\S+)`))?.[1];
    if (get("HTTPSEnable") === "1" && get("HTTPSProxy")) return `http://${get("HTTPSProxy")}:${get("HTTPSPort")}`;
    if (get("HTTPEnable") === "1" && get("HTTPProxy")) return `http://${get("HTTPProxy")}:${get("HTTPPort")}`;
  } catch {}
  return null;
}

function cliEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^CLAUDE/.test(k) || /^ANTHROPIC_/.test(k) || /^ELECTRON/.test(k)) continue;
    env[k] = v;
  }
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
  // A config dir of Blitz's own keeps its own login, so he can use another account than the terminal's.
  const dir = settings().configDir;
  if (dir) env.CLAUDE_CONFIG_DIR = dir.replace(/^~(?=$|\/)/, homedir());
  const extra = [dirname(claudeBin()), "/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local/bin")];
  env.PATH = [...new Set([...(env.PATH || "/usr/bin:/bin").split(":"), ...extra])].join(":");
  if (!env.HTTPS_PROXY && !env.https_proxy) {
    const p = macProxy();
    if (p) {
      env.HTTPS_PROXY = env.HTTP_PROXY = env.https_proxy = env.http_proxy = p;
      env.NO_PROXY = env.no_proxy = env.NO_PROXY || "localhost,127.0.0.1,::1";
    }
  }
  return env;
}

/** q: { text, context?, title?, app?, lang? ("zh" | "en") }. Yields { kind: "delta", text } as the answer streams, then one { kind: "done" } or { kind: "error", text }. */
async function* explain(q, signal) {
  const cfg = settings();
  if (typeof q === "string") q = { text: q };
  const cwd = join(tmpdir(), "blitz-pet");
  mkdirSync(cwd, { recursive: true });
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--model", cfg.model,
    "--effort", cfg.effort,
    "--system-prompt", q.lang === "en" ? SYSTEM_EN : SYSTEM,
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "",
    "--disable-slash-commands",
    "--no-session-persistence",
  ];
  const proc = spawn(claudeBin(), args, { cwd, env: cliEnv(), stdio: ["pipe", "pipe", "pipe"] });
  const kill = () => proc.kill();
  signal?.addEventListener("abort", kill, { once: true });

  const queue = [];
  let wake = null;
  let finished = false;
  const push = (e) => {
    if (finished) return;
    if (e.kind !== "delta") finished = true;
    queue.push(e);
    wake?.();
  };
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
  proc.on("error", (err) => push({ kind: "error", text: `启动不了 Claude Code（${claudeBin()}）：${err.message}` }));
  proc.on("close", (code) => push({ kind: "error", text: signal?.aborted ? "" : stderr.trim().split("\n").pop() || `Claude Code 退出了（${code}），没有回答。` }));
  readline.createInterface({ input: proc.stdout }).on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.type === "stream_event") {
      const ev = msg.event;
      if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) push({ kind: "delta", text: ev.delta.text });
    } else if (msg.type === "result") {
      if (msg.is_error) push({ kind: "error", text: String(msg.result || msg.errors?.join("; ") || "Claude Code 出错了") });
      else push({ kind: "done" });
    }
  });
  proc.stdin.end(promptFor(q));

  try {
    while (true) {
      if (!queue.length) {
        if (finished) break;
        await new Promise((r) => (wake = r));
        wake = null;
        continue;
      }
      const e = queue.shift();
      yield e;
      if (e.kind !== "delta") break;
    }
  } finally {
    signal?.removeEventListener("abort", kill);
    if (proc.exitCode === null) proc.kill();
  }
}

module.exports = { explain };
