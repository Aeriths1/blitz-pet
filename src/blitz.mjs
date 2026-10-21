// Blitzcrank on the desktop. He stands on the bottom of the screen; point at him and his eyes follow
// the pointer and he waves, stay a while and his antenna spins and he lets off steam. Press and drag
// to pick him up by the head: he swings under the pointer, his flame sputters and he panics; let go
// and he is thrown, bounces off the sides and lands with a squash and a puff.
//
// Click him (or press ⌥Q) and he aims his hook, as in Aparté: the screen is read (Vision, in the main
// process), a lane runs from his shoulder to the pointer, and the sentence under its tip lights up
// with red hatching, anywhere on screen. Click to fire: the claw flies out on its chain, bites the
// sentence and hauls it back, and the explanation streams into a pen-drawn thought bubble above his
// head. Esc or the right button puts the hook away. Without leave to read the screen he hooks the
// clipboard instead, hung at the tip as a scrap of paper.
//
// Once nobody has used the computer for five minutes he lifts off on his thruster and drifts about
// the screen like the old DVD screensaver, bouncing off the edges (a corner hit makes his day).
// Point at him and he drops back. Till then he keeps to his spot.
//
// Or, now and then, he plays Doodle Jump: pen-drawn ledges appear and he bounces up them on his
// thruster, steering for the next one. From the menu bar you can take over: he follows the pointer
// left and right, the screen scrolls as he climbs, and a fall ends the run (Esc or the right button
// ends it sooner).
//
// Everything is drawn in the art's own units (256 px, facing right) inside one group that is flipped
// to face left or right, lifted, swung and squashed; the moving parts are drawn with the pen.
import { arc, boxPoints, ink, Pen, penPaths, ring, rng } from "./pen.mjs";
import { onSound, playActSound, playHookSound } from "./sound.mjs";
import { ACTS, actMs, headset, sunglasses } from "./acts.mjs";
import { paragraphAt, readScreen, sentenceAt } from "./text.mjs";

/** An event for the recording log, while recording (points in window px; see recorder.cjs). */
const rec = (ev) => s?.recording && host.rec?.(ev);
onSound((kind) => rec({ type: "sound", kind }));
const host = window.host ?? { hit() {}, aiming() {}, clip: async () => "", scan: async () => ({ lines: [] }), axAt: async () => ({ error: "no-host" }), copy() {}, explain() {}, stop() {}, onExplain() {}, onCommand() {} };

/* ---------- the art ---------- */
const B = 0.62; // art units to screen px
const SX = 176, SY = 120; // the throwing shoulder
const ARM_ART = 74; // shoulder to wrist
const HAND_K = 1.1; // the hand is drawn a little larger than the body
const PIVOT = [120, 50]; // he is held by the top of his head
const FEET = [120, 236];
const STACK = [69, 50];
const EYES = [[110, 71], [131, 71]];
const DROP = (FEET[1] - PIVOT[1]) * B; // from the top of his head to his feet, px
const DROP_ = DROP;
const HALF_W = 92 * B; // his half width, for the screen edges
const TOP = 30 * B; // from the top of his head to the tip of his antenna

/* ---------- timing and feel ---------- */
const DRAG_PX = 5;
const K = 70, LEN = 260, DAMP = 2.2; // the swing while held
const G = 2600; // gravity once thrown, px/s²
const WAVE_MS = 1100, DWELL_MS = 1500, SPIN_MS = 1500, LAND_MS = 1100;
const DRIFT_AFTER = 45000; // Blitz left alone (no pointer near him) this long: he does something long, in place
const ROAM_AFTER = 5 * 60000; // the computer left alone (no key, no mouse) this long: he may leave his spot
const DRIFT_SPEED = 85; // px/s
const GRAB_MS = 140;
const BOIL_MS = 120;
const CHARGE_MS = 450; // held this long, the hook takes the whole paragraph // how often the pen lines of the lane and the highlight are redrawn

const now = () => performance.now();
const W = () => window.innerWidth;
// The flame hangs below his feet; leave room for it.
const GROUND = () => window.innerHeight - 4 - 22 * B;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const seeds = rng(97);
const seed = () => Math.floor(seeds() * 1e6);
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ---------- the stage ---------- */
const stage = document.getElementById("stage");
stage.innerHTML = `
<defs>
  <filter id="sticker" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feMorphology in="SourceAlpha" operator="dilate" radius="17" result="d"/>
    <feMorphology in="d" operator="erode" radius="13" result="c"/>
    <feFlood flood-color="#f6f3ec" flood-opacity="0.94"/>
    <feComposite in2="c" operator="in" result="paper"/>
    <feMerge><feMergeNode in="paper"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="wobble" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="11"/>
    <feDisplacementMap in="SourceGraphic" scale="2.2"/>
  </filter>
</defs>
<g id="game"></g>
<g id="lane" filter="url(#wobble)"></g>
<g id="bob">
  <g id="art" filter="url(#sticker)">
    <ellipse cx="117" cy="146" rx="66" ry="64" class="pen-paper"/><ellipse cx="120" cy="78" rx="34" ry="28" class="pen-paper"/>
    <image href="assets/pet-body.svg" x="0" y="0" width="256" height="256"/>
    <g id="dyn"></g>
    <g id="armG"><image href="assets/arm.svg" x="-8" y="-24" width="96" height="48"/></g>
    <g id="handG">
      <image id="hOpen" href="assets/claw-open.svg" x="-12" y="-48" width="112" height="96"/>
      <image id="hShut" href="assets/claw-shut.svg" x="-12" y="-48" width="112" height="96"/>
    </g>
    <g id="bangs"></g>
  </g>
  <g id="hitG"><rect id="hit" x="30" y="10" width="270" height="246" fill="transparent"/></g>
</g>
<g id="chain" filter="url(#wobble)"></g>
<g id="card"></g>
<g id="fly" filter="url(#sticker)">
  <image id="fOpen" href="assets/claw-open.svg" x="-12" y="-48" width="112" height="96"/>
  <image id="fShut" href="assets/claw-shut.svg" x="-12" y="-48" width="112" height="96"/>
</g>
<g id="sparks" filter="url(#wobble)"></g>
<g id="act"></g>
<g id="fx"></g>`;
const $ = (id) => document.getElementById(id);
const el = {
  lane: $("lane"), bob: $("bob"), art: $("art"), dyn: $("dyn"), armG: $("armG"), handG: $("handG"), hOpen: $("hOpen"), hShut: $("hShut"),
  bangs: $("bangs"), hitG: $("hitG"), hit: $("hit"), chain: $("chain"), card: $("card"), fly: $("fly"), fOpen: $("fOpen"), fShut: $("fShut"), fx: $("fx"), sparks: $("sparks"), game: $("game"), act: $("act"),
};
const show = (node, on) => (node.style.display = on ? "" : "none");
const turb = stage.querySelector("#wobble feTurbulence");

/* ---------- the parts that never change ---------- */
/** Headphones or sunglasses as worn: put on, they come down from above onto his head (the shades
 *  slowly, the way they do in the "deal with it" meme, with a little bounce); taken off, they lift
 *  away and fade. Art units, drawn on him. */
function worn(what, art, t) {
  const on = s[what];
  const ms = what === "shades" ? 900 : 550;
  const k = Math.min(1, (t - s.wornAt[what]) / ms);
  if (!on && k >= 1) return "";
  if (on && k >= 1) return art;
  const e = 1 - (1 - k) * (1 - k);
  let dy, op;
  if (on) {
    dy = -(what === "shades" ? 90 : 60) * (1 - e) + (what === "shades" ? 3 * Math.sin(k * Math.PI * 3) * (1 - k) : 0);
    op = Math.min(1, k * 3);
  } else {
    dy = -50 * e;
    op = 1 - k;
  }
  return `<g transform="translate(0 ${dy.toFixed(1)})" opacity="${op.toFixed(2)}">${art}</g>`;
}
/** Now and then, while he stands about, a glint runs along his claw: a little four-point star that
 *  swells and turns and is gone. Window px, drawn above him. */
const GLINT_EVERY = 30000, GLINT_MS = 750; // about twice a minute
function clawGlint(t, armArt) {
  const k = (t % GLINT_EVERY) / GLINT_MS;
  if (k >= 1) return "";
  const ar = (armArt * Math.PI) / 180;
  // On the claw's upper jaw, out along the arm from the wrist.
  const fx0 = SX + Math.cos(ar) * ARM_ART, fy0 = SY + Math.sin(ar) * ARM_ART;
  const ox = 80 * HAND_K, oy = -27 * HAND_K;
  const p = at([fx0 + Math.cos(ar) * ox - Math.sin(ar) * oy, fy0 + Math.sin(ar) * ox + Math.cos(ar) * oy]);
  const r = 15 * Math.sin(k * Math.PI);
  const q = r * 0.28;
  const star = `M0 ${-r}L${q} ${-q}L${r} 0L${q} ${q}L0 ${r}L${-q} ${q}L${-r} 0L${-q} ${-q}Z`;
  return `<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(k * 50).toFixed(1)})"><path d="${star}" fill="#fffdf5" stroke="#2b39a6" stroke-width="1.6" stroke-linejoin="round"/></g>`;
}
function flameInk(sd, len, skew) {
  const f = [[104, 220], [120 + skew * 14, 220 + 34 * len], [136, 220]];
  const p = new Pen(sd);
  p.hatch(f, { angle: 1.4, gap: 6, w: 3 });
  const hatch = p.strokes;
  p.strokes = [];
  p.line(f, { w: 5 });
  return ink(hatch, "pen-r") + ink(p.strokes, "pen-r");
}
const INK = {
  stalk: ink(new Pen(53).line([[120, 56], [120, 38]], { w: 5 }).strokes, "pen-b"),
  eyes: EYES.map(([x, y], i) => ink(penPaths(ring(x, y, 7.5, 12), 61 + i).map((p) => ({ ...p, w: p.w * 1.6 })), "pen-b")),
  lids: EYES.map(([x, y], i) => ink(new Pen(71 + i).line([[x - 7, y + 1], [x + 7, y + 1]], { w: 3.6 }).strokes, "pen-b")),
  bang: ink(new Pen(83).line([[0, -26], [2, 2]], { w: 7 }).strokes, "pen-r") + `<circle cx="3" cy="15" r="5" class="pen-rf"/>`,
  whoosh: ink(
    [...new Pen(89).line(arc(120, 31, 24, 7, 0.25, Math.PI - 0.25, 12), { w: 3 }).strokes, ...new Pen(90).line(arc(120, 31, 30, 9, Math.PI + 0.5, Math.PI * 2 - 0.5, 12), { w: 2.4 }).strokes],
    "pen-b"
  ),
  flame: flameInk(5, 1, 0),
};
const steamInk = () => ink(penPaths(ring(0, 0, 10, 12), seed()), "pen-b", true);
const dropInk = () => ink(new Pen(seed()).line([[0, -7], ...arc(0, 1.5, 4.2, 4.2, -Math.PI / 2 + 0.8, Math.PI * 1.5 - 0.8, 12)], { closed: true, w: 2.2 }).strokes, "pen-b", true);

/* ---------- state ---------- */
const s = {
  mode: "ground", // ground | drag | fall | land | drift | aim | cast
  t: 0,
  f: -1, // facing: -1 left, 1 right
  P: { x: W() - 110, y: GROUND() - DROP }, // the top of his head
  k: 1, // his size: 1 at home, smaller inside the game
  vel: { x: 0, y: 0 },
  th: 0,
  om: 0,
  grab: { x: 0, y: 0 },
  pointer: { x: -1e4, y: -1e4 },
  pcIdle: 0, // seconds since the last key or mouse input anywhere on the computer
  press: null,
  over: false,
  hoverAt: 0,
  waveAt: -1e9,
  spinAt: -1e9,
  spun: false,
  blinkUntil: 0,
  landAt: 0,
  dragAt: -1e9,
  startleAt: -1e9,
  nextDrop: 0,
  flameSeed: 5,
  flameAt: 0,
  seen: now(),
  nextIdle: now() + 9000,
  drift: true,
  bounces: 0,
  puffs: [],
  drops: [],
  aim: null, // { a, tip, armed, scanning, blocks, target, clip }
  cast: null, // { start, a, from, to, hit, target, clip, text, fly, back, clanked }
  act: null, // { name, t0, data }: an idle act from acts.mjs, played while he stands about
  actPose: null,
  idleN: 0,
  pointerAt: 0,
  snatchAt: -1e9,
  hour: new Date().getHours(),
  phones: false, // headphones on, from the menu
  shades: false, // sunglasses on, from the menu
  wornAt: { phones: -1e9, shades: -1e9 }, // when each was last put on or taken off
};
const set = (mode) => {
  if (mode !== "ground") s.stroll = null;
  s.mode = mode;
  s.t = now();
  // An act is played only while he stands about; anything else ends it.
  if (mode !== "ground") stopAct();
};
const onGround = () => s.P.y >= GROUND() - DROP - 1;

/* ---------- geometry: art units to window px ---------- */
let squash = { sx: 1, sy: 1 };
function at([ax, ay]) {
  let x = s.f * (ax - PIVOT[0]) * B * s.k;
  let y = (ay - PIVOT[1]) * B * s.k;
  const DROP = DROP_ * s.k;
  x *= squash.sx;
  y = DROP + (y - DROP) * squash.sy;
  const c = Math.cos(s.th), n = Math.sin(s.th);
  return { x: s.P.x + x * c - y * n, y: s.P.y + x * n + y * c };
}

