// Blitzcrank's idle acts, all steam and static: what he does while he stands about. Each act lasts
// `ms` and, frame by frame, says how to pose him and what to draw round him; blitz.mjs plays it.
//
// pose(c) gets c = { e (ms in), u (0–1), t, at(artPt) → window pt, f (facing), P (top of head),
// ground, W, H, pointer, data (the act's own state), puff(winPt, vx, vy, r0, r1, life), sound(kind),
// face(dir) } and returns any of:
//   armArt, open        the arm's angle in art degrees (20 hangs, negative is up) and the claw
//   gaze | gazeTo       pupils' offset in art units, or a window point to look at
//   lids, pupil         eyes shut; pupil radius
//   hop, tilt           px up (negative) and degrees of lean
//   flameLen, flameSkew the thruster's flame, as when he flies (1 is his flying flame)
//   vx                  px/s to walk along the ground
//   art                 SVG in art units, drawn on him (flips with him)
//   win                 SVG in window px, drawn round him
import { arc, ink, Pen, penPaths, ring, rng } from "./pen.mjs";

const TAU = Math.PI * 2;
const seg = (u, a, b) => Math.max(0, Math.min(1, (u - a) / (b - a)));
const bump = (u, a, b) => Math.sin(seg(u, a, b) * Math.PI);
const ease = (u) => 1 - (1 - u) * (1 - u);
const lerp = (a, b, k) => a + (b - a) * k;
const once = (d, key) => (d[key] ? false : (d[key] = true));
const fx = (n) => n.toFixed(1);

const ANTENNA = [120, 28];
const STACK = [69, 46];
const CHEST = [150, 142];
const BELLY = [117, 146];

/* ---------- pen pieces ---------- */
/** A jagged bolt from `from`, heading `dir` (radians), in the units it is drawn in. */
function boltPts(sd, from, len, dir, kinks = 5, jag = 0.45) {
  const r = rng(sd);
  const pts = [from];
  const step = len / kinks;
  let [x, y] = from;
  for (let i = 1; i <= kinks; i++) {
    const side = (r() * 2 - 1) * step * jag * (i < kinks ? 1 : 0.2);
    x += Math.cos(dir) * step - Math.sin(dir) * side;
    y += Math.sin(dir) * step + Math.cos(dir) * side;
    pts.push([x, y]);
  }
  return pts;
}
const line = (sd, pts, w, cls, flat = false) => ink(new Pen(sd).line(pts, { w }).strokes, cls, flat);
const loop = (sd, pts, cls = "pen-b", flat = true) => ink(penPaths(pts, sd), cls, flat);
const ellipse = (cx, cy, rx, ry, n = 20) => arc(cx, cy, rx, ry, 0, TAU * (1 - 1 / n), n - 1);
/** A ring of steam at a window point. */
const steamRing = (sd, x, y, rx, op) => `<g opacity="${op.toFixed(2)}">${loop(sd, ellipse(x, y, rx, rx * 0.42))}</g>`;
/** A pen Z, for snoring. */
const zed = (sd, x, y, s, op) => `<g opacity="${op.toFixed(2)}">${line(sd, [[x - s, y - s], [x + s, y - s], [x - s, y + s], [x + s, y + s]], 2.4, "pen-b", true)}</g>`;
/** Short red strokes bursting out of a point: a spark. */
function burst(sd, x, y, r0, r1, n, w = 3, cls = "pen-r") {
  const r = rng(sd);
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.5;
    out += line(sd + i, [[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], w, cls);
  }
  return out;
}
/** The arm's angle (art degrees) that points it at a window point, facing f. */
function aimArm(c, p) {
  const sh = c.at([176, 120]);
  const a = (Math.atan2(p.y - sh.y, p.x - sh.x) * 180) / Math.PI;
  return c.f === 1 ? a : 180 - a;
}

