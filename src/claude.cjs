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
 * The model settings, read on every call so an edit takes effect at the next hook: config.json at the
 * project root, then ~/Library/Application Support/Blitz Boy/config.json over it (the one to edit when
 * he runs as an app). BLITZ_MODEL, BLITZ_EFFORT, CLAUDE_BIN and BLITZ_CLAUDE_CONFIG_DIR override both.
 */
const USER_CONFIG = join(homedir(), "Library/Application Support/Blitz Boy/config.json");
function settings() {
  let c = {};
  for (const file of [join(__dirname, "..", "config.json"), USER_CONFIG]) {
    try {
      Object.assign(c, JSON.parse(readFileSync(file, "utf8")));
    } catch {}
  }
  return {
    model: process.env.BLITZ_MODEL || c.model || "claude-opus-5-5",
    effort: process.env.BLITZ_EFFORT || c.effort || "low",
    bin: process.env.CLAUDE_BIN || c.claudeBin || "",
    configDir: process.env.BLITZ_CLAUDE_CONFIG_DIR || c.configDir || "",
  };
}

const SYSTEM = `你是桌面上的一个小机器人。用户在电脑上用钩子抓了一句话，想知道它在说什么。
用户的消息里有：这句话所在的 App 和窗口标题，这句话周围的文字（上下文），以及被抓的这句话。
先想清楚：一个普通读者读到这句话，最可能卡在哪里？是外文、生词、俚语黑话、典故梗、术语、反话双关，还是指代不明、不知道它在上下文里想干什么。回答就只打这个点。
回答写成两行：
第一行：结论，不超过 18 个字。外文写自然的中文译文（原句长就只译主干）。中文原句不要换个说法再说一遍，直接说出它的用意或言外之意。代码、命令、报错：说清它做什么或哪里坏了。
第二行：解释那个卡点，不超过 32 个字。有具体的词就用「」点名，说清它是什么、从哪来。没有难词，就说它在这段上下文里起什么作用。
不要写放之四海皆准的常识和建议（比如“通常需要……”），不要复述或总结上下文，不要编造上下文里没有的具体情况。上下文里夹着的按钮和菜单文字忽略。
用简体中文，纯文本，不用 Markdown，不用破折号，不要开场白，不要给两行加标签。

例子（只示范格式和角度，不要照抄）：
原句：Ship it before it rots.（推文，上下文：打磨了三个月的副项目）
别磨了，赶紧发布，不然就烂在手里。
「ship」是程序员黑话，指发布上线；「rots」把拖着不发比作东西放坏。

原句：这波属于是降维打击了。（游戏视频评论）
说双方实力差得不在一个层次。
「降维打击」出自刘慈欣《三体》，高维文明把对手拍成二维，引申为碾压。

原句：TypeError: Cannot read properties of undefined (reading 'map')
有个变量是 undefined，却被当成数组调了 map。
看报错那一行「.map」前面的变量，多半是数据还没取到就先渲染了。`;
// Explanations in English, when the language is set to English in his menu.
const SYSTEM_EN = `You are a small robot on the desktop. The user hooked a sentence on their screen and wants to know what it's saying.
The user's message gives the app and window title it was in, the text around it (context), and the sentence itself.
First work out where an ordinary reader would get stuck: another language, an unusual word, slang or jargon, an allusion or meme, a technical term, irony or a pun, an unclear reference, or what the sentence is doing in its context. Answer only that.
Write the answer as two lines:
Line 1: the answer, at most 10 words. For another language, its natural meaning in English (just the gist if the sentence is long). For English, don't restate it in other words: say what it's getting at. For code, a command or an error: what it does or what broke.
Line 2: explain the sticking point, at most 20 words. Name the exact word in quotes and say what it is and where it comes from. With no hard word, say what the sentence does in this context.
No generic advice or truisms ("usually you need to..."), no repeating or summarising the context, no details the context doesn't give. Ignore button and menu text from the interface.
Answer in English, plain text, no Markdown, no dashes, no preamble, no labels on the lines.

Examples (format and angle only, don't copy them):
Sentence: Ship it before it rots. (a tweet; context: a side project polished for three months)
Stop polishing and release it before it goes stale.
"Ship" is developer slang for releasing; "rots" likens a project left unreleased to food going off.

Sentence: TypeError: Cannot read properties of undefined (reading 'map')
Something is undefined but is being used as an array.
Look at what comes before ".map" on that line; the data probably hadn't loaded when it rendered.`;

/** The user's message: where the sentence was, the text round it, and the sentence itself. */
function promptFor(q) {
  const where = [q.app, q.title && `「${q.title}」`].filter(Boolean).join(" ");
  const parts = [];
  if (where) parts.push(`位置：${where}`);
  if (q.context && q.context.trim() && q.context.trim() !== q.text.trim()) parts.push(`上下文：\n<context>\n${q.context.slice(0, 8000)}\n</context>`);
  if (q.ocr) parts.push("这些文字是从屏幕截图里识别出来的：公式、上下标和特殊符号可能识别错（比如 √dₖ 变成 Vdk），请按上下文还原后再解释，不要照抄错字。");
  if (q.scope === "paragraph") parts.push(`被抓的这一段：\n<paragraph>\n${q.text.slice(0, 6000)}\n</paragraph>\n这是一整段：第一行用一句话说清这段在讲什么，第二行再写一句，不超过 40 个字，说它在上下文里的作用或要点。`);
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
