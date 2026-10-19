// The idle acts on a plain stage: Blitz drawn the way blitz.mjs draws him (same art, same geometry),
// standing on the floor, with a button per act. Nothing here belongs to the desk pet itself.
import { ACTS, actMs, nightCap } from "../src/acts.mjs";
import { arc, ink, Pen, penPaths, ring, rng } from "../src/pen.mjs";
import { playActSound } from "../src/sound.mjs";

const B = 0.9;
const SX = 176, SY = 120, ARM_ART = 74, HAND_K = 1.1;
const PIVOT = [120, 50], FEET = [120, 236], STACK = [69, 50];
const EYES = [[110, 71], [131, 71]];
const DROP = (FEET[1] - PIVOT[1]) * B;
const HALF_W = 92 * B;
const W = () => window.innerWidth;
const GROUND = () => window.innerHeight - 40;
const now = () => performance.now();
const seeds = rng(5);
const seed = () => Math.floor(seeds() * 1e6);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

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
<line id="floor" class="pen-b" stroke-width="2" opacity=".35"/>
<g id="art" filter="url(#sticker)">
  <ellipse cx="117" cy="146" rx="66" ry="64" class="pen-paper"/><ellipse cx="120" cy="78" rx="34" ry="28" class="pen-paper"/>
  <image href="../assets/pet-body.svg" x="0" y="0" width="256" height="256"/>
  <g id="dyn"></g>
  <g id="armG"><image href="../assets/arm.svg" x="-8" y="-24" width="96" height="48"/></g>
  <g id="handG">
    <image id="hOpen" href="../assets/claw-open.svg" x="-12" y="-48" width="112" height="96"/>
    <image id="hShut" href="../assets/claw-shut.svg" x="-12" y="-48" width="112" height="96"/>
  </g>
  <g id="extra"></g>