/* ---------- little doodles he draws ---------- */
const DOODLES = {
  bolt: [
    [[0, -46], [-16, -4], [2, -4], [-12, 44]],
    [[14, -30], [22, -38]],
    [[18, -14], [28, -14]],
    [[-26, 16], [-34, 22]],
  ],
  kettle: [
    [...arc(0, 14, 30, 24, Math.PI, TAU, 14), [30, 14], [-30, 14], [-30, 14]],
    [[-30, 6], [-46, -4], [-50, -12]],
    [...arc(26, 2, 12, 14, -Math.PI / 2, Math.PI / 2, 8)],
    [[-10, -12], [10, -12]],
    [...arc(0, -16, 4, 4, 0, TAU, 8)],
    [[-50, -18], [-44, -28], [-52, -38], [-46, -48]],
    [[-40, -20], [-34, -30], [-42, -40]],
  ],
  cloud: [
    [...arc(-18, 0, 16, 14, Math.PI * 0.6, Math.PI * 1.9, 10), ...arc(4, -10, 18, 16, Math.PI * 1.05, Math.PI * 1.95, 10), ...arc(26, 2, 14, 12, Math.PI * 1.3, Math.PI * 2.4, 10), [-30, 12]],
    [[-16, 24], [-20, 34]],
    [[0, 24], [-4, 34]],
    [[16, 24], [12, 34]],
    [[4, 12], [-6, 30], [6, 30], [-4, 48]],
  ],
};
const DOODLE_NAMES = Object.keys(DOODLES);
const DOODLE_SCALE = 1.7;
const DOODLE_SPEED = 90; // px of line the pen covers in a second
const DOODLE_LIFT = 150; // ms to lift the pen and set it down for the next stroke
const DOODLE_REACH = 900; // ms reaching out with the pen before the first line
const DOODLE_AFTER = 3300; // ms admiring it, then letting it fade
/** Picks a doodle and times it: each stroke takes as long as its line is long, so a small one is quickly done. */
function doodlePlan(data) {
  if (data.plan) return data.plan;
  const name = DOODLE_NAMES[Math.floor(Math.random() * DOODLE_NAMES.length)];
  const lens = DOODLES[name].map((pts) => pts.slice(1).reduce((l, p, i) => l + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0) * DOODLE_SCALE);
  const raw = lens.reduce((a, l) => a + DOODLE_LIFT + (l / DOODLE_SPEED) * 1000, 0);
  const draw = Math.max(2000, Math.min(8000, raw));
  let at = 0;
  const spans = lens.map((l) => {
    const t0 = at + DOODLE_LIFT * (draw / raw);
    at += (DOODLE_LIFT + (l / DOODLE_SPEED) * 1000) * (draw / raw);
    return [t0, at];
  });
  return (data.plan = { name, draw, spans, ms: DOODLE_REACH + draw + DOODLE_AFTER });
}
/** The point a fraction k of the way along a polyline. */
function along(pts, k) {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let left = k * lens.reduce((a, l) => a + l, 0);
  for (let i = 0; i < lens.length; i++) {
    const k = left / (lens[i] || 1);
    if (k <= 1) return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
    left -= lens[i];
  }
  return pts[pts.length - 1];
}