function puff(p, vx, vy, r0, r1, life = 1200, delay = 0) {
  s.puffs.push({ x: p.x, y: p.y, vx, vy, t0: now() + delay, life, r0, r1, ink: steamInk() });
}
function landPuffs() {
  const feet = at(FEET);
  puff(at(STACK), 18, -46, 4, 13, 1300);
  puff(at(STACK), -10, -38, 3, 9, 1100, 120);
  puff({ x: feet.x - 14, y: feet.y - 4 }, -70, -14, 3, 10, 800);
  puff({ x: feet.x + 14, y: feet.y - 4 }, 70, -14, 3, 10, 800);
}

/* ---------- the pointer ---------- */
function hitTest(x, y) {
  const e = document.elementFromPoint(x, y);
  return !!e && (e === el.hit || bubble.el.contains(e) || menu.el.contains(e));
}
function catchMouse() {
  host.hit(menu.open || s.over || !!s.press || s.mode === "drag" || s.mode === "aim" || s.mode === "cast" || (s.mode === "game" && s.game?.player));
}
function setOver(on) {
  if (on === s.over) return;
  s.over = on;
  catchMouse();
  const under = document.elementFromPoint(s.pointer.x, s.pointer.y);
  document.body.classList.toggle("grab", on && !bubble.el.contains(under) && !menu.el.contains(under));
}
function noticed() {
  s.seen = now();
  if (s.mode === "game" && !s.game.player) return endGame(true);
  if (s.mode === "drift") {
    // Caught drifting: he starts and drops back down.
    s.startleAt = now();
    s.vel = { x: s.vel.x * 0.3, y: 0 };
    set("fall");
  }
}
function onHover() {
  if (s.mode === "drift" || (s.mode === "game" && !s.game.player)) return noticed();
  if (s.mode !== "ground") return;
  // Pointed at, he breaks off anything long, waking from a nap with a start.
  if (s.act && ACTS[s.act.name].kind !== "small" && s.act.name !== "snatch") {
    if (s.act.name === "nap") s.startleAt = now();
    stopAct();
  }
  // He turns to whoever is pointing at him.
  if (!s.act) s.f = s.pointer.x > s.P.x ? 1 : -1;
  s.stroll = null;
  s.hoverAt = now();
  s.spun = false;
  if (now() > s.waveAt + WAVE_MS + 600) s.waveAt = now();
}

window.addEventListener("mousemove", (e) => {
  s.pointer = { x: e.clientX, y: e.clientY };
  s.pointerAt = now();
  menu.track(e.clientX, e.clientY);
  if (s.mode === "aim") return aimAt(e.clientX, e.clientY);
  if (s.press && s.mode !== "drag" && Math.hypot(e.clientX - s.press.x, e.clientY - s.press.y) > DRAG_PX) return pickUp(e);
  if (s.mode === "drag" || s.mode === "cast" || (s.mode === "game" && s.game.player)) return;
  const on = hitTest(e.clientX, e.clientY);
  if (on && !s.over && document.elementFromPoint(e.clientX, e.clientY) === el.hit) {
    s.seen = now();
    onHover();
  }
  setOver(on);
});
window.addEventListener("mousedown", (e) => {
  if (menu.open && !menu.el.contains(e.target)) menu.close();
  if (s.mode === "game" && s.game.player) {
    if (e.button === 2) endGame(true);
    return;
  }
  if (s.mode === "aim") {
    e.preventDefault();
    if (e.button === 2) return endAim();
    if (e.button === 0) {
      s.aim.armed = true;
      s.aim.pressAt = now();
      rec({ type: "charge_start", at: [e.clientX, e.clientY] });
    }
    return;
  }
  // The right button on him opens his menu.
  if (e.button === 2 && s.mode !== "cast" && document.elementFromPoint(e.clientX, e.clientY) === el.hit) {
    e.preventDefault();
    noticed();
    return menu.show(e.clientX, e.clientY);
  }
  if (s.mode === "cast" || e.button !== 0 || document.elementFromPoint(e.clientX, e.clientY) !== el.hit) return;
  e.preventDefault();
  s.press = { x: e.clientX, y: e.clientY };
  s.pointer = { x: e.clientX, y: e.clientY };
  noticed();
  catchMouse();
});
window.addEventListener("mouseup", (e) => {
  if (s.mode === "aim") {
    if (e.button === 0 && s.aim.armed) fire();
    return;
  }
  const pressed = s.press;
  s.press = null;
  if (s.mode === "drag") return letGo();
  if (pressed && e.button === 0) startAim("click");
  catchMouse();
});
window.addEventListener("contextmenu", (e) => e.preventDefault());

function pickUp(e) {
  s.press = null;
  s.dragAt = now();
  s.grab = { x: s.P.x - e.clientX, y: s.P.y - e.clientY };
  s.vel = { x: 0, y: 0 };
  s.nextDrop = now() + 120;
  set("drag");
  rec({ type: "pick_up", at: [s.P.x, s.P.y] });
  document.body.classList.add("grabbing");
  catchMouse();
}
function letGo() {
  document.body.classList.remove("grabbing");
  s.vel = { x: clamp(s.vel.x, -2200, 2200), y: clamp(s.vel.y, -2200, 2200) };
  rec({ type: "throw", at: [s.P.x, s.P.y], vel: [Math.round(s.vel.x), Math.round(s.vel.y)] });
  set("fall");
  s.over = false;
  catchMouse();
}

/* ---------- the hook ---------- */
function shoulder() {
  return at([SX, SY]);
}
async function startAim(from = "click") {
  if (s.mode === "drag" || s.mode === "cast" || s.mode === "aim" || s.mode === "fall" || s.mode === "game") return;
  rec({ type: "aim_start", from, at: [s.P.x, s.P.y] });
  s.seen = now();
  bubble.close();
  s.vel = { x: 0, y: 0 };
  s.th = 0;
  s.om = 0;
  const a = { a: 0, tip: { ...s.pointer }, armed: false, scanning: true, blocks: null, target: null, clip: "", ax: null, axBusy: false, axDirty: false, win: null, scope: "sentence", pressAt: 0 };
  s.aim = a;
  set("aim");
  host.aiming(true);
  catchMouse();
  // From the keyboard the pointer may be anywhere, even off the window: aim up and inwards.
  const p = s.pointer.x < -1000 ? { x: s.P.x - 300 * -s.f, y: s.P.y - 200 } : s.pointer;
  aimAt(p.x, p.y);
  // Read the screen; without leave to, fall back on the clipboard.
  const res = await host.scan();
  a.scanning = false;
  if (res.lines?.length) a.blocks = readScreen(res.lines);
  else if (!axOn) {
    a.clip = ((await host.clip()) || "").trim();
    if (res.error && !warned) {
      warned = true;
      bubble.note(res.error + "\n现在先抓剪贴板。", 7000);
    }
  }
  if (s.aim === a) aimAt(a.tip.x, a.tip.y);
}
let warned = false;
// Off once the Accessibility API says it has no leave; the OCR path carries on alone.
let axOn = true;

