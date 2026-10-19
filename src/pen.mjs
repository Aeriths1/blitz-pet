// The ballpoint of Aparté's lib/pen.ts, for drawings made at run time (steam, sweat, flame, the
// thought bubble, the hook's lane): every line gone over twice, firmly then lightly, every point a
// little unsteady, with red hatching for the one or two parts that are red.

export function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const arc = (cx, cy, rx, ry, a0, a1, n = 28) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });

export const ring = (cx, cy, rad, n = 14) =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rad, cy + Math.sin((i / n) * Math.PI * 2) * rad]);

/** Points round a rounded box, every few px. */
export function boxPoints(w, h, r, step = 7) {
  const pts = [];
  const edge = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  };
  const corner = (cx, cy, a0) => {
    for (let i = 0; i < 5; i++) {
      const a = a0 + (i / 5) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  edge(r, 0, w - r, 0);
  corner(w - r, r, -Math.PI / 2);
  edge(w, r, w, h - r);
  corner(w - r, h - r, 0);
  edge(w - r, h, r, h);
  corner(r, h - r, Math.PI / 2);
  edge(0, h - r, 0, r);
  corner(r, r, Math.PI);
  return pts;
}

function dense(pts, step = 6) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const fmt = (p) => p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");

/** One closed line, drawn twice like a ballpoint going over itself. */
export function penPaths(pts, seed) {
  const r = rng(seed);
  const j = (a) => (r() * 2 - 1) * a;
  return [
    [0.9, 1, 2.4],
    [1.7, 0.4, 1.2],
  ].map(([wob, op, w], pass) => {
    const drift = [j(1.2), j(1.2)];
    const d = pts.map(([x, y], i) => {
      const s = Math.sin(i * 0.7 + pass * 2) * 0.5;
      return `${(x + drift[0] + j(wob) + s).toFixed(1)} ${(y + drift[1] + j(wob) - s).toFixed(1)}`;
    });
    return { d: "M" + d.join("L") + "Z", op, w };
  });
}

/** The pen of the art, for drawing in its own units (lines 4–7 wide). */
export class Pen {
  constructor(seed) {
    this.r = rng(seed);
    this.strokes = [];
  }
  j(a) {
    return (this.r() * 2 - 1) * a;
  }
  line(pts, { closed = false, w = 6 } = {}) {
    const d = dense(closed ? [...pts, pts[0]] : pts);
    for (const [pass, wob, op, ww] of [
      [0, 0.9, 1, w],
      [1, 1.6, 0.4, w * 0.45],
    ]) {
      const drift = [this.j(1.2), this.j(1.2)];
      const p = d.map(([x, y], i) => {
        const s = Math.sin(i * 0.7 + pass * 2) * 0.5;
        return [x + drift[0] + this.j(wob) + s, y + drift[1] + this.j(wob) - s];
      });
      if (!closed && p.length > 1) {
        const [a, b] = [p[0], p[1]];
        const [y, z] = [p[p.length - 2], p[p.length - 1]];
        p.unshift([a[0] + (a[0] - b[0]) * 0.3, a[1] + (a[1] - b[1]) * 0.3]);
        p.push([z[0] + (z[0] - y[0]) * 0.3, z[1] + (z[1] - y[1]) * 0.3]);
      }
      this.strokes.push({ d: "M" + fmt(p), w: ww, op });
    }
    return this;
  }
  hatch(pts, { angle = -0.8, gap = 7.5, w = 3.2 } = {}) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const R = Math.hypot(x1 - x0, y1 - y0) / 2 + 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let d = "";
    for (let o = -R; o < R; o += gap * (0.85 + this.r() * 0.3)) {
      let a = null;
      for (let t = -R; t <= R; t += 1) {
        const x = cx - dy * o + dx * t;
        const y = cy + dx * o + dy * t;
        const ok = inPoly(pts, x, y) && inPoly(pts, x - dy * 2, y + dx * 2) && inPoly(pts, x + dy * 2, y - dx * 2);
        if (ok && !a) a = [x, y];
        if ((!ok || t + 1 > R) && a) {
          if (Math.hypot(x - a[0], y - a[1]) > 3) d += `M${(a[0] + this.j(1)).toFixed(1)} ${(a[1] + this.j(1)).toFixed(1)}L${(x + this.j(1)).toFixed(1)} ${(y + this.j(1)).toFixed(1)}`;
          a = null;
        }
      }
    }
    if (d) this.strokes.push({ d, w, op: 0.85 });
    return this;
  }
}

/** Strokes as SVG paths with a class (pen-b blue line, pen-r red line). */
export const ink = (strokes, cls, flat = false) =>
  strokes.map((p) => `<path d="${p.d}" class="${cls}" stroke-width="${p.w}" opacity="${p.op}"${flat ? ' vector-effect="non-scaling-stroke"' : ""}/>`).join("");
