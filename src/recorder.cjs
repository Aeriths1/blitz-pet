// Recording mode, for making videos of him: the screen is recorded with macOS's own screencapture,
// and everything he does goes into an event log beside it, one JSON object a line, so the footage can
// be cut, zoomed and scored afterwards from what happened when.
//
//   ~/blitz-pet/recordings/<YYYYMMDD-HHMMSS>.mov     the screen (main display, cursor and clicks shown)
//   ~/blitz-pet/recordings/<YYYYMMDD-HHMMSS>.jsonl   the log
//
// The log's first line is {"type":"start", wall, display, video}; every line after it has `t`, the ms
// since the screencapture process was spawned (t = 0). Points and boxes are in global screen points,
// top-left origin ([x, y], [x, y, w, h]); events from the page arrive in its window's px and are
// moved into screen points here.
//
// screencapture takes about half a second to start filming, so the movie's first frame is not t = 0.
// When it has finished writing, the last line {"type":"video", duration, offset} says where: frame 0
// of the movie is t = offset (= the stop's t minus the movie's length).
const { spawn, execFile } = require("node:child_process");
const { createWriteStream, existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const DIR = join(__dirname, "..", "recordings");

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function recorder(screen) {
  let rec = null; // { proc, log, t0, video, pointer, last }

  const display = () => screen.getPrimaryDisplay();
  /** Window px → screen points, for every point and box field an event carries. */
  function toScreen(ev) {
    const { x: ox, y: oy } = display().workArea;
    const pt = (p) => (Array.isArray(p) && p.length >= 2 ? [p[0] + ox, p[1] + oy, ...p.slice(2)] : p);
    const out = { ...ev };
    for (const k of ["at", "from", "to", "rect", "p"]) if (out[k]) out[k] = pt(out[k]);
    if (Array.isArray(out.rects)) out.rects = out.rects.map(pt);
    return out;
  }
  function write(ev) {
    if (!rec) return;
    rec.log.write(JSON.stringify({ t: Date.now() - rec.t0, ...ev }) + "\n");
  }

  return {
    get on() {
      return !!rec;
    },
    /** `clicks: false` leaves out the black ring macOS draws round the pointer on each click (promo takes). */
    start({ clicks = true } = {}) {
      if (rec) return rec.video;
      mkdirSync(DIR, { recursive: true });
      const name = stamp();
      const video = join(DIR, `${name}.mov`);
      const log = createWriteStream(join(DIR, `${name}.jsonl`));
      // -v video, -k show clicks, -C show the cursor, -D1 the main display, -x no sounds.
      const proc = spawn("/usr/sbin/screencapture", ["-v", ...(clicks ? ["-k"] : []), "-C", "-x", "-D1", video], { stdio: ["pipe", "ignore", "pipe"] });
      const t0 = Date.now();
      const d = display();
      log.write(JSON.stringify({ type: "start", wall: t0, display: { bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor }, video }) + "\n");
      rec = { proc, log, t0, video, last: null };
      proc.stderr.on("data", (b) => write({ type: "recorder_error", text: String(b).trim() }));
      proc.on("exit", (code, sig) => {
        if (rec?.proc === proc) {
          write({ type: "recorder_exit", code, signal: sig });
          stop();
        }
      });
      rec.done = new Promise((ok) => proc.on("exit", ok));
      // The pointer, every 50 ms, whenever it has moved.
      rec.pointer = setInterval(() => {
        const p = screen.getCursorScreenPoint();
        if (rec.last && rec.last[0] === p.x && rec.last[1] === p.y) return;
        rec.last = [p.x, p.y];
        write({ type: "pointer", x: p.x, y: p.y });
      }, 50);
      return video;
    },
    stop,
    /** An event from the page (window px), stamped and moved into screen points. */
    event(ev) {
      if (rec && ev && typeof ev.type === "string") write(toScreen(ev));
    },
    /** An event from the main process, already in screen points. */
    mark(ev) {
      write(ev);
    },
  };

  function stop() {
    if (!rec) return null;
    const r = rec;
    rec = null;
    clearInterval(r.pointer);
    const tStop = Date.now() - r.t0;
    r.log.write(JSON.stringify({ t: tStop, type: "stop" }) + "\n");
    // SIGINT lets screencapture finish the movie; a kill would leave it unplayable.
    if (r.proc.exitCode === null) r.proc.kill("SIGINT");
    // Once the movie is written, note how long it is and so where its first frame falls.
    r.done.then(() => {
      const probe = ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"].find((p) => existsSync(p));
      if (!probe) return r.log.end();
      execFile(probe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", r.video], (err, out) => {
        const duration = Number(String(out).trim());
        if (!err && duration > 0) r.log.write(JSON.stringify({ type: "video", duration, offset: Math.round(tStop - duration * 1000) }) + "\n");
        r.log.end();
      });
    });
    return r.video;
  }
}

module.exports = { recorder };