/** Ask the Accessibility API for the sentence under the tip: one question at a time, the latest tip. */
async function askAx(a) {
  if (!axOn || a.noAx) return;
  if (a.axBusy) return void (a.axDirty = true);
  a.axBusy = true;
  const tip = { ...a.tip };
  const scope = a.scope;
  const r = await host.axAt(Math.round(tip.x), Math.round(tip.y), scope);
  a.axBusy = false;
  if (s.aim !== a) return;
  if (r.error === "no-permission") axOn = false;
  // Preview's text answers every point with its first line's sentence: OCR does better there.
  if (r.bundle === "com.apple.Preview") a.noAx = true;
  if (Array.isArray(r.window)) a.win = { frame: r.window, title: r.title, app: r.app, url: r.url ?? null, doc: r.doc ?? null };
  if (scope !== a.scope) return askAx(a);
  a.ax = r.text && r.rects?.length ? { ...r, tip } : null;
  pick(a);
  if (a.axDirty) {
    a.axDirty = false;
    askAx(a);
  }
}
const squeeze = (t) => (t ?? "").replace(/\s+/g, "").replace(/[“”"「」]/g, "");
const inside = (rects, p, pad = 8) => rects.some((r) => p.x >= r[0] - pad && p.x <= r[0] + r[2] + pad && p.y >= r[1] - pad && p.y <= r[1] + r[3] + pad);

/** The text on screen in reading order, kept to the window under the tip, as context for OCR. */
function ocrContext(a, sentence) {
  const f = a.win?.frame;
  const blocks = (a.blocks ?? []).filter((b) => {
    if (!f) return true;
    const [x, y, w, h] = b.lines[0].b;
    const cx = x + w / 2, cy = y + h / 2;
    return cx >= f[0] && cx <= f[0] + f[2] && cy >= f[1] && cy <= f[1] + f[3];
  });
  blocks.sort((p, q) => p.lines[0].b[1] - q.lines[0].b[1] || p.lines[0].b[0] - q.lines[0].b[0]);
  const all = blocks.map((b) => b.text).join("\n");
  if (all.length <= 6000) return all;
  const at = Math.max(0, all.indexOf(sentence.slice(0, 20)));
  return all.slice(Math.max(0, at - 3000), at + 3000);
}

/** The sentence to light up: the Accessibility API's when it is about this tip, else OCR's. */
function pick(a) {
  const para = a.scope === "paragraph";
  const ocr = a.blocks ? (para ? paragraphAt : sentenceAt)(a.blocks, a.tip.x, a.tip.y) : null;
  let t = null;
  const ax = a.ax && inside(a.ax.rects, a.tip) ? a.ax : null;
  // A PDF hands its text over a line at a time: when OCR's sentence holds the API's and runs on, take OCR's.
  const cut = ax && ocr && ax.method === "chars" && squeeze(ocr.text).length > squeeze(ax.text).length + 3 && squeeze(ocr.text).includes(squeeze(ax.text));
  if (ax && !cut) {
    t = { key: "ax:" + ax.text, text: ax.text, rects: ax.rects.map(([x, y, w, h]) => ({ x, y, w, h })), context: ax.context ?? "", via: ax.method };
  } else if (ocr) {
    t = { ...ocr, key: "ocr:" + ocr.text, context: ocrContext(a, ocr.text), via: "ocr" };
  }
  if (t) Object.assign(t, { title: a.win?.title ?? "", app: a.win?.app ?? "", scope: a.scope, url: a.win?.url ?? null, doc: a.win?.doc ?? null });
  if (t && t.key !== a.target?.key) {
    playHookSound("tick");
    a.lockedAt = now();
    rec({ type: "target", text: t.text, rects: t.rects.map((r) => [r.x, r.y, r.w, r.h]), via: t.via, scope: t.scope });
  }
  a.target = t;
}

function aimAt(x, y) {
  const a = s.aim;
  if (!a) return;
  const sh = shoulder();
  const ang = Math.atan2(y - sh.y, x - sh.x);
  // He faces the side he throws to.
  const f = Math.cos(ang) >= 0 ? 1 : -1;
  if (f !== s.f) s.f = f;
  const prev = a.tip;
  a.a = ang;
  a.tip = { x, y };
  pick(a);
  askAx(a);
  if (!a.blocks && !a.target && a.clip && Math.hypot(prev.x - x, prev.y - y) > 60) playHookSound("tick");
}
function endAim() {
  rec({ type: "aim_end", reason: "cancel" });
  playHookSound("charge-stop");
  s.aim = null;
  host.aiming(false);
  set(onGround() ? "ground" : "fall");
  catchMouse();
}
function fire() {
  const a = s.aim;
  const sh = shoulder();
  const fist = { x: sh.x + Math.cos(a.a) * ARM_ART * B, y: sh.y + Math.sin(a.a) * ARM_ART * B };
  const d = Math.hypot(a.tip.x - fist.x, a.tip.y - fist.y);
  const text = a.target?.text || (a.blocks || axOn ? "" : a.clip);
  s.cast = { start: now(), a: a.a, from: fist, to: a.tip, hit: !!text, target: a.target, clip: a.target ? "" : a.clip, text, fly: clamp(d * 0.42, 160, 420), back: clamp(d * 0.55, 200, 520), clanked: false };
  rec({ type: "aim_end", reason: "fire" });
  rec({ type: "fire", from: [fist.x, fist.y], to: [a.tip.x, a.tip.y], hit: !!text });
  playHookSound("charge-stop");
  playHookSound(a.scope === "paragraph" ? "hook-charged" : "hook");
  s.aim = null;
  host.aiming(false);
  set("cast");
}
function castDone() {
  const c = s.cast;
  rec({ type: "reel_end", hit: c.hit });
  s.cast = null;
  set(onGround() ? "ground" : "fall");
  catchMouse();
  if (c.hit) bubble.ask(c.target ? { text: c.text, context: c.target.context, title: c.target.title, app: c.target.app, scope: c.target.scope, url: c.target.url, doc: c.target.doc, ocr: c.target.via === "ocr" } : { text: c.text });
  else if (!c.target && c.clip === "" && warned) bubble.note("剪贴板里没有文字。先复制一段，再出钩。", 3200);
}

/* ---------- the thought bubble ---------- */
const bubble = (() => {
  const box = document.getElementById("bubble");
  const frame = box.querySelector(".ink");
  const quote = box.querySelector(".quote");
  const body = box.querySelector(".text");
  const copy = box.querySelector(".copy");
  const source = box.querySelector(".source");
  let id = 0;
  let from = null; // { url, doc, app, title } of what was grabbed
  let open = false;
  let answer = "";
  let thinking = false;
  let timer = 0;
  let size = { w: 0, h: 0 };

  const redraw = () => {
    const w = box.offsetWidth, h = box.offsetHeight;
    if (!w || (w === size.w && h === size.h)) return;
    size = { w, h };
    frame.setAttribute("width", w + 80);
    frame.setAttribute("height", h + 140);
    frame.querySelector(".frame").innerHTML = penPaths(boxPoints(w, h, 18), 29).map((p) => `<path d="${p.d}" stroke-width="${p.w}" opacity="${p.op}"/>`).join("");
  };
  new ResizeObserver(redraw).observe(box);

  const render = () => {
    if (thinking) body.innerHTML = `<div class="dots"><span></span><span></span><span></span></div>`;
    else {
      // The first line is the gist, the rest is a quieter aside. Without a line break, the first sentence is the gist.
      const a = answer.replace(/\*\*/g, "").trim();
      let cut = a.indexOf("\n");
      if (cut < 0) {
        const m = /[。！？!?]|\.(?=\s)/.exec(a.slice(6));
        cut = m ? m.index + 7 : -1;
      }
      const gist = cut < 0 ? a : a.slice(0, cut).trim();
      const more = cut < 0 ? "" : a.slice(cut).trim();
      body.innerHTML = `<div class="gist"><span>${esc(gist)}</span></div>` + (more ? `<div class="more">${esc(more).replace(/\n+/g, "<br>")}</div>` : "");
    }
    copy.style.display = !thinking && answer && quote.textContent ? "" : "none";
    // Where it came from: a web page (its site) or a document.
    const web = from?.url && /^https?:/.test(from.url) ? from.url : null;
    const label = web ? new URL(web).hostname.replace(/^www\./, "") : from?.doc ? decodeURIComponent(from.doc.split("/").pop()) : from?.app || "";
    source.textContent = label ? `来自 ${label}` : "";
    source.title = web || from?.doc || from?.title || "";
    source.style.display = label ? "" : "none";
  };
  const show = (q) => {
    clearTimeout(timer);
    open = true;
    quote.textContent = q ? `“${q.length > 90 ? q.slice(0, 88) + "…" : q}”` : "";
    quote.style.display = q ? "" : "none";
    box.classList.add("open");
    size = { w: 0, h: 0 };
  };

  host.onExplain((ev) => {
    if (ev.id !== id) return;
    if (ev.kind === "delta") {
      thinking = false;
      answer += ev.text;
    } else if (ev.kind === "error" && ev.text) {
      thinking = false;
      answer = answer ? `${answer}\n\n（${ev.text}）` : ev.text;
    } else if (ev.kind === "done" || ev.kind === "error") thinking = false;
    if (ev.kind === "done" || ev.kind === "error") rec({ type: "answer_done", text: answer });
    render();
  });

  copy.addEventListener("click", () => {
    host.copy(answer);
    copy.textContent = "已复制";
    setTimeout(() => (copy.textContent = "复制"), 1200);
  });
  box.querySelector(".close").addEventListener("click", () => close());
  source.addEventListener("click", () => (from?.url || from?.doc) && host.open(from.url || from.doc));
  function close() {
    if (!open) return;
    rec({ type: "bubble_close" });
    open = false;
    thinking = false;
    id++;
    host.stop();
    box.classList.remove("open");
    s.seen = now();
    setOver(false);
  }

  return {
    el: box,
    get open() {
      return open;
    },
    get thinking() {
      return thinking;
    },
    /** { text, context?, title?, app? } */
    ask(q) {
      rec({ type: "bubble_open", quote: q.text, scope: q.scope, url: q.url ?? undefined });
      id++;
      answer = "";
      thinking = true;
      from = { url: q.url, doc: q.doc, app: q.app, title: q.title };
      show(q.text);
      render();
      host.explain(id, { ...q, lang: menu.lang });
    },
    note(text, ms) {
      id++;
      answer = text;
      thinking = false;
      from = null;
      show("");
      render();
      timer = setTimeout(close, ms);
    },
    close,
    /** Keep above his head, with a trail of small circles down to it. */
    place(head) {
      if (!open) return;
      redraw();
      const { w, h } = size;
      const x = clamp(head.x - w * 0.62, 10, W() - w - 10);
      const y = Math.max(10, head.y - 46 - h);
      box.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const from = { x: clamp(head.x, x + 30, x + w - 30), y: y + h + 8 };
      frame.querySelector(".trail").innerHTML = [0.28, 0.6, 0.88]
        .map((t, i) => {
          const cx = from.x + (head.x - from.x) * t - x;
          const cy = from.y + (head.y - 4 - from.y) * t - y;
          return penPaths(ring(cx, cy, 8 - i * 2.4), 31 + i).map((p) => `<path d="${p.d}" stroke-width="${p.w * 0.8}" opacity="${p.op}"/>`).join("");
        })
        .join("");
    },
  };
})();

/* ---------- the right-click menu ---------- */
// Right-click him: a small square of paper opens by the pointer. The first page lists what there is
// (his idle acts, what he can do, settings); pick one and the second page lists its items, with a
// way back. The item under the pointer gets a red handwritten underline, as do the settings that are on.
const menu = (() => {
  const box = document.getElementById("menu");
  const frame = box.querySelector(".ink");
  const list = box.querySelector(".items");
  let open = false;
  let page = -1; // -1 the first page, else the section shown
  let leaveTimer = 0;

  const go = (c) => () => {
    close();
    command(c);
  };
  const setting = (c) => () => {
    command(c);
    host.pref?.({ drift: s.drift, phones: s.phones, shades: s.shades });
    render();
  };
  // In Chinese or English, menu and explanations alike: the system's language until switched here
  // (remembered on this computer).
  let lang = (() => {
    try {
      const v = localStorage.getItem("blitz-lang");
      if (v === "zh" || v === "en") return v;
    } catch {}
    return /^zh/i.test(navigator.language) ? "zh" : "en";
  })();
  const ACT_EN = { ring: "Smoke ring", sneeze: "Sneeze", punch: "Punch", nap: "Nap", dash: "Dash", chime: "Chime", snatch: "Snatch", doodle: "Doodle", music: "Music", guitar: "Guitar", dj: "DJ", sing: "Sing", violin: "Violin", enter: "Entrance" };
  const T = (zh, en) => (lang === "en" ? en : zh);
  const switchLang = () => {
    lang = lang === "en" ? "zh" : "en";
    try {
      localStorage.setItem("blitz-lang", lang);
    } catch {}
    render();
  };
  const sections = () => [
    { title: T("待机动画", "Idle"), cols: 2, items: Object.entries(ACTS).map(([name, a]) => ({ label: lang === "en" ? ACT_EN[name] ?? name : a.zh, run: go(`act:${name}`) })) },
    {
      title: T("操作", "Actions"),
      items: [
        { label: T("出钩抓一句", "Hook a line"), run: go("aim") },
        { label: T("现在就飘", "Float now"), run: go("drift-now") },
        { label: T("看他自己跳", "Watch him jump"), run: go("autoplay") },
        { label: T("玩 Doodle Jump", "Play Doodle Jump"), run: go("play") },
        { label: T("回到右下角", "Go home"), run: go("home") },
      ],
    },
    {
      title: T("设置", "Settings"),
      wide: true,
      items: [
        { label: T("语言", "Language"), choice: T("简体中文", "English"), run: switchLang },
        { label: T("待机时自己玩", "Play when idle"), on: s.drift, run: setting(s.drift ? "drift-off" : "drift-on") },
        { label: T("戴耳机", "Headphones"), on: s.phones, run: setting(s.phones ? "phones-off" : "phones-on") },
        { label: T("戴墨镜", "Sunglasses"), on: s.shades, run: setting(s.shades ? "shades-off" : "shades-on") },
      ],
    },
  ];

  const button = (label, run, cls = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.innerHTML = `<span>${esc(label)}</span><svg></svg>`;
    b.addEventListener("click", run);
    return b;
  };
  function render() {
    list.innerHTML = "";
    const all = sections();
    box.classList.toggle("wide", !!all[page]?.wide);
    const grid = document.createElement("div");
    if (page < 0) {
      grid.className = "grid top";
      all.forEach((sec, i) => grid.append(button(`${sec.title} ›`, () => ((page = i), render()))));
      list.append(grid);
    } else {
      const sec = all[page];
      const head = document.createElement("div");
      head.className = "head";
      head.append(button(T("‹ 返回", "‹ Back"), () => ((page = -1), render()), "back"));
      const h = document.createElement("h4");
      h.textContent = sec.title;
      head.append(h);
      grid.className = sec.cols === 2 ? "grid two scroll" : "grid scroll";
      for (const it of sec.items) {
        if (!it.choice) {
          grid.append(button(it.label, it.run, it.on ? "on" : ""));
          continue;
        }
        // A choice between values, stepped with arrows either side: ‹ 简体中文 ›
        const row = document.createElement("div");
        row.className = "choice";
        const name = document.createElement("span");
        name.textContent = it.label;
        const value = document.createElement("span");
        value.className = "value";
        value.textContent = it.choice;
        row.append(name, button("‹", it.run, "arrow"), value, button("›", it.run, "arrow"));
        grid.append(row);
      }
      list.append(head, grid);
      const more = () => grid.classList.toggle("more", grid.scrollTop + grid.clientHeight < grid.scrollHeight - 2);
      grid.addEventListener("scroll", more);
      requestAnimationFrame(more);
    }
    // A wobbly red underline under each label, revealed along its length on hover.
    let sd = 1700 + page * 40;
    for (const b of list.querySelectorAll("button")) {
      const w = b.firstChild.offsetWidth;
      const svg = b.lastChild;
      svg.setAttribute("width", w);
      svg.setAttribute("height", 8);
      svg.innerHTML = new Pen(sd++)
        .line([[0, 4.5], [w * 0.35, 2.8], [w * 0.7, 5.2], [w, 3.4]], { w: 2.4 })
        .strokes.map((p) => `<path d="${p.d}" stroke-width="${p.w}" opacity="${p.op}" pathLength="1"/>`)
        .join("");
    }
    const w = box.offsetWidth, h = box.offsetHeight;
    frame.setAttribute("width", w + 20);
    frame.setAttribute("height", h + 20);
    frame.innerHTML = penPaths(boxPoints(w, h, 14), 37).map((p) => `<path d="${p.d}" stroke-width="${p.w}" opacity="${p.op}"/>`).join("");
    place();
  }
  /** Above his head, centred on him. */
  function place() {
    const w = box.offsetWidth, h = box.offsetHeight;
    const head = at([120, 20]);
    const left = clamp(head.x - w / 2, 10, W() - w - 10);
    const top = clamp(head.y - h - 14, 10, window.innerHeight - h - 10);
    box.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
  }

  function show(x, y) {
    bubble.close();
    page = -1;
    render();
    box.classList.add("open");
    open = true;
    rec({ type: "menu_open", at: [x, y] });
    catchMouse();
  }
  function close() {
    if (!open) return;
    clearTimeout(leaveTimer);
    open = false;
    box.classList.remove("open");
    s.seen = now();
    catchMouse();
  }
  /** The pointer wandered well away from the menu (and from him): it folds away. */
  function track(x, y) {
    if (!open) return;
    const r = box.getBoundingClientRect();
    const near = x > r.left - 60 && x < r.right + 60 && y > r.top - 60 && y < r.bottom + 60;
    clearTimeout(leaveTimer);
    if (!near && document.elementFromPoint(x, y) !== el.hit) leaveTimer = setTimeout(close, 700);
  }

  return {
    el: box,
    get open() {
      return open;
    },
    /** "zh" | "en": the language he explains in too. */
    get lang() {
      return lang;
    },
    show,
    close,
    track,
  };
})();

/* ---------- commands from the menu bar and ⌥Q ---------- */
const command = (c) => {
  if (c === "aim") startAim("hotkey");
  else if (c === "cancel" && s.mode === "aim") endAim();
  else if (c === "cancel" && s.mode === "game") endGame(true);
  else if (c === "play" || c === "autoplay") {
    bubble.close();
    if (s.mode === "aim") endAim();
    if (s.mode === "game") endGame(false);
    startGame(c === "play");
  }
  else if (c === "home") {
    bubble.close();
    if (s.mode === "aim") endAim();
    s.P = { x: W() - 110, y: 40 };
    s.vel = { x: 0, y: 0 };
    s.f = -1;
    set("fall");
  } else if (c === "drift-now") {
    s.seen = -1e9;
    if (s.mode === "ground") liftOff();
  } else if (c === "act:enter" || c === "enter-hidden") {
    // His entrance: once at a time, so a second press can't restart it halfway up.
    if (s.act?.name === "enter") return;
    bubble.close();
    if (s.mode === "aim") endAim();
    if (s.mode === "game") endGame(false);
    if (s.mode !== "ground") return;
    startAct("enter");
    if (s.act && c === "enter-hidden") s.act.data.hidden = true;
  } else if (c.startsWith("act:")) {
    bubble.close();
    if (s.mode === "aim") endAim();
    if (s.mode === "game") endGame(false);
    if (s.mode === "ground") startAct(c.slice(4));
  } else if (c === "phones-on" || c === "phones-off" || c === "shades-on" || c === "shades-off") {
    // Put on or taken off, with a little animation (see worn()).
    const [what, on] = c.split("-");
    if (s[what] !== (on === "on")) s.wornAt[what] = now();
    s[what] = on === "on";
  }
  else if (c === "rec-on") s.recording = true;
  else if (c === "rec-off") s.recording = s.recQuiet = false;
  else if (c === "rec-quiet") s.recQuiet = true; // a promo take: no recording ring on him
  else if (c === "drift-on") s.drift = true;
  else if (c === "drift-off") s.drift = false;
};
host.onCommand(command);
window.blitz = { command, state: s, bubble };
setInterval(async () => (s.pcIdle = (await host.idle?.()) ?? 0), 5000);

/* ---------- idle life ---------- */
function liftOff() {
  const dir = s.P.x > W() / 2 ? -1 : 1;
  const a = (0.6 + seeds() * 0.35) * (Math.PI / 4) + Math.PI / 8;
  s.vel = { x: dir * DRIFT_SPEED * Math.cos(a), y: -DRIFT_SPEED * Math.sin(a) };
  s.f = dir;
  s.bounces = 0;
  const feet = at(FEET);
  puff({ x: feet.x - 10, y: feet.y }, -50, -6, 3, 11, 900);
  puff({ x: feet.x + 10, y: feet.y }, 50, -6, 3, 11, 900);
  set("drift");
  rec({ type: "drift_start", at: [s.P.x, s.P.y] });
}
/** A stroll along the bottom of the screen, hovering low on his thruster, either way. */
const STROLL_SPEED = 75;
function stroll(t) {
  let to = s.P.x;
  for (let i = 0; i < 6 && Math.abs(to - s.P.x) < 180; i++) to = HALF_W + 40 + seeds() * (W() - 2 * HALF_W - 80);
  s.stroll = { to };
  s.f = to > s.P.x ? 1 : -1;
  rec({ type: "stroll", from: [s.P.x, s.P.y + DROP], to: [to, s.P.y + DROP] });
}
function stepStroll(t, dt) {
  const st = s.stroll;
  if (!st || s.mode !== "ground" || s.act) return;
  const d = st.to - s.P.x;
  if (Math.abs(d) < 4) {
    s.stroll = null;
    // Arrived: he turns to face the middle of the screen, and sometimes waves.
    s.f = s.P.x < W() / 2 ? 1 : -1;
    if (seeds() < 0.3) s.waveAt = t;
    return;
  }
  s.P.x += Math.sign(d) * Math.min(Math.abs(d), STROLL_SPEED * dt);
  if (t - s.flameAt > 70) (s.flameSeed = seed()), (s.flameAt = t);
}
function idle(t) {
  if (s.mode !== "ground" || s.over || bubble.open || menu.open || s.act || s.stroll) return;
  // Big moves (flying, Doodle Jump, sprints, strolls) wait until nobody is at the computer; till then he stays put.
  const away = s.pcIdle * 1000 > ROAM_AFTER;
  const fidget = () => startAct(["ring", "sneeze", "punch"][Math.floor(seeds() * 3)]);
  // He keeps an eye on the pointer: when it moves off to his other side, he turns to face it.
  const dx = s.pointer.x - s.P.x;
  if (t - s.pointerAt < 1500 && Math.abs(dx) > 120 && Math.sign(dx) !== s.f) s.f = Math.sign(dx);
  // Left alone a long while: he draws, and once nobody is at the computer, in turn he flies about or plays Doodle Jump too.
  if (s.drift && t - s.seen > DRIFT_AFTER) {
    const turn = (s.idleTurn = (s.idleTurn ?? 0) + 1) % 3;
    if (!away) return startAct("doodle");
    return turn === 1 ? startGame(false) : turn === 2 ? liftOff() : startAct("doodle");
  }
  // On the hour, he strikes it.
  const hour = new Date().getHours();
  if (hour !== s.hour) {
    s.hour = hour;
    if (new Date().getMinutes() < 2) return startAct("chime");
  }
  // The pointer has sat still near him a while: he grabs at it.
  const near = Math.hypot(s.pointer.x - s.P.x, s.pointer.y - (s.P.y + DROP / 2)) < 320;
  if (near && t - s.pointerAt > 4000 && t - s.snatchAt > 90000) {
    s.snatchAt = t;
    return startAct("snatch");
  }
  if (t > s.blinkUntil + 2600 && seeds() < 0.004) s.blinkUntil = t + (seeds() < 0.25 ? 380 : 150);
  if (t > s.nextIdle) {
    s.nextIdle = t + 9000 + seeds() * 12000;
    // Every third time, something bigger: a nap (likelier late at night), some music (one of five) or a sprint.
    if (++s.idleN % 3 === 0) {
      const r = seeds();
      const big = r < (isNight() ? 0.8 : 0.3) ? "nap" : r < (isNight() ? 0.9 : 0.65) ? MUSIC[Math.floor(seeds() * MUSIC.length)] : "dash";
      if (big !== "dash" || away) return startAct(big);
    }
    const r = seeds();
    if (r < 0.22) return away ? stroll(t) : fidget();
    if (r < 0.3) {
      s.f = -s.f; // a look the other way
      return;
    }
    if (r < 0.4) puff(at(STACK), 10, -32, 2.5, 8, 1400);
    else if (r < 0.35) s.waveAt = t;
    else if (r < 0.5) {
      s.spinAt = t;
      puff(at(STACK), 14, -44, 3, 11, 1300, 200);
    } else fidget();
  }
}

/* ---------- idle acts (acts.mjs) ---------- */
const MUSIC = ["music", "guitar", "dj", "sing", "violin"];
function isNight() {
  const h = new Date().getHours();
  return h >= 23 || h < 6;
}
function startAct(name) {
  if (!ACTS[name] || s.mode !== "ground") return;
  s.act = { name, t0: now(), data: {} };
  rec({ type: "act", name, at: [s.P.x, s.P.y] });
  s.actPose = null;
}
function stopAct() {
  s.act = null;
  s.actPose = null;
}
/** One frame of the act: its pose, and anything it moves. */
function stepAct(t, dt) {
  const a = s.act;
  if (!a) return;
  const e = t - a.t0;
  const ms = actMs(a.name, a.data);
  if (e >= ms) {
    // A long act counts as being left alone: the next one comes sooner.
    if (ACTS[a.name].kind === "long") s.seen = t - DRIFT_AFTER + 25000;
    stopAct();
    s.nextIdle = Math.max(s.nextIdle, t + 6000);
    return;
  }
  const pose =
    ACTS[a.name].pose({
      e,
      u: e / ms,
      t,
      at,
      f: s.f,
      P: s.P,
      ground: GROUND(),
      W: W(),
      H: window.innerHeight,
      pointer: s.pointer,
      data: a.data,
      puff,
      sound: playActSound,
      worn: s.phones,
      shades: s.shades,
      face: (dir) => (s.f = dir < 0 ? -1 : 1),
    }) ?? {};
  if (pose.vx) s.P.x = clamp(s.P.x + pose.vx * dt, HALF_W, W() - HALF_W);
  if (pose.flameLen !== undefined && t - s.flameAt > 60) (s.flameSeed = seed()), (s.flameAt = t);
  s.actPose = pose;
}

/* ---------- Doodle Jump ---------- */
// The game is played on a pen-drawn handheld that opens beside him; he shrinks into its screen. In the
// world: plain ledges, sliding ones, ones that crack under him, springs, gears to pick up, little
// scribble monsters (land on one to squash it, bump into one and the run is over), and the overdrive
// bolt, which lights his thruster and sends him straight up for a moment.
const GK = 0.42; // his size inside the game
const DK = DROP * GK; // his height, small
const JUMP = 1080 * GK; // take-off speed, px/s: about 140 px up
const GAME_G = 1750 * GK;
const LEDGE_GAP = [85 * GK, 175 * GK]; // vertical gap between ledges, px
const AUTO_MS = 60000; // he plays by himself for about this long
const COL_W = Math.round(1.5 * 280 * B); // the screen: about one and a half of him across,
const GAME_H = Math.round(2.1 * 256 * B); // a couple of him high
const CTRL_H = 150; // the handheld's controls, under the screen
const SIDE = 30; // the handheld's border round the screen
const STEP_X = 70; // the next ledge up is at most this far across from the last

/* the drawings */
function ledgeInk(w, kind) {
  const pen = new Pen(seed());
  if (kind === "broken") {
    // Two halves with a crack between them, hatched red.
    const m = w * (0.4 + seeds() * 0.2);
    pen.line([[0, 0], [m - 2, -1], [m, 3], [m + 2, -1], [w, 0]], { w: 2.4 });
    pen.hatch([[2, 2], [m - 2, 2], [m - 4, 7], [4, 7]], { angle: -0.8, gap: 3, w: 1.4 });
    pen.hatch([[m + 2, 2], [w - 2, 2], [w - 4, 7], [m + 4, 7]], { angle: -0.8, gap: 3, w: 1.4 });
    return ink(pen.strokes.slice(0, 2), "pen-r") + ink(pen.strokes.slice(2), "pen-r");
  }
  pen.line([[0, 0], [w * 0.3, -1 + seeds() * 2], [w * 0.7, -1 + seeds() * 2], [w, 0]], { w: 3 });
  pen.hatch([[2, 2], [w - 2, 2], [w - 6, 8], [6, 8]], { angle: -0.8, gap: 4, w: 1.4 });
  return ink(pen.strokes.slice(0, 2), "pen-b") + ink(pen.strokes.slice(2), "pen-r");
}
function springInk(h, sd) {
  const pts = [[-5, 0]];
  for (let i = 1; i <= 4; i++) pts.push([i % 2 ? 5 : -5, (-h * i) / 4]);
  pts.push([0, -h - 1]);
  return ink(new Pen(sd).line(pts, { w: 2 }).strokes, "pen-b") + ink(new Pen(sd + 1).line([[-6, -h - 1], [6, -h - 1]], { w: 2.6 }).strokes, "pen-r");
}
const GEAR = (() => {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 6.5 : 8.5;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return ink(new Pen(91).line(pts, { closed: true, w: 2 }).strokes, "pen-b") + ink(penPaths(ring(0, 0, 2.6, 8), 92), "pen-r");
})();
function monsterInk(sd) {
  // A scribbled blob with two eyes and a jagged mouth.
  const r = rng(sd);
  const body = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const rr = 11 + (r() * 2 - 1) * 2.5;
    return [Math.cos(a) * rr, Math.sin(a) * rr * 0.85];
  });
  const pen = new Pen(sd);
  pen.line(body, { closed: true, w: 2.4 });
  pen.hatch(body, { angle: 0.7, gap: 3.4, w: 1.2 });
  const mouth = new Pen(sd + 3).line([[-6, 4], [-3, 2], [0, 5], [3, 2], [6, 4]], { w: 1.8 }).strokes;
  return ink(pen.strokes.slice(0, 2), "pen-r") + ink(pen.strokes.slice(2), "pen-r") + ink(mouth, "pen-b") +
    `<circle cx="-4" cy="-3" r="2.6" class="pen-paper"/><circle cx="4" cy="-3" r="2.6" class="pen-paper"/><circle cx="-3.6" cy="-2.6" r="1.2" class="pen-bf"/><circle cx="4.4" cy="-2.6" r="1.2" class="pen-bf"/>`;
}
const BOLT = (() => {
  const pts = [[2, -10], [-5, 1], [0, 1], [-2, 10], [6, -2], [1, -2]];
  const pen = new Pen(95);
  pen.line(pts, { closed: true, w: 2.2 });
  pen.hatch(pts, { angle: 1.2, gap: 2.6, w: 1.2 });
  return ink(pen.strokes.slice(0, 2), "pen-r") + ink(pen.strokes.slice(2), "pen-r");
})();

