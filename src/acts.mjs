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
//   cap                 false to take the worn headphones off for the act
//   hide                true to leave him out of the picture (his entrance)
//   shades              false to take the worn sunglasses off for the act
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
  ],
};
const DOODLE_NAMES = Object.keys(DOODLES);
const DOODLE_SCALE = 1.1;
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
/** An easel with a board and a sheet of paper on it, centred on 0,0 in window px, legs down `floor` px. */
function boardInk(floor) {
  const W = 75, H = 68;
  const p = new Pen(950);
  p.line([[-W + 18, H - 6], [-W + 4, floor]], { w: 3.4 }).line([[W - 18, H - 6], [W - 4, floor]], { w: 3.4 }).line([[0, -H - 8], [0, -H + 2]], { w: 3.4 });
  const legs = ink(p.strokes, "pen-b", true);
  const b = new Pen(951);
  b.line([[-W, -H], [W, -H], [W, H], [-W, H]], { closed: true, w: 3.4 });
  const board = `<path d="M${-W} ${-H}H${W}V${H}H${-W}Z" fill="#e3d9c3"/>` + ink(b.strokes, "pen-b", true);
  const sheet = `<path d="M${-W + 9} ${-H + 9}H${W - 9}V${H - 9}H${-W + 9}Z" class="pen-paper"/>` + ink(new Pen(952).line([[-W + 9, -H + 9], [W - 9, -H + 9], [W - 9, H - 9], [-W + 9, H - 9]], { closed: true, w: 1.6 }).strokes, "pen-b", true);
  const clip = `<path d="M-14 ${-H - 4}H14V${-H + 12}H-14Z" class="pen-rf" opacity=".85"/>`;
  return legs + board + sheet + clip;
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

/* ---------- headphones and notes ---------- */
const BEAT = 560; // ms a beat, a little over 100 a minute
const CUPS = [[82, 80], [158, 80]];
let phones = null;
/** Headphones in art units: a band over the top of his head, a cup on each side, and the cord's
 *  far end, a little player clipped to his front. */
function headphones() {
  if (phones) return phones;
  const outer = arc(120, 76, 39, 36, Math.PI * 1.05, Math.PI * 1.95, 16);
  const inner = arc(120, 76, 33, 30, Math.PI * 1.95, Math.PI * 1.05, 16);
  const p = new Pen(1500);
  p.line(outer, { w: 4.5 }).line(inner, { w: 3 });
  const band = `<path d="M${[...outer, ...inner].map(([x, y]) => `${fx(x)} ${fx(y)}`).join("L")}Z" class="pen-paper"/>` + ink(p.strokes, "pen-b");
  const cups = CUPS.map(([cx, cy], i) => {
    const e = ellipse(cx, cy, 10, 15, 16);
    const q = new Pen(1510 + i);
    q.hatch(e, { angle: 1.1, gap: 4.5, w: 2.2 });
    const hatch = q.strokes;
    q.strokes = [];
    q.line(e, { closed: true, w: 4.5 });
    return `<path d="M${e.map(([x, y]) => `${fx(x)} ${fx(y)}`).join("L")}Z" class="pen-paper"/>` + ink(hatch, "pen-r") + ink(q.strokes, "pen-b");
  }).join("");
  const box = [[84, 140], [100, 140], [100, 162], [84, 162]];
  const b = new Pen(1520);
  b.hatch([[87, 144], [97, 144], [97, 151], [87, 151]], { angle: 0.6, gap: 3.5, w: 1.8 });
  const screen = b.strokes;
  b.strokes = [];
  b.line(box, { closed: true, w: 3.5 }).line([[88, 156], [96, 156]], { w: 2.4 });
  const player = `<path d="M84 140 L100 140 L100 162 L84 162 Z" class="pen-paper"/>` + ink(screen, "pen-r") + ink(b.strokes, "pen-b");
  return (phones = { band, cups, player });
}
/** A note in window px: an eighth, or two beamed. */
function note(sd, x, y, beamed, cls, op) {
  const fill = cls === "pen-r" ? "pen-rf" : "pen-bf";
  const head = (hx, hy) => `<ellipse cx="${fx(hx)}" cy="${fx(hy)}" rx="4.6" ry="3.4" transform="rotate(-22 ${fx(hx)} ${fx(hy)})" class="${fill}"/>`;
  let out = head(x, y) + line(sd, [[x + 4, y - 1], [x + 4, y - 20]], 2.4, cls, true);
  if (beamed) out += head(x + 13, y - 3) + line(sd + 1, [[x + 17, y - 4], [x + 17, y - 23]], 2.4, cls, true) + line(sd + 2, [[x + 4, y - 20], [x + 17, y - 23]], 4, cls, true);
  else out += line(sd + 1, [[x + 4, y - 20], [x + 11, y - 15], [x + 10, y - 9]], 2.4, cls, true);
  return `<g opacity="${op.toFixed(2)}">${out}</g>`;
}

/** The headphones drawn at an offset (dy, art units), an opacity and a sway of the cord. */
function phonesArt(dy, op, sw) {
  const cord = line(1530, [[CUPS[0][0], 95], [79 + sw, 110], [86 + sw * 0.6, 126], [92, 140]], 2.6, "pen-b");
  const { band, cups, player } = headphones();
  return `<g opacity="${op.toFixed(2)}">${cord}${player}</g><g transform="translate(0 ${fx(dy)})" opacity="${op.toFixed(2)}">${band}${cups}</g>`;
}
/** Headphones for a music act: dropped on at the start and lifted off at the end, unless he already
 *  wears them (c.worn), when they just stay put. `show` (0–1) is how far on they are. */
function phonesFor(c, g) {
  const on = c.worn ? 1 : ease(seg(c.u, 0, 0.08));
  const off = c.worn ? 0 : ease(seg(c.u, 0.9, 1));
  return { art: phonesArt(-60 * (1 - on) - 60 * off, on * (1 - off), g * Math.sin((c.e * Math.PI) / BEAT) * 3), show: on * (1 - off) };
}
/** How much he is into it: up once the headphones are on, down before they come off. */
const groove = (u) => seg(u, 0.1, 0.16) * (1 - seg(u, 0.84, 0.9));
/** A note on every beat, from each of `pts` (art units) in turn, floating up and away; window SVG. */
function noteStream(c, data, g, pts, every = BEAT, big = false) {
  const notes = (data.notes ??= []);
  const n = Math.floor(c.e / every);
  if (g > 0.5 && data.n !== n) {
    data.n = n;
    const side = n % pts.length;
    const from = c.at(pts[side]);
    const out = (pts.length > 1 ? (side ? 1 : -1) : 1) * c.f;
    notes.push({ t0: c.t, x: from.x, y: from.y, vx: out * (14 + (n % 3) * 6), sd: 1600 + (n % 7) * 3, beamed: n % 4 === 3, cls: big || n % 3 === 0 ? "pen-r" : "pen-b", k: big ? 1.35 : 1 });
  }
  let win = "";
  for (let i = notes.length - 1; i >= 0; i--) {
    const m = notes[i];
    const k = (c.t - m.t0) / 1800;
    if (k >= 1) {
      notes.splice(i, 1);
      continue;
    }
    const s = k * 1.8;
    const x = m.x + m.vx * s + Math.sin(k * 7 + m.sd) * 5, y = m.y - 46 * s;
    const op = Math.sin(Math.min(1, k * 1.4) * Math.PI) * (1 - k * 0.3);
    win += m.k === 1 ? note(m.sd, x, y, m.beamed, m.cls, op) : `<g transform="translate(${fx(x)} ${fx(y)}) scale(${m.k})">${note(m.sd, 0, 0, m.beamed, m.cls, op)}</g>`;
  }
  return win;
}
/** Paper, hatching and pen outline for a closed shape in art units. */
function solid(sd, pts, { hatch = null, w = 4.5 } = {}) {
  const q = new Pen(sd);
  if (hatch) q.hatch(pts, hatch);
  const h = q.strokes;
  q.strokes = [];
  q.line(pts, { closed: true, w });
  return `<path d="M${pts.map(([x, y]) => `${fx(x)} ${fx(y)}`).join("L")}Z" class="pen-paper"/>` + ink(h, "pen-r") + ink(q.strokes, "pen-b");
}
/** An electric guitar held low across him, in art units: body by his claw, neck up across his front. */
let guitarArt = null;
function guitar() {
  if (guitarArt) return guitarArt;
  const body = [...arc(216, 206, 34, 26, 0, TAU * 0.95, 18)];
  const head = [[58, 118], [72, 110], [78, 122], [64, 130]];
  const neck = solid(1700, [[193, 186], [75, 116], [69, 128], [187, 198]], { w: 3.5 });
  const frets = [0.25, 0.45, 0.65].map((k, i) => line(1705 + i, [[190 - 118 * k - 3, 192 - 70 * k + 6], [190 - 118 * k + 3, 192 - 70 * k - 6]], 2.4, "pen-b")).join("");
  const strings = line(1701, [[236, 214], [70, 120]], 1.6, "pen-r");
  return (guitarArt = neck + frets + solid(1702, body, { hatch: { angle: 1.1, gap: 5, w: 2.2 } }) + solid(1703, head, { w: 3.5 }) + loop(1704, ring(208, 202, 7, 10), "pen-b", false) + strings);
}
/** A violin tucked under his chin on the far side of his head, in art units, scroll out behind. */
let violinArt = null;
function violin() {
  if (violinArt) return violinArt;
  // Built level round 0,0 and turned into place: body, waist, neck, scroll, and the strings over it all.
  const body = [...arc(-8, 0, 14, 11, Math.PI * 0.5, Math.PI * 1.5, 8), ...arc(10, 0, 12, 10, Math.PI * 1.5, Math.PI * 2.5, 8)];
  const pr = new Pen(1800);
  pr.hatch(body, { angle: 1.2, gap: 4, w: 1.8 });
  const hatch = ink(pr.strokes, "pen-r");
  const outline = ink(new Pen(1801).line(body, { closed: true, w: 3.6 }).strokes, "pen-b");
  const fill = `<path d="M${body.map(([x, y]) => `${fx(x)} ${fx(y)}`).join("L")}Z" class="pen-paper"/>`;
  const neck = line(1802, [[22, 0], [52, 0]], 5, "pen-b") + loop(1803, ring(56, -1, 4, 9), "pen-b", false);
  const strings = line(1804, [[-18, 0], [54, 0]], 1.4, "pen-r");
  return (violinArt = `<g transform="translate(60 94) rotate(206) scale(1.35)">${fill}${hatch}${outline}${neck}${strings}</g>`);
}

/** Sunglasses over his eyes, in art units: the pixel "deal with it" kind, black squares with a bar
 *  along the top, lenses stepping in towards the bottom and two white squares of glint in each. */
// One lens, row by row under the bar (# black, w white glint, . empty); the right lens is the same.
const LENS = ["#ww#####", ".#ww####", "..######", "...####."];
// The bridge is two rows deep, so his eyes don't show between the lenses.
const SHADES = ["#".repeat(18), ...LENS.map((row, i) => row + (i === 0 ? "##" : "..") + row)];
let shadesArt = null;
function shades() {
  if (shadesArt) return shadesArt;
  // Big enough to cover both eyes (centres 110 / 131, radius 7.5, at y 71).
  const P = 3.4, x0 = 121 - (SHADES[0].length * P) / 2, y0 = 62;
  let out = "";
  SHADES.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === ".") return;
      out += `<rect x="${fx(x0 + c * P)}" y="${fx(y0 + r * P)}" width="${P + 0.15}" height="${P + 0.15}" fill="${ch === "w" ? "#ffffff" : "#111111"}"/>`;
    }),
  );
  return (shadesArt = `<g shape-rendering="crispEdges">${out}</g>`);
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

  /* headphones drop onto his head and he grooves to something only he can hear, notes floating off */
  music: {
    zh: "戴耳机听歌",
    kind: "medium",
    ms: 9000,
    pose(c) {
      const { u, e, data } = c;
      if (!c.worn && u > 0.07 && once(data, "on")) c.sound("tick");
      const g = groove(u);
      const beat = (e * Math.PI) / BEAT;
      const phones = phonesFor(c, g);
      const win = noteStream(c, data, g, [[CUPS[0][0], CUPS[0][1] - 14], [CUPS[1][0], CUPS[1][1] - 14]]);
      const vibing = u > 0.3 && u < 0.62;
      return {
        art: phones.art,
        win,
        cap: false,
        hop: (c.worn ? 0 : -7 * bump(u, 0.07, 0.13)) - g * 5 * Math.abs(Math.sin(beat)),
        tilt: g * (vibing ? 8 : 5) * Math.sin(beat),
        armArt: 20 + g * (14 + 16 * Math.sin(beat * 2)),
        open: g > 0 ? Math.sin(beat * 2) > 0 : undefined,
        lids: vibing,
        gaze: u < 0.08 && !c.worn ? [0, -2.6] : [1.6 * g * Math.sin(beat), -1.2 * g],
      };
    },
  },

  /* air guitar: a guitar appears, he strums it with his claw and headbangs, then a big finishing chord */
  guitar: {
    zh: "弹吉他",
    kind: "medium",
    ms: 7600,
    pose(c) {
      const { u, e, data } = c;
      const g = groove(u);
      const beat = (e * Math.PI) / BEAT;
      const phones = phonesFor(c, g);
      // The last chord: wind up, one big strum and a jump.
      const finale = u > 0.72 && u < 0.86;
      const big = seg(u, 0.72, 0.76);
      let armArt = 20 + phones.show * 42;
      if (g > 0 && !finale) armArt += g * 13 * Math.sin(beat * 4);
      if (finale) armArt = u < 0.76 ? lerp(62, 10, ease(big)) : lerp(10, 92, ease(seg(u, 0.76, 0.79)));
      let win = noteStream(c, data, g * (finale ? 0 : 1), [[226, 180], [150, 150]], BEAT / 2);
      if (u > 0.76 && u < 0.86) {
        if (once(data, "chord")) c.sound("clank");
        const p = c.at([216, 206]);
        const k = seg(u, 0.76, 0.86);
        win += `<g opacity="${(1 - k).toFixed(2)}">${burst(1720, p.x, p.y, 18 + k * 30, 40 + k * 50, 10, 3.4)}</g>`;
      }
      return {
        art: `<g opacity="${phones.show.toFixed(2)}">${guitar()}</g>` + phones.art,
        win,
        cap: false,
        armArt,
        open: false,
        hop: -g * 4 * Math.abs(Math.sin(beat)) - 26 * bump(u, 0.77, 0.86),
        tilt: g * 9 * Math.sin(beat) * (u > 0.45 ? 1.4 : 1) - 6 * big,
        lids: (u > 0.4 && u < 0.7) || finale,
        gaze: [2, 1.5],
      };
    },
  },

  /* DJ: a deck appears in front of him, the record spins, he scratches it and the bass thumps */
  dj: {
    zh: "打碟",
    kind: "medium",
    ms: 8400,
    pose(c) {
      const { u, e, data } = c;
      const g = groove(u);
      const beat = (e * Math.PI) / BEAT;
      const phones = phonesFor(c, g);
      // Where the claw rests at 40°, a little lower: the record's middle.
      if (!data.rec) {
        const a = (40 * Math.PI) / 180;
        const p = c.at([176 + Math.cos(a) * 118, 120 + Math.sin(a) * 118]);
        data.rec = { x: p.x, y: p.y + 8 };
      }
      const r = data.rec;
      const op = phones.show;
      const spin = c.t / 160;
      // The deck: a box down to the floor, the record lying flat on top, a mark going round it.
      const top = r.y + 4;
      const box = new Pen(1750).line([[r.x - 58, top], [r.x + 58, top], [r.x + 58, c.ground], [r.x - 58, c.ground]], { closed: true, w: 3 }).strokes;
      const mark = [r.x + Math.cos(spin) * 24, r.y + Math.sin(spin) * 6];
      let win = `<g opacity="${op.toFixed(2)}" filter="url(#wobble)"><path d="M${r.x - 58} ${top}H${r.x + 58}V${c.ground}H${r.x - 58}Z" class="pen-paper"/>${ink(box, "pen-b", true)}`;
      win += `<ellipse cx="${fx(r.x)}" cy="${fx(r.y)}" rx="30" ry="7.5" class="pen-paper"/>` + loop(1751, ellipse(r.x, r.y, 30, 7.5), "pen-b") + loop(1752, ellipse(r.x, r.y, 9, 2.4, 10), "pen-r");
      win += line(1753 + (Math.floor(c.t / 120) % 3), [[r.x, r.y], mark], 2.4, "pen-r", true);
      win += `<circle cx="${fx(r.x + 44)}" cy="${fx(top + 12)}" r="3.5" class="pen-bf"/><circle cx="${fx(r.x - 44)}" cy="${fx(top + 12)}" r="3.5" class="pen-bf"/></g>`;
      // The bass: rings going out from the deck on every beat.
      const ph = (e % BEAT) / BEAT;
      if (g > 0.3) win += `<g opacity="${((1 - ph) * g * 0.8).toFixed(2)}">${loop(1760, ellipse(r.x, top - 6, 40 + ph * 50, 10 + ph * 14), "pen-b")}</g>`;
      win += noteStream(c, data, g, [[CUPS[0][0], CUPS[0][1] - 14], [CUPS[1][0], CUPS[1][1] - 14]]);
      // Scratching: two bursts of quick back and forth, otherwise riding the beat.
      const scratching = (u > 0.3 && u < 0.42) || (u > 0.6 && u < 0.72);
      const armArt = lerp(20, 40, op) + (scratching ? 7 * Math.sin(c.t / 45) : g * 2 * Math.sin(beat * 2));
      return {
        art: phones.art,
        win,
        cap: false,
        armArt,
        open: false,
        hop: -g * 5 * Math.abs(Math.sin(beat)),
        tilt: g * (scratching ? 3 : 6) * Math.sin(beat),
        lids: scratching,
        gazeTo: scratching ? undefined : r,
      };
    },
  },

  /* karaoke: a mic stand in front of him, he leans in and sings, and holds the high note */
  sing: {
    zh: "唱歌",
    kind: "medium",
    ms: 8000,
    pose(c) {
      const { u, e, data } = c;
      const g = groove(u);
      const beat = (e * Math.PI) / BEAT;
      const phones = phonesFor(c, g);
      const op = phones.show;
      // The mic just in front of his face, the stand down to the floor.
      if (!data.mic) {
        const p = c.at([228, 82]);
        data.mic = { x: p.x, y: p.y };
      }
      const m = data.mic;
      const high = u > 0.55 && u < 0.76;
      const head = solid(1780, ellipse(0, 0, 8, 10, 14), { hatch: { angle: 1.1, gap: 3.6, w: 1.8 }, w: 3.5 });
      let win = `<g opacity="${op.toFixed(2)}">`;
      win += line(1781, [[m.x, m.y + 10], [m.x, c.ground - 2]], 3, "pen-b", true) + loop(1782, ellipse(m.x, c.ground - 2, 22, 4), "pen-b");
      win += line(1783, [[m.x, c.ground - 2], [m.x + 14, c.ground - 1], [m.x + 26, c.ground - 6], [m.x + 34, c.ground - 1]], 2, "pen-b", true);
      win += `<g transform="translate(${fx(m.x)} ${fx(m.y)}) rotate(${-24 * c.f})">${head}</g></g>`;
      // Notes from the mic, bigger and red on the high note, with a ring of volume round it.
      win += noteStream(c, data, g, [[222, 70]], high ? BEAT / 2 : BEAT, high);
      if (high) {
        const ph = (e % 300) / 300;
        win += `<g opacity="${(1 - ph).toFixed(2)}">${loop(1790, arc(m.x + c.f * 6, m.y, 16 + ph * 26, 16 + ph * 26, c.f > 0 ? -0.9 : Math.PI - 0.9, c.f > 0 ? 0.9 : Math.PI + 0.9, 8), "pen-r", true)}</g>`;
      }
      return {
        art: phones.art,
        win,
        cap: false,
        // Leaning in to the mic, swaying, and up on the high note with his arm flung out.
        tilt: c.f * (op * 5 + g * 4 * Math.sin(beat)) - (high ? c.f * 3 : 0),
        hop: high ? -8 - 2 * Math.sin(e / 60) : -g * 3 * Math.abs(Math.sin(beat)),
        armArt: high ? lerp(80, -50, ease(seg(u, 0.55, 0.6))) : lerp(20, 80, op) - g * 8 * Math.abs(Math.sin(beat)),
        open: high ? true : g > 0 ? Math.sin(beat * 2) > 0 : undefined,
        lids: high,
        gazeTo: high ? undefined : m,
      };
    },
  },

  /* violin: tucked under his chin, long slow bows with his eyes shut, a quick run, and a flourish */
  violin: {
    zh: "拉小提琴",
    kind: "medium",
    ms: 8600,
    pose(c) {
      const { u, e, data } = c;
      const g = groove(u);
      const phones = phonesFor(c, g);
      const op = phones.show;
      // Bowing: long and slow, then a quick run, then the bow lifted off with a flourish.
      const run = u > 0.5 && u < 0.68;
      const lift = seg(u, 0.78, 0.84) * (1 - seg(u, 0.88, 0.95));
      const stroke = run ? Math.sin(c.t / 70) : Math.sin((e / (BEAT * 3)) * Math.PI);
      const armArt = lerp(20, 158, op) + g * 11 * stroke * (1 - lift) - 50 * lift;
      // The bow sits in his claw and points up across the strings.
      const a = (armArt * Math.PI) / 180;
      const cx = 176 + Math.cos(a) * 118, cy = 120 + Math.sin(a) * 118;
      const tip = [cx - 20, cy - 104];
      const bow = line(1810, [[cx, cy], tip], 3.2, "pen-b") + line(1811, [[cx + 4, cy - 4], [tip[0] + 4, tip[1] + 6]], 1.4, "pen-r");
      let win = noteStream(c, data, g * (lift > 0 ? 0 : 1), [[40, 88]], run ? BEAT / 2 : BEAT * 1.5);
      if (lift > 0.5 && once(data, "bravo")) {
        const p = c.at([40, 88]);
        data.bravo = { x: p.x, y: p.y, t0: c.t };
      }
      if (data.bravo && c.t - data.bravo.t0 < 900) {
        const k = (c.t - data.bravo.t0) / 900;
        win += `<g opacity="${(1 - k).toFixed(2)}">${burst(1820, data.bravo.x, data.bravo.y, 10 + k * 20, 24 + k * 34, 8, 2.8)}</g>`;
      }
      return {
        art: `<g opacity="${op.toFixed(2)}">${violin()}${bow}</g>` + phones.art,
        win,
        cap: false,
        armArt,
        open: false,
        // Head leaning on the violin, swaying slowly; still and intent through the quick run.
        tilt: -c.f * (op * 6 + g * (run ? 1 : 4) * Math.sin((e / (BEAT * 3)) * Math.PI)) + c.f * 5 * lift,
        hop: -g * (run ? 2 * Math.abs(Math.sin(c.t / 70)) : 0) - 8 * lift,
        lids: g > 0.3 && !run,
        gaze: run ? [-2.4 * c.f, 1.6] : [0, 0],
      };
    },
  },

  /* his entrance, for the start of a video: he flies slowly up into view from below the bottom of
     the screen on his thruster, hovers a moment, settles down and waves hello. */
  enter: {
    zh: "入场",
    kind: "entrance",
    ms: 5400,
    pose(c) {
      const { e, data } = c;
      const WAIT = 600, UP = 2900, HOVER = 3700, DOWN = 4200;
      const rise = 1 - Math.pow(1 - seg(e, WAIT, UP), 3);
      let hop;
      // Out of sight first. Started from hidden (data.hidden) he is already below the screen; started
      // while standing there he sinks down out of it on a low flame, rather than vanishing on the spot.
      if (e < WAIT) hop = data.hidden ? 240 : 240 * ease(e / WAIT);
      else if (e < UP) hop = lerp(240, -28, rise);
      else if (e < HOVER) hop = -28 + 4 * Math.sin(((e - UP) / 800) * Math.PI * 2);
      else hop = lerp(-28, 0, ease(seg(e, HOVER, DOWN)));
      // A soft touchdown: two small puffs of dust.
      if (e > DOWN && once(data, "down")) {
        const feet = c.at([120, 236]);
        c.puff({ x: feet.x - 12, y: feet.y }, -40, -8, 3, 8, 700);
        c.puff({ x: feet.x + 12, y: feet.y }, 40, -8, 3, 8, 700);
      }
      const flying = e < DOWN;
      const raise = seg(e, DOWN + 200, DOWN + 450) * (1 - seg(e, 5000, 5400));
      // Charged up: bolts crackling round him from the top of the climb to just after touchdown,
      // and "BLITZ BLITZ!" in comic letters popping up on the side with more room.
      let win = "";
      const charge = seg(e, 2300, 2600) * (1 - seg(e, DOWN + 500, DOWN + 900));
      if (charge > 0) {
        const mid = c.at([120, 150]);
        const j = Math.floor(c.t / 70);
        const r = rng(2000 + j);
        const n = e > DOWN && e < DOWN + 400 ? 9 : 6;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * TAU + r() * 0.6;
          const r0 = 72 + r() * 14;
          const from = [mid.x + Math.cos(ang) * r0, mid.y + Math.sin(ang) * r0 * 0.9];
          win += line(2010 + ((j + i) % 9), boltPts(2020 + ((j * 3 + i) % 11), from, 18 + r() * 14, ang, 3, 0.5), 3, (i + j) % 2 ? "pen-r" : "pen-b", true);
        }
        win = `<g opacity="${charge.toFixed(2)}">${win}</g>`;
      }
      const word = seg(e, 2700, 2900) * (1 - seg(e, DOWN + 700, DOWN + 1000));
      if (word > 0) {
        data.side ??= c.P.x > c.W / 2 ? -1 : 1;
        const head = c.at([120, 60]);
        const pop = 1 + 0.25 * Math.sin(Math.min(1, seg(e, 2700, 3000)) * Math.PI) + 0.04 * Math.sin(c.t / 60);
        const x = head.x + data.side * 46, y = head.y - 46;
        const txt = (cls, extra) => `<text x="0" y="0" text-anchor="${data.side < 0 ? "end" : "start"}" font-family="Marker Felt, Chalkboard SE, Comic Sans MS, sans-serif" font-weight="700" font-size="34" class="${cls}" ${extra}>BLITZ BLITZ!</text>`;
        win += `<g transform="translate(${fx(x)} ${fx(y)}) rotate(${-9 * data.side}) scale(${pop.toFixed(3)})" opacity="${word.toFixed(2)}">` +
          txt("", 'fill="none" stroke="#f6f3ec" stroke-width="12" stroke-linejoin="round"') +
          txt("", 'fill="none" stroke="var(--blue, #2b39a6)" stroke-width="6" stroke-linejoin="round"') +
          txt("pen-rf", "") +
          `</g>`;
      }
      const waving = e > DOWN + 300 && e < 5100;
      // Shades on for the arrival; pushed up onto his head as he waves, then gone.
      const up = ease(seg(e, DOWN + 500, DOWN + 800));
      const gone = seg(e, DOWN + 900, DOWN + 1100);
      const art = c.shades ? "" : gone < 1 ? `<g transform="translate(0 ${fx(-30 * up)}) rotate(${fx(-6 * up)} 121 70)" opacity="${(1 - gone).toFixed(2)}">${shades()}</g>` : "";
      return {
        hide: !!data.hidden && e < WAIT,
        art,
        hop,
        tilt: flying ? 3 * Math.sin(e / 420) : 0,
        flameLen: e < WAIT && !data.hidden ? 0.6 : flying ? lerp(1.3, 0.9, seg(e, UP, DOWN)) + 0.12 * Math.sin(c.t / 50) : undefined,
        flameSkew: flying ? Math.sin(c.t / 70) * 0.3 : undefined,
        armArt: flying ? 34 + 6 * Math.sin(e / 500) : lerp(20, -58, ease(raise)) + (waving ? 20 * Math.sin(c.t / 95) : 0),
        open: waving ? Math.sin(c.t / 95) > 0 : undefined,
        gaze: e < UP ? [0, -2] : waving ? [0, 1.2] : undefined,
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
        data.at = { x: Math.max(84, Math.min(c.W - 84, c.P.x + dir * 200)), y: c.ground - 104 };
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
      // The board he draws on: a sheet clipped to a board on an easel, there from the start.
      const boardOp = Math.min(fade, seg(e, 0, 400));
      data.board ??= boardInk(c.ground - o.y);
      win = `<g transform="translate(${fx(o.x)} ${fx(o.y)})" opacity="${boardOp.toFixed(2)}" filter="url(#wobble)">${data.board}</g>` +
        `<g transform="translate(${fx(o.x)} ${fx(o.y)})" opacity="${fade.toFixed(2)}" filter="url(#wobble)">${win}</g>`;
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

/** Sunglasses he keeps on, when set in the menu. */
export const sunglasses = () => shades();

/** Headphones he keeps on (late at night, or always, as set): the same pair, the cord swaying a little. */
export function headset(t) {
  return phonesArt(0, 1, Math.sin(t / 900) * 1.5);
}