/* ---------- the acts ---------- */
export const ACTS = {
  /* a hiccup that blows a smoke ring */
  ring: {
    zh: "打嗝冒烟圈",
    kind: "small",
    ms: 1900,
    pose(c) {
      const { u, data } = c;
      const k = seg(u, 0.22, 1);
      let win = "";
      if (u > 0.22) {
        if (once(data, "pop")) c.sound("pop");
        const p = data.from ?? (data.from = c.at(STACK));
        win = steamRing(41, p.x + Math.sin(k * 5) * 4, p.y - 80 * ease(k), 7 + 18 * k, 1 - k);
      }
      return { hop: -9 * bump(u, 0.16, 0.32), pupil: u > 0.16 && u < 0.5 ? 2.3 : 3.4, lids: u > 0.62 && u < 0.7, win };
    },
  },

  /* the thruster sneezes and bounces him up */
  sneeze: {
    zh: "火苗打喷嚏",
    kind: "small",
    ms: 1700,
    pose(c) {
      const { u, data } = c;
      if (u > 0.28 && once(data, "atchoo")) {
        c.sound("whoosh");
        const feet = c.at([120, 236]);
        c.puff({ x: feet.x - 12, y: feet.y }, -80, -10, 3, 11, 800);
        c.puff({ x: feet.x + 12, y: feet.y }, 80, -10, 3, 11, 800);
      }
      const wind = seg(u, 0, 0.28);
      return {
        flameLen: u < 0.28 ? lerp(1, 0.5, wind) : lerp(2.6, 1, seg(u, 0.3, 0.75)),
        flameSkew: Math.sin(c.t / 40) * 0.5,
        hop: -46 * bump(u, 0.28, 0.66),
        tilt: -4 * wind * (u < 0.28 ? 1 : 0) + 5 * Math.sin(seg(u, 0.66, 1) * Math.PI * 3) * (1 - seg(u, 0.66, 1)),
        lids: u > 0.14 && u < 0.36,
      };
    },
  },

  /* E, Power Fist: a practice uppercut that throws a spark */
  punch: {
    zh: "试一拳",
    kind: "small",
    ms: 1700,
    pose(c) {
      const { u, data } = c;
      let armArt;
      if (u < 0.36) armArt = lerp(20, 52, ease(seg(u, 0, 0.36)));
      else if (u < 0.46) armArt = lerp(52, -82, ease(seg(u, 0.36, 0.46)));
      else if (u < 0.72) armArt = -82 + Math.sin(c.t / 30) * 2;
      else armArt = lerp(-82, 20, ease(seg(u, 0.72, 1)));
      let art = "";
      if (u > 0.44 && u < 0.78) {
        if (once(data, "hit")) c.sound("clank");
        const a = (armArt * Math.PI) / 180;
        const fx0 = 176 + Math.cos(a) * 118, fy0 = 120 + Math.sin(a) * 118;
        const k = seg(u, 0.44, 0.78);
        art = `<g opacity="${(1 - k).toFixed(2)}">${burst(91, fx0, fy0, 20 + k * 14, 40 + k * 26, 8, 5)}${line(93, boltPts(95, [fx0, fy0], 54, -2.2, 3), 4, "pen-b")}${line(97, boltPts(99, [fx0, fy0], 50, -0.8, 3), 4, "pen-b")}${line(98, boltPts(96, [fx0, fy0], 46, -1.5, 3), 4, "pen-r")}</g>`;
      }
      return { armArt, open: false, tilt: u < 0.36 ? -4 * seg(u, 0, 0.36) : 6 * bump(u, 0.36, 0.8), pupil: u > 0.36 && u < 0.7 ? 2.6 : 3.4, art };
    },
  },

  /* a nap: Zs, snores of steam, the flame turned down */
  nap: {
    zh: "打盹",
    kind: "medium",
    ms: 10000,
    pose(c) {
      const { u, e, data } = c;
      const asleep = u > 0.1 && u < 0.92;
      let win = "";
      if (asleep) {
        const head = c.at([120, 40]);
        for (let i = 0; i < 3; i++) {
          const ph = (e / 1800 + i / 3) % 1;
          const op = Math.sin(ph * Math.PI) * seg(u, 0.1, 0.2);
          win += zed(500 + i, head.x - c.f * (14 + ph * 34), head.y - 18 - ph * 70, 5 + ph * 7, op);
        }
        if (c.t > (data.snore ?? 0)) {
          c.puff(c.at(STACK), 6 * -c.f, -26, 2.5, 8, 1600);
          data.snore = c.t + 1800;
        }
      }
      if (u > 0.92 && once(data, "wake")) c.sound("pop");
      return {
        lids: asleep,
        hop: asleep ? Math.sin(e / 700) * 2 + 2 : u > 0.92 ? -8 * bump(u, 0.92, 1) : 0,
        tilt: asleep ? 5 : 0,
        armArt: asleep ? 34 : 20,
        flameLen: asleep ? 0.55 + Math.sin(e / 700) * 0.08 : undefined,
        win,
      };
    },
  },

  /* W, Overdrive: a sprint along the bottom of the screen and a skidding stop */
  dash: {
    zh: "超速冲刺",
    kind: "medium",
    ms: 3400,
    pose(c) {
      const { u, data } = c;
      if (data.dir === undefined) {
        data.dir = c.P.x > c.W / 2 ? -1 : 1;
        c.face(data.dir);
        c.sound("whoosh");
      }
      const dir = data.dir;
      const run = u > 0.14 && u < 0.74;
      const brake = u >= 0.74 && u < 0.9;
      const speed = 300 / (0.6 * 3.4);
      const vx = run ? dir * speed : brake ? dir * speed * (1 - seg(u, 0.74, 0.9)) : 0;
      let win = "";
      if (run || brake) {
        const mid = c.at([120, 150]);
        for (let i = 0; i < 3; i++) {
          const y = mid.y - 30 + i * 30 + Math.sin(c.t / 50 + i) * 3;
          const x0 = mid.x - dir * (70 + ((c.t / 3 + i * 40) % 30));
          win += line(700 + i + Math.floor(c.t / 90), [[x0, y], [x0 - dir * (40 + i * 10), y]], 2.4, "pen-b", true);
        }
        if (c.t > (data.trail ?? 0)) {
          const feet = c.at([120, 236]);
          c.puff({ x: feet.x - dir * 16, y: feet.y - 4 }, -dir * 40, -12, 3, 9, 700);
          data.trail = c.t + (brake ? 70 : 130);
        }
      }
      if (brake && once(data, "skid")) c.sound("skid");
      return {
        vx,
        tilt: u < 0.14 ? -6 * dir * seg(u, 0, 0.14) : run ? 11 * dir : brake ? -9 * dir * bump(u, 0.74, 0.95) : 0,
        flameLen: run ? 1.9 : u < 0.14 ? 1.3 : brake ? 1.1 : undefined,
        flameSkew: -1.3,
        armArt: run ? 60 + Math.sin(c.t / 45) * 12 : 20,
        gaze: [3, 0.5],
        win,
      };
    },
  },

  /* on the hour: he knocks on his chest like a clock and puffs one ring per stroke */
  chime: {
    zh: "整点报时",
    kind: "desk",
    ms: 4200,
    pose(c) {
      const { e, data } = c;
      const n = data.n ?? (data.n = new Date().getHours() % 12 || 12);
      const STROKE = 300;
      const k = Math.floor((e - 400) / STROKE);
      const inStroke = e > 400 && k < n;
      const ph = inStroke ? ((e - 400) % STROKE) / STROKE : 0;
      if (inStroke && data.k !== k) {
        data.k = k;
        c.sound("ding");
        c.puff(c.at(STACK), 4 * -c.f, -44, 4, 12, 1500);
      }
      const raise = Math.min(1, e / 400) * (e < 400 + n * STROKE + 200 ? 1 : 1 - Math.min(1, (e - 400 - n * STROKE - 200) / 300));
      return {
        armArt: lerp(20, 128, raise) + (inStroke ? 22 * Math.sin(ph * Math.PI) : 0),
        open: false,
        lids: inStroke && ph < 0.2,
        tilt: inStroke ? 1.5 * Math.sin(ph * Math.PI) : 0,
      };
    },
    duration: (data) => 400 + (data.n ?? (data.n = new Date().getHours() % 12 || 12)) * 300 + 900,
  },

  /* the pointer has sat near him a while: he grabs at it, and misses */
  snatch: {
    zh: "抓鼠标",
    kind: "desk",
    ms: 2600,
    pose(c) {
      const { u, data } = c;
      const to = data.to ?? (data.to = { ...c.pointer });
      if (data.faced === undefined) {
        data.faced = true;
        c.face(to.x > c.P.x ? 1 : -1);
      }
      const aim = aimArm(c, to);
      let armArt = aim;
      let open = Math.sin(c.t / 70) > 0;
      if (u > 0.32 && u < 0.46) open = false;
      if (u > 0.32 && once(data, "snap")) c.sound("clank");
      if (u > 0.5) armArt = lerp(aim, 34, ease(seg(u, 0.5, 0.7)));
      let win = "";
      if (u > 0.55) {
        const head = c.at([150, 10]);
        const k = seg(u, 0.55, 0.65);
        win = `<g transform="translate(${fx(head.x)} ${fx(head.y)}) scale(${k.toFixed(2)})">${line(801, [...arc(0, -10, 8, 8, Math.PI * 1.1, Math.PI * 2.3, 10), [0, 2], [0, 6]], 3, "pen-b", true)}<circle cx="0" cy="13" r="2.5" class="pen-bf"/></g>`;
      }
      return {
        armArt,
        open,
        gazeTo: u < 0.55 ? to : undefined,
        gaze: u >= 0.55 ? [0, 2.6] : undefined,
        hop: -6 * bump(u, 0.3, 0.45),
        tilt: 8 * bump(u, 0.3, 0.5) - (u > 0.6 ? 3 : 0),
        win,
      };
    },
  },

  /* he takes out a pen and draws something steamy or electric beside him, then admires it */
  doodle: {
    zh: "画一幅小画",
    kind: "long",
    duration: (data) => doodlePlan(data).ms,
    pose(c) {
      const { e, data } = c;
      const { name, draw: drawMs, spans } = doodlePlan(data);
      const strokes = DOODLES[name];
      if (!data.at) {
        // Beside him, on the side with more room, standing on the bottom of the screen.
        const dir = c.P.x > c.W / 2 ? -1 : 1;
        c.face(dir);
        data.at = { x: Math.max(90, Math.min(c.W - 90, c.P.x + dir * 250)), y: c.ground - 95 };
        data.inks = strokes.map((pts, i) => new Pen(900 + i).line(pts.map(([x, y]) => [x * DOODLE_SCALE, y * DOODLE_SCALE]), { w: 4.2 }).strokes);
      }
      const o = data.at;
      // Its timeline in ms: reach out, draw, admire it, let it fade.
      const done = DOODLE_REACH + drawMs;
      const fade = 1 - seg(e, done + 1500, done + DOODLE_AFTER);
      // Each stroke in turn, revealed along its length at the pen's steady speed.
      let win = "";
      let tip = { x: o.x, y: o.y };
      strokes.forEach((pts, i) => {
        const k = seg(e - DOODLE_REACH, spans[i][0], spans[i][1]);
        if (k <= 0) return;
        win += data.inks[i].map((s) => `<path d="${s.d}" class="pen-b" stroke-width="${s.w}" opacity="${s.op}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${(1 - k).toFixed(3)}"/>`).join("");
        if (k < 1) {
          const [x, y] = along(pts, k);
          tip = { x: o.x + x * DOODLE_SCALE, y: o.y + y * DOODLE_SCALE };
        }
      });
      win = `<g transform="translate(${fx(o.x)} ${fx(o.y)})" opacity="${fade.toFixed(2)}" filter="url(#wobble)">${win.replace(/d="M/g, 'd="M')}</g>`;
      // The pen in his claw follows the line as it is drawn.
      const drawing = e > DOODLE_REACH && e < done;
      if (e > done && once(data, "done")) c.sound("ding");
      if (drawing && c.t > (data.scratch ?? 0)) {
        c.sound("tick");
        data.scratch = c.t + 140;
      }
      const admire = seg(e, done + 200, done + 1500);
      return {
        armArt: drawing ? aimArm(c, tip) + Math.sin(c.t / 35) * 3 : e <= DOODLE_REACH ? lerp(20, aimArm(c, o), seg(e, 0, DOODLE_REACH)) : 20 - 60 * Math.sin(admire * Math.PI) - 18 * Math.sin(admire * Math.PI * 6) * Math.sin(admire * Math.PI),
        open: !drawing,
        gazeTo: e < done + 1500 ? (drawing ? tip : o) : undefined,
        tilt: drawing ? 4 : 0,
        hop: -6 * bump(e, done + 200, done + 1100),
        win: win.replace(/<g transform/, "<g transform"),
      };
    },
  },
};

/** How long an act runs, given its state. */
export const actMs = (name, data) => (ACTS[name].duration ? ACTS[name].duration(data) : ACTS[name].ms);

/** Late at night he wears a nightcap: a floppy cone with a bobble, in art units. */
let cap = null;
export function nightCap(t) {
  if (!cap) {
    const cone = [[96, 44], [140, 40], [150, 18], [126, 4], [104, 20]];
    const p = new Pen(1400);
    p.hatch([[100, 42], [138, 38], [140, 30], [102, 34]], { angle: 1.1, gap: 5, w: 2.4 });
    const band = p.strokes;
    p.strokes = [];
    p.line(cone, { closed: true, w: 4.5 });
    cap = { band: ink(band, "pen-r"), cone: ink(p.strokes, "pen-b") };
  }
  const sway = Math.sin(t / 900) * 3;
  return `<g transform="rotate(${(-12 + sway).toFixed(1)} 120 40)"><path d="M96 44 L140 40 L150 18 L126 4 L104 20 Z" class="pen-paper"/>${cap.band}${cap.cone}<circle cx="${(162 + sway).toFixed(1)}" cy="22" r="7" class="pen-paper"/>${loop(1401, ring(162 + sway, 22, 7, 12), "pen-b", false)}</g>`;
}