/* handwriting: digits and a few letters, drawn with the pen and redrawn as the lines boil */
const GLYPHS = {
  0: [[[5, 1], [8, 3], [9, 8], [8, 13], [5, 15], [2, 13], [1, 8], [2, 3], [5, 1]]],
  1: [[[3, 4], [6, 1], [6, 15]]],
  2: [[[1, 4], [3, 1], [7, 1], [9, 4], [8, 7], [1, 15], [9, 15]]],
  3: [[[1, 2], [8, 2], [4, 7], [8, 9], [9, 12], [6, 15], [1, 14]]],
  4: [[[7, 15], [7, 1], [1, 10], [9, 10]]],
  5: [[[8, 1], [2, 1], [1, 7], [6, 6], [9, 9], [8, 14], [4, 15], [1, 13]]],
  6: [[[7, 1], [3, 4], [1, 10], [3, 15], [7, 15], [9, 11], [7, 8], [3, 8], [1, 10]]],
  7: [[[1, 1], [9, 1], [4, 15]]],
  8: [[[5, 8], [2, 6], [2, 3], [5, 1], [8, 3], [8, 6], [5, 8], [1, 11], [2, 14], [5, 15], [8, 14], [9, 11], [5, 8]]],
  9: [[[8, 6], [5, 8], [2, 6], [2, 3], [5, 1], [8, 3], [8, 6], [7, 15]]],
  m: [[[1, 15], [1, 8], [3, 7], [5, 8], [5, 15]], [[5, 8], [7, 7], [9, 8], [9, 15]]],
  x: [[[2, 8], [8, 15]], [[8, 8], [2, 15]]],
  "↑": [[[5, 15], [5, 2]], [[1, 6], [5, 1], [9, 6]]],
  "!": [[[5, 1], [5, 10]], [[5, 14], [5, 15]]],
};
function handwrite(str, x, y, size, cls, t, sd = 0) {
  const k = size / 16;
  const boil = Math.floor(t / BOIL_MS);
  let out = "", cx = x;
  for (const ch of String(str)) {
    if (ch === " ") {
      cx += 6 * k;
      continue;
    }
    const g = GLYPHS[ch];
    if (!g) continue;
    g.forEach((stroke, i) => {
      const pts = stroke.map(([px, py]) => [cx + px * k, y + py * k]);
      out += ink(new Pen(boil * 97 + sd + cx * 7 + i).line(pts, { w: Math.max(1.6, 2.2 * k) }).strokes, cls);
    });
    cx += 11.5 * k;
  }
  return out;
}