</g>
<g id="act"></g>
<g id="fx"></g>`;
const $ = (id) => document.getElementById(id);
const flameInk = (sd, len, skew) => {
  const f = [[104, 220], [120 + skew * 14, 220 + 34 * len], [136, 220]];
  const p = new Pen(sd);
  p.hatch(f, { angle: 1.4, gap: 6, w: 3 });
  const hatch = p.strokes;
  p.strokes = [];
  p.line(f, { w: 5 });
  return ink(hatch, "pen-r") + ink(p.strokes, "pen-r");
};
const INK = {
  stalk: ink(new Pen(53).line([[120, 56], [120, 38]], { w: 5 }).strokes, "pen-b"),
  eyes: EYES.map(([x, y], i) => ink(penPaths(ring(x, y, 7.5, 12), 61 + i).map((p) => ({ ...p, w: p.w * 1.6 })), "pen-b")),
  lids: EYES.map(([x, y], i) => ink(new Pen(71 + i).line([[x - 7, y + 1], [x + 7, y + 1]], { w: 3.6 }).strokes, "pen-b")),
  flame: flameInk(5, 1, 0),
};

const s = { f: -1, P: { x: W() / 2 + 120, y: GROUND() - DROP }, act: null, pose: null, puffs: [], flameSeed: 5, flameAt: 0, night: false, queue: [] };

function at([ax, ay]) {
  return { x: s.P.x + s.f * (ax - PIVOT[0]) * B, y: s.P.y + (ay - PIVOT[1]) * B };
}
function puff(p, vx, vy, r0, r1, life = 1200, delay = 0) {
  s.puffs.push({ x: p.x, y: p.y, vx, vy, t0: now() + delay, life, r0, r1, ink: ink(penPaths(ring(0, 0, 10, 12), seed()), "pen-b", true) });
}

function play(name) {
  s.act = { name, t0: now(), data: {} };
  document.querySelectorAll("#bar button[data-act]").forEach((b) => b.classList.toggle("on", b.dataset.act === name));
}

let last = 0;
function step(t) {
  const dt = Math.min(0.034, Math.max(0.001, (t - (last || t)) / 1000));
  last = t;
  s.P.y = GROUND() - DROP;
  s.pose = null;
  if (s.act) {
    const e = t - s.act.t0;
    const ms = actMs(s.act.name, s.act.data);
    if (e >= ms) {
      s.act = null;
      document.querySelectorAll("#bar button[data-act]").forEach((b) => b.classList.remove("on"));
      if (s.queue.length) setTimeout(() => play(s.queue.shift()), 700);
    } else {
      s.pose = ACTS[s.act.name].pose({
        e, u: e / ms, t, at, f: s.f, P: s.P, ground: GROUND(), W: W(), H: window.innerHeight, pointer: s.pointer ?? { x: s.P.x - 260, y: s.P.y - 60 },
        data: s.act.data, puff, sound: playActSound, face: (d) => (s.f = d < 0 ? -1 : 1),
      }) ?? {};
      if (s.pose.vx) s.P.x = clamp(s.P.x + s.pose.vx * dt, HALF_W + 20, W() - HALF_W - 20);
      if (s.pose.flameLen !== undefined && t - s.flameAt > 60) (s.flameSeed = seed()), (s.flameAt = t);
    }
  }
  s.puffs = s.puffs.filter((p) => t < p.t0 + p.life);
  for (const p of s.puffs) if (t >= p.t0) (p.x += p.vx * dt), (p.y += p.vy * dt), (p.vx *= Math.exp(-dt * 1.5));
  draw(t);
  requestAnimationFrame(step);
}

function draw(t) {
  const pose = s.pose ?? {};
  const f = $("floor");
  f.setAttribute("x1", 20); f.setAttribute("x2", W() - 20); f.setAttribute("y1", GROUND()); f.setAttribute("y2", GROUND());
  const hop = pose.hop ?? 0;
  const lean = pose.tilt ?? 0;
  $("art").setAttribute("transform", `translate(${s.P.x.toFixed(1)} ${(s.P.y + hop).toFixed(1)}) rotate(${lean.toFixed(2)} 0 ${DROP.toFixed(1)}) scale(${s.f * B} ${B}) translate(${-PIVOT[0]} ${-PIVOT[1]})`);
  const armArt = pose.armArt ?? 20;
  const open = pose.open ?? false;
  const ar = (armArt * Math.PI) / 180;
  const fist = [SX + Math.cos(ar) * ARM_ART, SY + Math.sin(ar) * ARM_ART];
  $("armG").setAttribute("transform", `translate(${SX} ${SY}) rotate(${armArt.toFixed(2)})`);
  $("handG").setAttribute("transform", `translate(${fist[0].toFixed(1)} ${fist[1].toFixed(1)}) rotate(${armArt.toFixed(2)}) scale(${HAND_K})`);
  $("hOpen").style.display = open ? "" : "none";
  $("hShut").style.display = open ? "none" : "";
  let gaze = pose.gaze ?? [2.4, 1.2];
  if (pose.gazeTo) {
    const eye = at([120, 71]);
    const dx = s.f * (pose.gazeTo.x - eye.x), dy = pose.gazeTo.y - eye.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(3.2, d / 12) / d;
    gaze = [dx * k, dy * k];
  }
  const pupil = pose.pupil ?? 3.4;
  const eyes = EYES.map(([x, y], i) => (pose.lids ? INK.lids[i] : `<circle cx="${x}" cy="${y}" r="7.5" class="pen-paper"/>${INK.eyes[i]}<circle cx="${(x + gaze[0]).toFixed(1)}" cy="${(y + gaze[1]).toFixed(1)}" r="${pupil}" class="pen-bf"/>`)).join("");
  const flame = pose.flameLen !== undefined ? flameInk(s.flameSeed, pose.flameLen, pose.flameSkew ?? 0) : INK.flame;
  $("dyn").innerHTML = INK.stalk + `<circle cx="120" cy="33" r="5.5" class="pen-rf"/>` + flame + eyes + (s.night ? nightCap(t) : "") + (pose.art ?? "");
  $("act").innerHTML = pose.win ?? "";
  $("fx").innerHTML = s.puffs
    .map((p) => {
      const u = (t - p.t0) / p.life;
      if (u < 0) return "";
      const r = lerp(p.r0, p.r1, easeOut(u));
      return `<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(r / 10).toFixed(3)})" opacity="${((1 - u) * (u < 0.1 ? u / 0.1 : 1)).toFixed(2)}">${p.ink}</g>`;
    })
    .join("");
}

// The buttons: one per act, by kind, plus the nightcap and "play them all".
const bar = $("bar");
const KINDS = { small: "小动作", medium: "中等", desk: "和桌面互动", long: "长待机" };
for (const [kind, label] of Object.entries(KINDS)) {
  bar.insertAdjacentHTML("beforeend", `<span class="k">${label}</span>`);
  for (const [name, a] of Object.entries(ACTS)) if (a.kind === kind) bar.insertAdjacentHTML("beforeend", `<button data-act="${name}">${a.zh}</button>`);
}
bar.insertAdjacentHTML("beforeend", `<span class="k">其他</span><button id="night">深夜睡帽</button><button id="all">连播全部</button>`);
bar.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.act) play(b.dataset.act);
  else if (b.id === "night") b.classList.toggle("on", (s.night = !s.night));
  else if (b.id === "all") {
    s.queue = Object.keys(ACTS);
    play(s.queue.shift());
  }
});
window.addEventListener("mousemove", (e) => (s.pointer = { x: e.clientX, y: e.clientY }));
window.preview = { play, state: s };
requestAnimationFrame(step);