/** The handheld: body, screen bezel, label, D-pad, A and B, start and select, speaker. Drawn once. */
function consoleInk(w, h) {
  const pen = (sd) => new Pen(sd);
  const sw = COL_W + 12, sh = GAME_H + 12; // the bezel's opening, round the screen
  const bx = SIDE - 6, by = SIDE - 6;
  const parts = [];
  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" rx="26" class="world"/>`);
  parts.push(penPaths(boxPoints(w, h, 26), 71).map((p) => `<path d="${p.d}" stroke-width="${p.w * 1.2}" opacity="${p.op}" class="pen-b"/>`).join(""));
  // A little shading down the right side and along the bottom.
  parts.push(ink(pen(72).hatch([[w - 10, 40], [w - 3, 40], [w - 3, h - 20], [w - 20, h - 3], [40, h - 3], [40, h - 10], [w - 10, h - 10]], { angle: -0.8, gap: 6, w: 1.2 }).strokes, "pen-b"));
  parts.push(`<rect x="${bx}" y="${by}" width="${sw}" height="${sh}" rx="10" class="screen"/>`);
  parts.push(penPaths(boxPoints(sw, sh, 10), 73).map((p) => `<path d="${p.d}" transform="translate(${bx} ${by})" stroke-width="${p.w}" opacity="${p.op}" class="pen-b"/>`).join(""));
  // The label under the screen.
  const ly = by + sh + 22;
  parts.push(`<text x="${w / 2}" y="${ly}" class="label" text-anchor="middle">BLITZ BOY</text>`);
  // D-pad.
  const dx = 52, dy = ly + 52, a = 9, l = 25;
  const cross = [[-a, -l], [a, -l], [a, -a], [l, -a], [l, a], [a, a], [a, l], [-a, l], [-a, a], [-l, a], [-l, -a], [-a, -a]].map(([x, y]) => [dx + x, dy + y]);
  parts.push(ink(pen(74).line(cross, { closed: true, w: 2.6 }).strokes, "pen-b"));
  parts.push(ink(pen(75).hatch(cross, { angle: -0.8, gap: 4.5, w: 1.3 }).strokes, "pen-b"));
  // A and B.
  const ax = w - 46, ay = dy - 10, bxx = w - 86, byy = dy + 10;
  for (const [x, y, sd, letter] of [[ax, ay, 76, "A"], [bxx, byy, 78, "B"]]) {
    parts.push(ink(penPaths(ring(x, y, 14, 18), sd), "pen-r"));
    parts.push(ink(pen(sd + 1).hatch(ring(x, y, 12, 18), { angle: 1, gap: 3.6, w: 1.2 }).strokes, "pen-r"));
    parts.push(`<text x="${x + 13}" y="${y + 26}" class="key">${letter}</text>`);
  }
  // Start and select.
  for (const [x, sd] of [[w / 2 - 26, 80], [w / 2 + 8, 81]]) parts.push(ink(pen(sd).line([[x, h - 34], [x + 18, h - 40]], { w: 5 }).strokes, "pen-b"));
  // Speaker slits.
  for (let i = 0; i < 5; i++) parts.push(ink(pen(82 + i).line([[w - 62 + i * 9, h - 18], [w - 50 + i * 9, h - 34]], { w: 2 }).strokes, "pen-b"));
  return { art: parts.join(""), dpad: { x: dx, y: dy, a, l }, buttons: { ax, ay } };
}

/* the world */
function ledge(x, y, w, kind = "normal") {
  return { x, y, w, kind, vx: kind === "moving" ? (seeds() < 0.5 ? -1 : 1) * (30 + seeds() * 35) : 0, ink: ledgeInk(w, kind), spring: null, crackAt: 0, fall: 0 };
}
/** Fill the screen with ledges from `fromY` up past its top; the path ledges are always within reach. */
function fillLedges(g, fromY) {
  let y = fromY;
  const hard = Math.min(1, g.score / 400);
  while (y > g.y0 - 60) {
    y -= LEDGE_GAP[0] + seeds() * (LEDGE_GAP[1] - LEDGE_GAP[0]) * (0.8 + hard * 0.25);
    const w = 34 + seeds() * 20 - hard * 6;
    const c = clamp(g.lastX + (seeds() * 2 - 1) * STEP_X, g.x0 + w / 2 + 6, g.x1 - w / 2 - 6);
    const l = ledge(c - w / 2, y, w, seeds() < 0.12 + hard * 0.15 ? "moving" : "normal");
    if (seeds() < 0.1) l.spring = { at: l.w * (0.3 + seeds() * 0.4), sd: seed(), pushedAt: -1e9 };
    g.ledges.push(l);
    g.lastX = c;
    // Now and then something extra at this height, off the path.
    const off = () => (c < (g.x0 + g.x1) / 2 ? g.x1 - 30 - seeds() * 40 : g.x0 + 30 + seeds() * 40);
    const r = seeds();
    if (r < 0.14) g.ledges.push(ledge(off() - 20, y + (seeds() - 0.5) * 20, 40, "broken"));
    else if (r < 0.34) g.items.push({ kind: "gear", x: c + (seeds() - 0.5) * 30, y: y - 22 });
    else if (r < 0.34 + (g.player ? 0.05 + hard * 0.06 : 0.025) && g.score > 15)
      g.items.push({ kind: "mon", x: off(), y: y - 30, vx: (seeds() < 0.5 ? -1 : 1) * 25, ink: monsterInk(seed()), dead: 0 });
    else if (r < 0.4 && g.score > 30) g.items.push({ kind: "bolt", x: c, y: y - 26 });
  }
  g.top = y;
}
function startGame(player) {
  s.seen = now();
  // The handheld always opens in the bottom-right corner, standing on the bottom of the screen.
  const cw = COL_W + SIDE * 2, ch = GAME_H + SIDE + CTRL_H;
  const cx = W() - cw / 2 - 12;
  const y1 = GROUND() - CTRL_H + 6;
  const g = {
    player, ledges: [], items: [], score: 0, bonus: 0, climbed: 0, startAt: now(), bounceAt: -1e9, boostUntil: 0, dead: false,
    vy: -JUMP, vx: 0, x0: cx - COL_W / 2, x1: cx + COL_W / 2, y0: y1 - GAME_H, y1, lastX: cx,
    box: { x: cx - cw / 2, y: y1 - GAME_H - SIDE, w: cw, h: ch },
  };
  g.console = consoleInk(cw, ch);
  puff(at(STACK), 0, -30, 4, 14, 700);
  s.k = GK;
  s.P = { x: cx, y: y1 - DK };
  // A first ledge right under him, so the run starts with a hop.
  g.ledges.push(ledge(cx - 22, y1 - 4, 44));
  fillLedges(g, y1 - 4);
  s.game = g;
  s.th = 0;
  s.om = 0;
  set("game");
  rec({ type: "game_start", player, box: [g.box.x, g.box.y, g.box.w, g.box.h], screen: [g.x0, g.y0, COL_W, GAME_H] });
  if (player) host.aiming(true); // Esc ends the run
  catchMouse();
}
function endGame(early) {
  const g = s.game;
  if (!g) return;
  rec({ type: "game_over", score: g.score, early, player: g.player });
  if (g.player) host.aiming(false);
  s.game = null;
  s.vel = { x: g.vx * 0.3, y: 0 };
  if (!early || g.player) {
    let best = g.score;
    try {
      best = Math.max(g.score, Number(localStorage.getItem("blitz-best") || 0));
      localStorage.setItem("blitz-best", String(best));
    } catch {}
    bubble.note(`爬了 ${g.score} 米${g.score >= best && g.score > 0 ? "，新纪录！" : `（最高 ${best} 米）`}`, 3200);
  }
  // The handheld snaps shut and he comes back to full size, dropping in from where it stood.
  puff({ x: g.box.x + g.box.w / 2, y: g.box.y + g.box.h / 2 }, 0, -20, 10, 34, 700);
  s.k = 1;
  s.P = { x: clamp(g.box.x + g.box.w / 2, HALF_W, W() - HALF_W), y: g.box.y - 20 };
  set("fall");
  catchMouse();
}
function stepGame(t, dt) {
  const g = s.game;
  const boosting = t < g.boostUntil;
  // Steering: the player's pointer, or his own eye for the next ledge he can land on.
  let want;
  if (g.player) want = clamp(s.pointer.x, g.x0, g.x1);
  else {
    const feetY = s.P.y + DK;
    const apex = g.vy < 0 ? feetY - (g.vy * g.vy) / (2 * GAME_G) : feetY;
    const reach = g.ledges.filter((l) => l.kind !== "broken" && l.y > apex + 6 && (g.vy < 0 || l.y > feetY - 4));
    const target = reach.sort((p, q) => p.y - q.y)[0];
    want = target ? target.x + target.w / 2 : s.P.x;
  }
  const vxWant = g.dead ? g.vx : clamp((want - s.P.x) * 5, -230, 230);
  g.vx = lerp(g.vx, vxWant, Math.min(1, dt * 8));
  if (Math.abs(g.vx) > 40) s.f = g.vx > 0 ? 1 : -1;
  const prevFeet = s.P.y + DK;
  if (boosting) g.vy = -JUMP * 1.5;
  else g.vy += GAME_G * dt;
  s.P = { x: s.P.x + g.vx * dt, y: s.P.y + g.vy * dt };
  // Off one side of the screen, on at the other.
  if (s.P.x < g.x0) s.P.x = g.x1;
  if (s.P.x > g.x1) s.P.x = g.x0;
  for (const l of g.ledges) {
    if (l.vx) {
      l.x += l.vx * dt;
      if (l.x < g.x0 + 4 || l.x + l.w > g.x1 - 4) l.vx = -l.vx;
    }
    if (l.crackAt) l.y += (l.fall += 600 * dt) * dt;
  }
  const feet = s.P.y + DK;
  const mid = { x: s.P.x, y: s.P.y + DK * 0.5 };
  // Landing on a ledge on the way down: bounce, higher off a spring; a cracked one gives way.
  if (g.vy > 0 && !g.dead) {
    const hit = g.ledges.find((l) => !l.crackAt && prevFeet <= l.y + 2 && feet >= l.y && s.P.x > l.x - 8 && s.P.x < l.x + l.w + 8);
    if (hit && hit.kind === "broken") {
      hit.crackAt = t;
      puff({ x: hit.x + hit.w / 2, y: hit.y }, 0, 20, 3, 9, 500);
      playHookSound("clank");
    } else if (hit) {
      s.P.y = hit.y - DK;
      const sp = hit.spring && Math.abs(s.P.x - (hit.x + hit.spring.at)) < 12 ? hit.spring : null;
      g.vy = sp ? -JUMP * 1.65 : -JUMP;
      if (sp) sp.pushedAt = t;
      g.bounceAt = t;
      rec({ type: "game_bounce", at: [s.P.x, hit.y], spring: !!sp });
      puff({ x: s.P.x, y: hit.y }, -40, -10, 2.5, 8, 600);
      puff({ x: s.P.x, y: hit.y }, 40, -10, 2.5, 8, 600);
      playHookSound(sp ? "throw" : "tick");
    }
  }
  // Gears, monsters and the overdrive bolt.
  for (const it of g.items) {
    if (it.kind === "mon" && !it.dead) {
      it.x += it.vx * dt;
      if (it.x < g.x0 + 12 || it.x > g.x1 - 12) it.vx = -it.vx;
    }
    if (it.got || it.dead || g.dead) continue;
    const d = Math.hypot(it.x - mid.x, it.y - mid.y);
    if (it.kind === "gear" && d < 16) {
      it.got = t;
      rec({ type: "game_item", kind: "gear", at: [it.x, it.y] });
      g.bonus += 10;
      playHookSound("tick");
    } else if (it.kind === "bolt" && d < 16) {
      it.got = t;
      rec({ type: "game_item", kind: "bolt", at: [it.x, it.y] });
      g.boostUntil = t + 1500;
      playHookSound("throw");
    } else if (it.kind === "mon" && d < 17) {
      if (boosting || (g.vy > 0 && feet < it.y + 2)) {
        // Squashed from above (or run down in overdrive).
        it.dead = t;
        rec({ type: "game_item", kind: "stomp", at: [it.x, it.y] });
        g.bonus += 20;
        if (!boosting) g.vy = -JUMP;
        puff({ x: it.x, y: it.y }, 0, -20, 4, 12, 600);
        playHookSound("clank");
      } else {
        // Bumped into it: knocked out, he tumbles off the bottom.
        g.dead = true;
        rec({ type: "game_item", kind: "bonk", at: [it.x, it.y] });
        g.vy = 120;
        g.vx = (s.P.x < it.x ? -1 : 1) * 80;
        s.startleAt = t;
        playHookSound("clank");
      }
    }
  }
  // Climbing past the middle of the screen: the world scrolls down instead.
  const line = g.y0 + GAME_H * 0.42;
  if (s.P.y < line) {
    const d = line - s.P.y;
    s.P.y = line;
    g.climbed += d;
    for (const l of g.ledges) l.y += d;
    for (const it of g.items) it.y += d;
    for (const p of s.puffs) p.y += d;
    g.top += d;
    g.ledges = g.ledges.filter((l) => l.y < g.y1 + 40);
    g.items = g.items.filter((it) => it.y < g.y1 + 40);
    if (g.top > g.y0 - 60) fillLedges(g, g.top);
  }
  g.score = Math.floor(g.climbed / 40) + g.bonus;
  s.th = g.dead ? s.th + dt * 9 : lerp(s.th, clamp(g.vx / 230, -1, 1) * 0.25, Math.min(1, dt * 10));
  if (t - s.flameAt > (boosting ? 30 : 60)) (s.flameSeed = seed()), (s.flameAt = t);
  // Off the bottom: the run is over. Left alone long enough, he stops by himself.
  if (s.P.y > g.y1 + 10) return endGame(false);
  if (!g.player && t - g.startAt > AUTO_MS && g.vy < 0) endGame(true);
}
function drawGame(t) {
  const g = s.game;
  if (!g) {
    if (el.game.innerHTML) el.game.innerHTML = "";
    return;
  }
  const wob = Math.floor(t / BOIL_MS);
  const open = easeOut(Math.min(1, (t - g.startAt) / 280));
  const { x: bx, y: by, w: bw, h: bh } = g.box;
  const ccx = bx + bw / 2, ccy = by + bh;
  // The D-pad leans the way he is steered; A lights up as he pushes off.
  const dp = g.console.dpad;
  const lean = g.player ? clamp(g.vx / 230, -1, 1) : 0;
  const press = Math.abs(lean) > 0.3 ? `<rect x="${(dp.x + (lean > 0 ? dp.a : -dp.l)).toFixed(1)}" y="${dp.y - dp.a}" width="${dp.l - dp.a}" height="${dp.a * 2}" class="pressed"/>` : "";
  const aLit = t - g.bounceAt < 160 ? `<circle cx="${g.console.buttons.ax}" cy="${g.console.buttons.ay}" r="12" class="pressed"/>` : "";
  const led = `<circle cx="${SIDE - 14}" cy="${SIDE + 14}" r="3.2" class="pen-rf" opacity="${(0.55 + 0.45 * Math.sin(t / 300)).toFixed(2)}"/>`;
  const score = handwrite(`${g.score}m`, bx + SIDE + 8, by + SIDE + 6, 15, "pen-r", t, 5);
  if (g.best == null) {
    try {
      g.best = Number(localStorage.getItem("blitz-best") || 0);
    } catch {
      g.best = 0;
    }
  }
  const top = `↑${Math.max(g.best, g.score)}`;
  const best = handwrite(top, bx + bw - SIDE - 10 - top.length * 11.5 * (13 / 16), by + SIDE + 7, 13, "pen-b", t, 9);
  const things =
    g.ledges.map((l, i) => {
      let sp = "";
      if (l.spring) {
        const push = t - l.spring.pushedAt < 200 ? 4 : 9;
        sp = `<g transform="translate(${l.spring.at.toFixed(1)} 0)">${springInk(push, l.spring.sd)}</g>`;
      }
      const tilt = l.crackAt ? Math.min(25, (t - l.crackAt) / 10) : rng(wob * 31 + i)() - 0.5;
      return `<g transform="translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${tilt.toFixed(2)})" opacity="${l.crackAt ? Math.max(0, 1 - (t - l.crackAt) / 600).toFixed(2) : 1}">${l.ink}${sp}</g>`;
    }).join("") +
    g.items.map((it) => {
      if (it.kind === "gear") {
        if (it.got && t - it.got > 300) return "";
        const sc = it.got ? 1 + (t - it.got) / 150 : 1;
        return `<g transform="translate(${it.x.toFixed(1)} ${it.y.toFixed(1)}) rotate(${((t / 8) % 360).toFixed(1)}) scale(${sc.toFixed(2)})" opacity="${it.got ? (1 - (t - it.got) / 300).toFixed(2) : 1}">${GEAR}</g>`;
      }
      if (it.kind === "bolt") return it.got ? "" : `<g transform="translate(${it.x.toFixed(1)} ${(it.y + Math.sin(t / 200) * 3).toFixed(1)})">${BOLT}</g>`;
      if (it.dead && t - it.dead > 400) return "";
      const squash = it.dead ? `scale(1.3 ${Math.max(0.2, 1 - (t - it.dead) / 300).toFixed(2)})` : `scale(${it.vx > 0 ? -1 : 1} 1)`;
      return `<g transform="translate(${it.x.toFixed(1)} ${(it.y + (it.dead ? 0 : Math.sin(t / 250 + it.x) * 2)).toFixed(1)}) ${squash}">${it.ink}</g>`;
    }).join("");
  el.game.innerHTML =
    `<g transform="translate(${ccx} ${ccy}) scale(${open.toFixed(3)}) translate(${-ccx} ${-ccy})">` +
    `<g transform="translate(${bx} ${by})" filter="url(#wobble)">${g.console.art}${press}${aLit}${led}</g>` +
    `<clipPath id="gbox"><rect x="${g.x0 - 6}" y="${g.y0 - 6}" width="${COL_W + 12}" height="${GAME_H + 12}" rx="8"/></clipPath>` +
    `<g clip-path="url(#gbox)">${open > 0.95 ? things : ""}</g>${score}${best}</g>`;
}

/* ---------- the frame ---------- */
let last = 0;
function step(t) {
  const dt = Math.min(0.034, Math.max(0.001, (t - (last || t)) / 1000));
  last = t;
  const ground = GROUND() - DROP;

  if (s.mode === "drag" || s.mode === "fall") {
    let to;
    if (s.mode === "drag") {
      const k = Math.exp(-dt * 12);
      s.grab = { x: s.grab.x * k, y: s.grab.y * k };
      to = { x: s.pointer.x + s.grab.x, y: s.pointer.y + s.grab.y };
      if (t > s.nextDrop) {
        const side = seeds() < 0.5;
        const p = at(side ? [92, 64] : [150, 60]);
        s.drops.push({ x: p.x, y: p.y, vx: (side ? 1 : -1) * s.f * -(30 + seeds() * 30), vy: -60, t0: t, ink: dropInk() });
        s.nextDrop = t + 380 + seeds() * 300;
      }
      const v = { x: (to.x - s.P.x) / dt, y: (to.y - s.P.y) / dt };
      const acc = { x: clamp((v.x - s.vel.x) / dt, -40000, 40000), y: clamp((v.y - s.vel.y) / dt, -40000, 40000) };
      s.vel = { x: lerp(s.vel.x, v.x, 0.5), y: lerp(s.vel.y, v.y, 0.5) };
      s.P = to;
      swing(acc, dt);
    } else {
      // Thrown: he flies, bounces off the sides and the top, and lands on his feet.
      s.vel.y += G * dt;
      s.P = { x: s.P.x + s.vel.x * dt, y: s.P.y + s.vel.y * dt };
      if (s.P.x < HALF_W) (s.P.x = HALF_W), (s.vel.x = Math.abs(s.vel.x) * 0.5), rec({ type: "bounce", wall: "left", at: [s.P.x, s.P.y] });
      if (s.P.x > W() - HALF_W) (s.P.x = W() - HALF_W), (s.vel.x = -Math.abs(s.vel.x) * 0.5), rec({ type: "bounce", wall: "right", at: [s.P.x, s.P.y] });
      if (s.P.y < TOP) (s.P.y = TOP), (s.vel.y = Math.abs(s.vel.y) * 0.4), rec({ type: "bounce", wall: "top", at: [s.P.x, s.P.y] });
      swing({ x: 0, y: G }, dt);
      if (s.P.y >= ground) {
        s.P.y = ground;
        s.f = Math.abs(s.vel.x) > 60 ? Math.sign(s.vel.x) : s.P.x < W() / 2 ? 1 : -1;
        s.vel = { x: 0, y: 0 };
        set("land");
        s.landAt = t;
        landPuffs();
        rec({ type: "land", at: [s.P.x, s.P.y + DROP] });
      }
    }
    if (t - s.flameAt > 55) (s.flameSeed = seed()), (s.flameAt = t);
  } else if (s.mode === "land") {
    const u = (t - s.landAt) / 1000;
    s.th *= Math.exp(-dt * 14);
    s.om = 0;
    if (t - s.landAt > LAND_MS) {
      s.th = 0;
      set("ground");
    } else if (u > 0.6) s.th = 0.07 * Math.sin((u - 0.6) * 50) * (1 - (u - 0.6) / 0.5);
  } else if (s.mode === "drift") {
    // The DVD screensaver: straight lines, bouncing off the edges of the screen.
    s.P = { x: s.P.x + s.vel.x * dt, y: s.P.y + s.vel.y * dt };
    let hx = false, hy = false;
    if (s.P.x < HALF_W) (s.P.x = HALF_W), (s.vel.x = Math.abs(s.vel.x)), (hx = true);
    if (s.P.x > W() - HALF_W) (s.P.x = W() - HALF_W), (s.vel.x = -Math.abs(s.vel.x)), (hx = true);
    if (s.P.y < TOP) (s.P.y = TOP), (s.vel.y = Math.abs(s.vel.y)), (hy = true);
    if (s.P.y > ground) (s.P.y = ground), (s.vel.y = -Math.abs(s.vel.y)), (hy = true);
    if (hx || hy) {
      s.bounces++;
      if (hx) s.f = s.vel.x > 0 ? 1 : -1;
      const near = (v, a, b) => v - a < 40 || b - v < 40;
      const corner = (hx && near(s.P.y, TOP, ground)) || (hy && near(s.P.x, HALF_W, W() - HALF_W));
      const p = hy ? (s.vel.y > 0 ? at([120, 22]) : at(FEET)) : at([s.vel.x > 0 ? 40 : 200, 140]);
      puff(p, -s.vel.x * 0.4, -s.vel.y * 0.4, 3, 10, 900);
      rec({ type: "drift_bounce", corner, at: [s.P.x, s.P.y] });
      if (corner) {
        // Right into the corner.
        s.waveAt = t;
        s.dragAt = t;
        s.spinAt = t;
        landPuffs();
        playHookSound("clank");
      }
    }
    s.th = lerp(s.th, s.vel.x / DRIFT_SPEED * 0.12 + Math.sin(t / 900) * 0.05, 0.06);
    if (t - s.flameAt > 70) (s.flameSeed = seed()), (s.flameAt = t);
    if (s.drift === false) set("fall");
  } else if (s.mode === "game") {
    stepGame(t, dt);
  } else if (s.mode === "aim" || s.mode === "cast") {
    s.th *= Math.exp(-dt * 10);
    // In the air he hovers on his thruster.
    if (!onGround() && t - s.flameAt > 70) (s.flameSeed = seed()), (s.flameAt = t);
  }

  if (s.mode === "ground" && s.over && !s.spun && t - s.hoverAt > DWELL_MS) {
    s.spun = true;
    s.spinAt = t;
    puff(at(STACK), 14 * -s.f, -44, 3, 11, 1300, 200);
    puff(at(STACK), 22 * -s.f, -40, 3, 9, 1200, 650);
  }
  if (s.mode === "ground") stepAct(t, dt);
  stepStroll(t, dt);
  idle(t);

  s.puffs = s.puffs.filter((p) => t < p.t0 + p.life);
  for (const p of s.puffs) {
    if (t < p.t0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-dt * 1.5);
  }
  s.drops = s.drops.filter((d) => t < d.t0 + 700);
  for (const d of s.drops) {
    d.vy += 500 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
  }
  // Held down while aiming: the hook charges up and takes the whole paragraph.
  const a = s.aim;
  // Held past a quick tap: the charge starts to build, audibly.
  if (a?.armed && a.scope === "sentence" && !a.chargeHeard && t - a.pressAt > 110) {
    a.chargeHeard = true;
    playHookSound("charge");
  }
  if (a?.armed && a.scope === "sentence" && t - a.pressAt > CHARGE_MS) {
    a.scope = "paragraph";
    a.chargedAt = t;
    rec({ type: "charge_full" });
    a.ax = null;
    a.target = null;
    playHookSound("full");
    pick(a);
    askAx(a);
  }
  if (s.cast && t - s.cast.start >= s.cast.fly + (s.cast.hit ? GRAB_MS : 0) + s.cast.back) castDone();

  draw(t);
  requestAnimationFrame(step);
}

function swing(acc, dt) {
  const a = (-(K * LEN - acc.y) * Math.sin(s.th) + acc.x * Math.cos(s.th)) / LEN - DAMP * s.om;
  s.om += a * dt;
  s.th = clamp(s.th + s.om * dt, -1.3, 1.3);
}

/* ---------- drawing ---------- */
function draw(t) {
  const held = s.mode === "drag" || s.mode === "fall";
  const flying = held || !!s.stroll || s.mode === "drift" || s.mode === "game" || ((s.mode === "aim" || s.mode === "cast") && !onGround());
  drawGame(t);

  // Squash about his feet on landing, with a little hop.
  squash = { sx: 1, sy: 1 };
  let hop = 0;
  if (s.mode === "game" && t - s.game.bounceAt < 220) {
    // Pushing off a ledge: a quick squash and stretch.
    const u = (t - s.game.bounceAt) / 220;
    const sy = u < 0.35 ? 1 - 0.18 * (u / 0.35) : lerp(0.82, 1.08, (u - 0.35) / 0.4) - Math.max(0, u - 0.75) * 0.32;
    squash = { sx: 1 + (1 - sy) * 0.6, sy };
  }
  if (s.mode === "land") {
    const u = (t - s.landAt) / 1000;
    let sy = 1;
    if (u < 0.08) sy = 1 - 0.22 * (u / 0.08);
    else if (u < 0.2) sy = lerp(0.78, 1.06, (u - 0.08) / 0.12);
    else if (u < 0.42) sy = lerp(1.06, 1, (u - 0.2) / 0.22);
    else if (u < 0.5) sy = lerp(1, 0.93, (u - 0.42) / 0.08);
    else if (u < 0.6) sy = lerp(0.93, 1, (u - 0.5) / 0.1);
    squash = { sx: 1 + (1 - sy) * 0.7, sy };
    if (u > 0.08 && u < 0.42) hop = -16 * Math.sin((Math.PI * (u - 0.08)) / 0.34);
  }
  // An idle act (acts.mjs) poses him while he stands about.
  const pose = s.mode === "ground" ? s.actPose : null;
  if (pose?.hop) hop += pose.hop;
  // Charging the hook he trembles, harder as it fills, and jolts as it takes the paragraph.
  let shake = [0, 0];
  if (s.mode === "aim" && s.aim?.armed) {
    const a = s.aim;
    const amp = a.scope === "paragraph" ? 0.8 + 3.2 * Math.max(0, 1 - (t - a.chargedAt) / 300) : 2.2 * Math.min(1, (t - a.pressAt) / CHARGE_MS);
    shake = [Math.sin(t / 17) * amp + Math.sin(t / 7) * amp * 0.4, Math.cos(t / 21) * amp * 0.6];
  }
  const deg = (s.th * 180) / Math.PI;
  const D = DROP * s.k, k = B * s.k;
  const tf = `translate(${(s.P.x + shake[0]).toFixed(1)} ${(s.P.y + hop + shake[1]).toFixed(1)}) rotate(${(deg + (pose?.tilt ?? 0)).toFixed(2)}) translate(0 ${D.toFixed(1)}) scale(${squash.sx.toFixed(3)} ${squash.sy.toFixed(3)}) translate(0 ${(-D).toFixed(1)}) scale(${(s.f * k).toFixed(4)} ${k.toFixed(4)}) translate(${-PIVOT[0]} ${-PIVOT[1]})`;
  el.art.setAttribute("transform", tf);
  el.art.style.opacity = pose?.hide ? "0" : "";
  el.hitG.setAttribute("transform", tf);
  el.bob.classList.toggle("bob", s.mode === "ground" && !s.over && !pose);

  // The arm, in art degrees: hanging, waving, flailing, or aimed.
  let armArt = 20;
  let open = false;
  const wave = (t - s.waveAt) / WAVE_MS;
  const aimed = s.mode === "aim" || s.mode === "cast";
  if (aimed) {
    const ang = s.aim ? s.aim.a : s.cast.a;
    armArt = s.f === 1 ? (ang * 180) / Math.PI : 180 - (ang * 180) / Math.PI;
    armArt -= deg * s.f;
  } else if (held) {
    armArt = -25 - 28 * Math.sin(t / 55);
    open = true;
  } else if (wave >= 0 && wave < 1 && (s.mode === "ground" || s.mode === "drift")) {
    const up = wave < 0.18 ? easeOut(wave / 0.18) : wave > 0.82 ? 1 - easeOut((wave - 0.82) / 0.18) : 1;
    const shake = wave >= 0.18 && wave <= 0.82 ? Math.sin(((wave - 0.18) / 0.64) * Math.PI * 4) : 0;
    armArt = 20 - up * 62 - shake * 20;
    open = wave > 0.1 && wave < 0.9;
  } else if (s.mode === "drift") armArt = 35 + Math.sin(t / 700) * 6;
  else if (s.mode === "game") {
    // Reaching up on the way up, flung out on the way down.
    armArt = s.game.vy < 0 ? -55 + Math.sin(t / 90) * 8 : 30 + Math.sin(t / 60) * 10;
    open = s.game.vy > 0;
  }
  if (pose?.armArt !== undefined) {
    armArt = pose.armArt;
    if (pose.open !== undefined) open = pose.open;
  }
  const ar = (armArt * Math.PI) / 180;
  const fist = [SX + Math.cos(ar) * ARM_ART, SY + Math.sin(ar) * ARM_ART];
  el.armG.setAttribute("transform", `translate(${SX} ${SY}) rotate(${armArt.toFixed(2)})`);
  el.handG.setAttribute("transform", `translate(${fist[0].toFixed(1)} ${fist[1].toFixed(1)}) rotate(${armArt.toFixed(2)}) scale(${HAND_K})`);
  show(el.hOpen, open || s.mode === "aim");
  show(el.hShut, !(open || s.mode === "aim"));
  show(el.handG, s.mode !== "cast");

  // Eyes: on the pointer while he is pointed at or aiming, darting while held, else ahead and down.
  const eyeWin = at([120, 71]);
  let gaze = [2.4, 1.2];
  if (held) gaze = [Math.sin(t / 43) * 2.2, Math.cos(t / 61) * 2.2];
  else if (s.over || aimed) {
    const target = aimed ? (s.aim ? s.aim.tip : s.cast.to) : s.pointer;
    const dx = s.f * (target.x - eyeWin.x);
    const dy = target.y - eyeWin.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(3.2, d / 12) / d;
    gaze = [dx * k, dy * k];
  } else if (s.mode === "drift") gaze = [2.8, Math.sign(s.vel.y) * 1.6];
  if (pose && !s.over) {
    if (pose.gazeTo) {
      const dx = s.f * (pose.gazeTo.x - eyeWin.x);
      const dy = pose.gazeTo.y - eyeWin.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(3.2, d / 12) / d;
      gaze = [dx * k, dy * k];
    } else if (pose.gaze) gaze = pose.gaze;
  }
  const blinking = !!pose?.lids || (t < s.blinkUntil && !held && !(t > s.blinkUntil - 230 && t < s.blinkUntil - 150));
  const pupil = held ? 2.2 : pose?.pupil ?? 3.4;

  // The antenna: a propeller at its tip while it spins.
  const spin = (t - s.spinAt) / SPIN_MS;
  const spinning = spin >= 0 && spin < 1 && (s.mode === "ground" || s.mode === "drift");
  let rotor = "";
  if (spinning) {
    const a = (spin * 5 - Math.max(0, spin - 0.7) ** 2 * 6) * Math.PI * 2;
    const c = Math.cos(a) * 18, n = Math.sin(a) * 4;
    rotor = ink(new Pen(57).line([[120 - c, 28 - n], [120 + c, 28 + n]], { w: 4.5 }).strokes, "pen-b") + `<g opacity="${Math.sin(spin * Math.PI).toFixed(2)}">${INK.whoosh}</g>`;
  }
  // Standing about, the thruster idles: a low flame breathing slowly and flickering, as when he naps.
  const idling = s.mode === "ground" && !pose;
  if (idling && t - s.flameAt > 90) (s.flameSeed = seed()), (s.flameAt = t);
  const flame = pose?.flameLen !== undefined ? flameInk(s.flameSeed, pose.flameLen, pose.flameSkew ?? 0) : idling ? flameInk(s.flameSeed, 0.6 + Math.sin(t / 700) * 0.08, Math.sin(t / 900) * 0.15) : flying ? flameInk(s.flameSeed, (held ? 0.75 : 1.05) + rng(s.flameSeed)() * (held ? 0.8 : 0.4), held ? Math.sin(t / 37) * 0.9 : Math.sin(t / 120) * 0.3) : INK.flame;
  const eyes = EYES.map(([x, y], i) =>
    blinking ? INK.lids[i] : `<circle cx="${x}" cy="${y}" r="7.5" class="pen-paper"/>${INK.eyes[i]}<circle cx="${(x + gaze[0]).toFixed(1)}" cy="${(y + gaze[1]).toFixed(1)}" r="${pupil}" class="pen-bf"/>`
  ).join("");
  const thinking = bubble.thinking || s.aim?.scanning ? `<circle class="think" cx="120" cy="33" r="14"/>` : "";
  const cap = pose?.cap !== false && (s.mode === "ground" || s.mode === "drift" || s.mode === "land") ? worn("phones", headset(t), t) : "";
  // Recording: a red ring round the ball of his antenna, steady, so the footage shows it.
  const recRing = s.recording && !s.recQuiet ? `<circle cx="120" cy="33" r="10" class="rec-ring"/>` : "";
  el.dyn.innerHTML = INK.stalk + `<circle cx="120" cy="33" r="5.5" class="pen-rf"/>` + recRing + rotor + flame + eyes + thinking + cap + (pose?.shades !== false ? worn("shades", sunglasses(), t) : "") + (pose?.art ?? "");
  el.act.innerHTML = (pose?.win ?? "") + (s.mode === "ground" ? clawGlint(t, armArt) : "");

  // "!": he panics when picked up, startles when caught drifting, cheers a corner hit.
  const since = Math.min(t - s.dragAt, t - s.startleAt);
  const bangOn = held || since < 900;
  if (bangOn) {
    const pop = Math.min(1, since / 180);
    const b = pop + Math.sin(pop * Math.PI) * 0.35;
    el.bangs.innerHTML =
      `<g transform="translate(176 6) rotate(${(-8 + Math.sin(t / 40) * 8).toFixed(1)}) scale(${b.toFixed(2)})">${INK.bang}</g>` +
      `<g transform="translate(204 26) rotate(${(14 + Math.sin(t / 33) * 10).toFixed(1)}) scale(${(b * 0.7).toFixed(2)})">${INK.bang}</g>`;
  } else el.bangs.innerHTML = "";

  drawHook(t);

  el.fx.innerHTML =
    s.puffs
      .map((p) => {
        const u = (t - p.t0) / p.life;
        if (u < 0) return "";
        const r = lerp(p.r0, p.r1, easeOut(u));
        return `<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(r / 10).toFixed(3)})" opacity="${((1 - u) * (u < 0.1 ? u / 0.1 : 1)).toFixed(2)}">${p.ink}</g>`;
      })
      .join("") + s.drops.map((d) => `<g transform="translate(${d.x.toFixed(1)} ${d.y.toFixed(1)})" opacity="${(1 - (t - d.t0) / 700).toFixed(2)}">${d.ink}</g>`).join("");

  bubble.place(at([120, 24]));
}

/** The lane while aiming; the claw on its chain, and the note it hauls back, once fired. */
let boilAt = 0;
function drawHook(t) {
  if (t - boilAt > BOIL_MS) {
    boilAt = t;
    turb.setAttribute("seed", String(1 + Math.floor(Math.random() * 99)));
  }
  const sh = shoulder();
  const armPx = ARM_ART * B;
  if (s.mode === "aim") {
    const a = s.aim;
    const len = Math.hypot(a.tip.x - sh.x, a.tip.y - sh.y);
    const far = Math.hypot(W(), window.innerHeight);
    const chev = Array.from({ length: Math.max(0, Math.floor((len - armPx - 30) / 26)) }, (_, i) => `<path d="M${armPx + 30 + i * 26} -6 l9 6 l-9 6" class="chev"/>`).join("");
    el.lane.innerHTML = `<g transform="translate(${sh.x.toFixed(1)} ${sh.y.toFixed(1)}) rotate(${((a.a * 180) / Math.PI).toFixed(2)})">
      <path d="M${armPx + 20} -12 H${far} M${armPx + 20} 12 H${far}" class="range"/>
      <path d="M${armPx + 20} -11 H${len} M${armPx + 20} 11 H${len}" class="lane"/>${chev}</g>`;
    const held = a.armed && a.scope === "sentence" ? Math.min(1, (t - a.pressAt) / CHARGE_MS) : 0;
    // The claw crackles while it charges, bursts as it reaches the paragraph, and keeps fizzing while held.
    if (a.armed) {
      const tipAt = { x: sh.x + Math.cos(a.a) * (ARM_ART + 52) * B, y: sh.y + Math.sin(a.a) * (ARM_ART + 52) * B };
      const burst = a.scope === "paragraph" ? Math.max(0, 1 - (t - a.chargedAt) / 260) : 0;
      el.sparks.innerHTML = sparks(tipAt, a.a, a.scope === "paragraph" ? 0.75 + burst * 1.2 : 0.25 + held * 0.6, t);
    } else el.sparks.innerHTML = "";
    const ring = held > 0.08 ? `<g transform="translate(${a.tip.x.toFixed(1)} ${a.tip.y.toFixed(1)}) rotate(-90)" filter="url(#wobble)"><circle r="13" class="charge" stroke-dasharray="${(held * 81.7).toFixed(1)} 90"/></g>` : "";
    el.card.innerHTML = ring + chargeFx(a, t, held) + (a.target
      ? highlight(a.target.rects, 0, 0, 1, t)
      : a.clip
        ? card(a.clip, a.tip, 1, t)
        : `<g transform="translate(${a.tip.x} ${a.tip.y})"><circle r="10" class="miss${a.scanning ? " scanning" : ""}"/></g>`);
    show(el.fly, false);
    el.chain.innerHTML = "";
    return;
  }
  el.lane.innerHTML = "";
  el.sparks.innerHTML = "";
  if (s.mode !== "cast") {
    el.card.innerHTML = "";
    el.chain.innerHTML = "";
    show(el.fly, false);
    return;
  }
  const c = s.cast;
  const e = t - c.start;
  const from = { x: sh.x + Math.cos(c.a) * armPx, y: sh.y + Math.sin(c.a) * armPx };
  let f;
  let closed = false;
  if (e < c.fly) f = easeOut(e / c.fly);
  else if (c.hit && e < c.fly + GRAB_MS) (f = 1), (closed = (e - c.fly) / (GRAB_MS * 0.6) > 0.5);
  else (f = 1 - easeOut(Math.min(1, (e - c.fly - (c.hit ? GRAB_MS : 0)) / c.back))), (closed = c.hit);
  if (c.hit && !c.clanked && e >= c.fly) {
    c.clanked = true;
    rec({ type: "bite", at: [c.to.x, c.to.y], rects: c.target ? c.target.rects.map((r) => [r.x, r.y, r.w, r.h]) : undefined });
    playHookSound("clank");
  }
  const hand = { x: from.x + (c.to.x - from.x) * f, y: from.y + (c.to.y - from.y) * f };
  const deg = (c.a * 180) / Math.PI;
  el.fly.setAttribute("transform", `translate(${hand.x.toFixed(1)} ${hand.y.toFixed(1)}) rotate(${deg.toFixed(2)}) scale(${(HAND_K * B).toFixed(3)})`);
  show(el.fly, true);
  show(el.fOpen, !closed);
  show(el.fShut, closed);
  // The chain, link by link.
  const d = Math.hypot(hand.x - from.x, hand.y - from.y);
  const n = Math.max(1, Math.floor(d / 12));
  let links = "";
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const x = from.x + (hand.x - from.x) * u, y = from.y + (hand.y - from.y) * u;
    links += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="6.5" ry="${i % 2 ? 1.6 : 3.6}" transform="rotate(${deg.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  el.chain.innerHTML = d > 4 ? `<g class="chain">${links}</g>` : "";
  // The note: waiting at the tip, then caught and hauled in, shrinking into his hand.
  if (c.target) {
    // The sentence: tugged towards him as the claw bites, then let go of as it is hauled in.
    const tug = e > c.fly ? Math.sin(Math.min(1, (e - c.fly) / (GRAB_MS + c.back)) * Math.PI) : 0;
    const fade = e > c.fly + GRAB_MS ? 1 - Math.min(1, (e - c.fly - GRAB_MS) / c.back) : 1;
    // Caught: it shakes in the claw's grip, hardest as it bites, calming as it is hauled in.
    const [jx, jy] = e > c.fly ? shiver(t, e - c.fly, GRAB_MS + c.back, 1) : [0, 0];
    el.card.innerHTML = highlight(c.target.rects, -Math.cos(c.a) * tug * 14 + jx, -Math.sin(c.a) * tug * 14 + jy, fade, t);
  } else if (c.hit) {
    const caught = e >= c.fly;
    const p = caught ? { x: hand.x + Math.cos(c.a) * 34 * B, y: hand.y + Math.sin(c.a) * 34 * B } : c.to;
    el.card.innerHTML = card(c.clip, p, caught ? Math.max(0.15, f) : 1, t, caught);
  } else el.card.innerHTML = "";
}

/** Red hatching over the aimed sentence, a line at a time, with a pen line under it. */
/** Pen-stroke sparks thrown off a point, mostly forwards along `ang`; `power` 0–2 sets how many and how far. */
function sparks(p, ang, power, t) {
  const j = rng(Math.floor(t / 70));
  const n = Math.round(3 + power * 7);
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = ang + (j() * 2 - 1) * (1.1 + power * 0.5);
    const r0 = 6 + j() * 8 * power;
    const len = 6 + j() * 16 * power;
    const x0 = p.x + Math.cos(a) * r0, y0 = p.y + Math.sin(a) * r0;
    const kink = (j() * 2 - 1) * 0.6;
    const xm = x0 + Math.cos(a + kink) * len * 0.5, ym = y0 + Math.sin(a + kink) * len * 0.5;
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    const cls = j() < 0.75 ? "spark-r" : "spark-b";
    out += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}L${xm.toFixed(1)} ${ym.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}" class="${cls}"/>`;
    if (j() < 0.35) out += `<circle cx="${(x1 + Math.cos(a) * 5).toFixed(1)}" cy="${(y1 + Math.sin(a) * 5).toFixed(1)}" r="${(1.2 + j() * 1.4).toFixed(1)}" class="spark-dot"/>`;
  }
  return out;
}

/** A pen zigzag from (x, y) heading `ang` for `len` px: a little bolt of lightning. */
function zap(j, x, y, ang, len, kinks = 4) {
  let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
  for (let i = 1; i <= kinks; i++) {
    const side = (j() * 2 - 1) * len * 0.22 * (i < kinks ? 1 : 0.2);
    x += (Math.cos(ang) * len) / kinks - Math.sin(ang) * side;
    y += (Math.sin(ang) * len) / kinks + Math.cos(ang) * side;
    d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}
/** The charge, drawn round the tip: streaks of power drawn in towards it and a spinning ring while it
 *  fills; on taking the paragraph a shockwave, a starburst of bolts and the paragraph's box crackling. */
function chargeFx(a, t, held) {
  if (!a.armed) return "";
  const { x, y } = a.tip;
  const j = rng(Math.floor(t / BOIL_MS) + 7);
  let out = "";
  if (a.scope === "sentence" && held > 0.08) {
    // Streaks drawn in from all round, closing on the tip as the charge fills.
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + t / 900 + j() * 0.3;
      const r1 = 96 - held * 40 + j() * 14, r0 = r1 - 14 - held * 26;
      out += `<path d="M${(x + Math.cos(ang) * r1).toFixed(1)} ${(y + Math.sin(ang) * r1).toFixed(1)}L${(x + Math.cos(ang) * r0).toFixed(1)} ${(y + Math.sin(ang) * r0).toFixed(1)}" class="${i % 3 ? "spark-r" : "spark-b"}" stroke-width="3.2" opacity="${(0.35 + held * 0.65).toFixed(2)}"/>`;
    }
    out += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((t / 4) % 360).toFixed(1)})" filter="url(#wobble)"><circle r="${(34 - held * 10).toFixed(1)}" class="static" stroke-width="3" opacity="${held.toFixed(2)}"/></g>`;
    if (held > 0.5) for (let i = 0; i < 2; i++) out += `<path d="${zap(j, x, y, j() * Math.PI * 2, 22 + held * 20)}" class="spark-r" stroke-width="3"/>`;
  }
  if (a.scope === "paragraph") {
    const since = t - a.chargedAt;
    // A double shockwave out from the tip.
    for (const lag of [0, 110]) {
      const u = Math.min(1, Math.max(0, (since - lag) / 520));
      if (u > 0 && u < 1) out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(16 + easeOut(u) * 210).toFixed(1)}" fill="none" stroke="var(--red)" stroke-width="${(7 * (1 - u) + 0.8).toFixed(1)}" opacity="${(1 - u).toFixed(2)}" filter="url(#wobble)"/>`;
    }
    // A starburst of bolts.
    if (since < 560) {
      const k = easeOut(since / 560);
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + 0.3;
        const r0 = 20 + k * 70;
        out += `<path d="${zap(j, x + Math.cos(ang) * r0, y + Math.sin(ang) * r0, ang, 34 + k * 60)}" class="${i % 2 ? "spark-r" : "spark-b"}" stroke-width="${(4 - k * 2).toFixed(1)}" opacity="${(1 - k * 0.6).toFixed(2)}"/>`;
      }
    }
    // While held, the paragraph's box crackles with little bolts round its edge.
    const rs = a.target?.rects;
    if (rs?.length) {
      const x0 = Math.min(...rs.map((r) => r.x)) - 8, y0 = Math.min(...rs.map((r) => r.y)) - 8;
      const x1 = Math.max(...rs.map((r) => r.x + r.w)) + 8, y1 = Math.max(...rs.map((r) => r.y + r.h)) + 8;
      const per = 2 * (x1 - x0 + y1 - y0);
      for (let i = 0; i < 9; i++) {
        let d = j() * per, px, py, ang;
        if (d < x1 - x0) (px = x0 + d), (py = y0), (ang = -Math.PI / 2);
        else if ((d -= x1 - x0) < y1 - y0) (px = x1), (py = y0 + d), (ang = 0);
        else if ((d -= y1 - y0) < x1 - x0) (px = x1 - d), (py = y1), (ang = Math.PI / 2);
        else (px = x0), (py = y1 - (d - (x1 - x0))), (ang = Math.PI);
        out += `<path d="${zap(j, px, py, ang + (j() - 0.5) * 1.2, 14 + j() * 20, 3)}" class="${j() < 0.6 ? "spark-r" : "spark-b"}" stroke-width="2.8"/>`;
      }
    }
  }
  return out;
}

/** A small shake that dies away over `ms`: [dx, dy] in px. */
function shiver(t, since, ms, amp) {
  if (since < 0 || since > ms) return [0, 0];
  const k = amp * (1 - since / ms);
  return [Math.sin(t / 19) * k + Math.sin(t / 7) * k * 0.4, Math.cos(t / 23) * k * 0.8 + Math.sin(t / 11) * k * 0.3];
}

function highlight(rects, dx, dy, op, t) {
  // The pen lines boil, as in hand-drawn animation: redrawn a little differently ~8 times a second.
  const j = rng(Math.floor(t / BOIL_MS));
  const q = (a) => (j() * 2 - 1) * a;
  let out = "";
  rects.forEach((r, i) => {
    const x = r.x - 3, w = r.w + 6, y = r.y, h = r.h;
    let d = "";
    for (let o = -h; o < w + h; o += 6) d += `M${(x + o + q(1.2)).toFixed(1)} ${(y + h + 1 + q(1)).toFixed(1)}l${((h + 2) * 0.6 + q(1.2)).toFixed(1)} ${(-(h + 2) + q(1)).toFixed(1)}`;
    out += `<clipPath id="hc${i}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/></clipPath>
      <path d="${d}" class="hatch" clip-path="url(#hc${i})"/>
      <path d="M${(r.x - 2 + q(1)).toFixed(1)} ${(y + h + 1 + q(0.8)).toFixed(1)} Q${(r.x + r.w / 2).toFixed(1)} ${(y + h + 4 + q(1.5)).toFixed(1)} ${(r.x + r.w + 2 + q(1)).toFixed(1)} ${(y + h + 1 + q(0.8)).toFixed(1)}" class="under"/>`;
  });
  return `<g filter="url(#wobble)" class="hl" transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})" opacity="${op.toFixed(2)}">${out}</g>`;
}

/** The clipboard as a scrap of paper, hatched red while it is aimed at. */
const cardInk = new Map();
function card(text, p, scale, t, caught = false) {
  const line = text.replace(/\s+/g, " ").trim();
  const cjk = /[　-鿿＀-￯]/;
  let shown = "";
  let w = 0;
  for (const ch of line) {
    const cw = cjk.test(ch) ? 14 : 7.6;
    if (w + cw > 196) {
      shown += "…";
      w += 10;
      break;
    }
    shown += ch;
    w += cw;
  }
  const bw = Math.max(48, w + 28), bh = 34;
  const key = `${bw}`;
  if (!cardInk.has(key)) {
    const frame = penPaths(boxPoints(bw, bh, 8, 6), 41).map((q) => `<path d="${q.d}" stroke-width="${q.w}" opacity="${q.op}" class="pen-b"/>`).join("");
    let hatch = "";
    for (let o = -bh; o < bw + bh; o += 7) hatch += `M${o} ${bh + 1}l${(bh + 2) * 0.6} ${-(bh + 2)}`;
    cardInk.set(key, { frame, hatch });
  }
  const k = cardInk.get(key);
  const wob = caught ? Math.sin(t / 30) * 4 : Math.sin(t / 400) * 2;
  return `<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${wob.toFixed(1)}) scale(${scale.toFixed(3)}) translate(${-bw / 2} ${-bh / 2})" class="note">
    <rect x="0" y="0" width="${bw}" height="${bh}" rx="8" class="paper"/>
    <clipPath id="nc"><rect x="0" y="0" width="${bw}" height="${bh}" rx="8"/></clipPath>
    <path d="${k.hatch}" class="hatch" clip-path="url(#nc)"/>
    ${k.frame}
    <text x="${bw / 2}" y="${bh / 2 + 5}" text-anchor="middle">${esc(shown)}</text></g>`;
}

requestAnimationFrame(step);
