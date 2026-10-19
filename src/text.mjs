// The sentence under a point of the screen, from the lines Vision read off a screenshot: lines that
// sit one under another, overlapping and of a size, are read as one block, the block is cut into
// sentences at their end marks, and the sentence under the point comes back with its text and a box
// for each line it runs over.

const END = /[。！？!?；;…]/;
/** A full stop ends a sentence before a space, the end, or a CJK character ("time.布里茨"). */
const stop = (t, i) => {
  if (t[i] !== ".") return false;
  let j = i + 1;
  while (j < t.length && CLOSE.test(t[j])) j++;
  return j >= t.length || /\s/.test(t[j]) || CJK.test(t[j]);
};
const CLOSE = /[”’」』）)\]"'》]/;
const CJK = /[　-鿿＀-￯]/;

/** Fill in the edges Vision did not give (spaces, mostly) from their neighbours. */
function edges(line) {
  const [x, , w] = line.b;
  const n = line.c.length;
  const out = line.c.slice();
  for (let i = 0; i < n; i++) {
    if (out[i]) continue;
    const l = i > 0 && out[i - 1] ? out[i - 1][1] : x + (w * i) / n;
    let j = i + 1;
    while (j < n && !line.c[j]) j++;
    const r = j < n ? line.c[j][0] : x + w;
    const step = (r - l) / (j - i);
    for (let k = i; k < j; k++) out[k] = [l + step * (k - i), l + step * (k - i + 1)];
    i = j - 1;
  }
  return out;
}

/**
 * Vision sometimes cuts one line of text in two (at a link, a coloured word, a footnote mark): put
 * pieces that sit side by side on the same row, close together, back into one line.
 */
function joinRow(ls) {
  const out = [];
  for (const l of [...ls].sort((a, b) => a.b[0] - b.b[0])) {
    const [x, y, w, h] = l.b;
    const left = out.find((p) => {
      const [px, py, pw, ph] = p.b;
      const gap = x - (px + pw);
      return gap > -h * 0.5 && gap < Math.max(h, ph) * 2.5 && Math.abs(py + ph / 2 - (y + h / 2)) < Math.min(h, ph) * 0.35 && Math.max(h, ph) / Math.min(h, ph) < 1.3;
    });
    if (!left) {
      out.push({ ...l });
      continue;
    }
    const [px, py, pw, ph] = left.b;
    const space = x - (px + pw) > h * 0.25 && !(CJK.test(left.t.at(-1)) && CJK.test(l.t[0]));
    left.t += (space ? " " : "") + l.t;
    left.e = [...left.e, ...(space ? [[px + pw, x]] : []), ...l.e];
    const top = Math.min(py, y), bottom = Math.max(py + ph, y + h);
    left.b = [px, top, x + w - px, bottom - top];
  }
  return out;
}

const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Group the lines into blocks of running text. */
export function readScreen(lines) {
  const ls = joinRow(
    lines.filter((l) => l.t.trim() && l.b[2] > 2 && l.b[3] > 2).map((l) => ({ ...l, e: edges(l) }))
  ).sort((a, b) => a.b[1] - b.b[1] || a.b[0] - b.b[0]);
  const blockOf = new Map();
  const blocks = [];
  for (const l of ls) {
    const [x, y, w, h] = l.b;
    // The line just above, of a size, overlapping it, close enough to be the same paragraph.
    let best = null;
    for (const p of ls) {
      if (p === l || !blockOf.has(p)) continue;
      const [px, py, pw, ph] = p.b;
      const gap = y - (py + ph);
      if (gap < -h * 0.4 || gap > Math.max(h, ph) * 0.9) continue;
      // Running text lines up on the left (or, centred, mostly overlaps); a timestamp beside it does not.
      const overlap = Math.min(x + w, px + pw) - Math.max(x, px);
      const aligned = Math.abs(x - px) <= Math.max(h, ph) * 1.5;
      // Of a size with the block so far: a line with a formula in it (roots, sub- and superscripts)
      // stands taller, so a left-aligned line at a normal spacing may be up to 1.8 times the usual.
      const bh = median(blockOf.get(p).map((q) => q.b[3]));
      if (Math.max(h, bh) / Math.min(h, bh) > (aligned && gap <= bh * 0.9 ? 1.8 : 1.35)) continue;
      if (!aligned && overlap < Math.min(w, pw) * 0.8) continue;
      // A short line with no end mark over a longer one is a name or a heading, not wrapped text.
      if (pw < w * 0.6 && !END.test(p.t.trim().at(-1))) continue;
      const score = Math.abs(x - px) + Math.abs(gap) * 0.5;
      if (!best || score < best.score) best = { p, score };
    }
    best = best?.p ?? null;
    // A block takes the next line only from its last line.
    const block = best && blockOf.get(best).at(-1) === best ? blockOf.get(best) : null;
    if (block) block.push(l), blockOf.set(l, block);
    else {
      const nb = [l];
      blocks.push(nb);
      blockOf.set(l, nb);
    }
  }
  return blocks.map((ls) => {
    // The block's text, and for each of its characters the line and the place on it.
    let text = "";
    const map = [];
    ls.forEach((l, li) => {
      if (li > 0) {
        const a = text.at(-1), b = l.t[0];
        // A word broken over the line ("transla-" / "tion") is put back together; a hyphen that
        // belongs ("English-" / "to-German") stays, with no space after it.
        const broken = a === "-" && /\p{L}/u.test(text.at(-2) ?? "") && /\p{Ll}/u.test(b ?? "") && !/-/.test(l.t.split(/\s/)[0]);
        if (broken) {
          text = text.slice(0, -1);
          map.pop();
        } else if (a && b && !(CJK.test(a) || CJK.test(b)) && a !== "-") {
          text += " ";
          map.push(null);
        }
      }
      for (let i = 0; i < l.t.length; i++) {
        text += l.t[i];
        map.push([li, i]);
      }
    });
    return { lines: ls, text, map };
  });
}

/** The sentence under (x, y), or null. */
export function sentenceAt(blocks, x, y) {
  for (const bl of blocks) {
    const li = bl.lines.findIndex((l) => x >= l.b[0] - 4 && x <= l.b[0] + l.b[2] + 4 && y >= l.b[1] - 3 && y <= l.b[1] + l.b[3] + 3);
    if (li < 0) continue;
    const l = bl.lines[li];
    let ci = l.e.findIndex(([a, b]) => x < b);
    if (ci < 0) ci = l.e.length - 1;
    const at = bl.map.findIndex((m) => m && m[0] === li && m[1] === ci);
    // Out to the end marks on either side.
    let s = at;
    while (s > 0 && !(END.test(bl.text[s - 1]) || stop(bl.text, s - 1) || (CLOSE.test(bl.text[s - 1]) && (END.test(bl.text[s - 2] ?? "") || bl.text[s - 2] === ".")))) s--;
    let e = at;
    while (e < bl.text.length && !(END.test(bl.text[e]) || stop(bl.text, e))) e++;
    e = Math.min(bl.text.length, e + 1);
    while (e < bl.text.length && CLOSE.test(bl.text[e])) e++;
    while (s < e && /\s/.test(bl.text[s])) s++;
    const text = bl.text.slice(s, e).trim();
    if (!text) return null;
    // One box per line the sentence runs over.
    const rects = [];
    for (let k = s; k < e; k++) {
      const m = bl.map[k];
      if (!m) continue;
      const ln = bl.lines[m[0]];
      const [a, b] = ln.e[m[1]];
      const r = rects.find((r) => r.li === m[0]);
      if (r) (r.x0 = Math.min(r.x0, a)), (r.x1 = Math.max(r.x1, b));
      else rects.push({ li: m[0], x0: a, x1: b, y: ln.b[1], h: ln.b[3] });
    }
    return { key: `${bl.text.length}:${s}:${e}`, text, rects: rects.map((r) => ({ x: r.x0, y: r.y, w: r.x1 - r.x0, h: r.h })) };
  }
  return null;
}

/** The whole block (paragraph) under (x, y), or null. */
export function paragraphAt(blocks, x, y) {
  for (const bl of blocks) {
    if (!bl.lines.some((l) => x >= l.b[0] - 4 && x <= l.b[0] + l.b[2] + 4 && y >= l.b[1] - 3 && y <= l.b[1] + l.b[3] + 3)) continue;
    const text = bl.text.trim();
    if (!text) return null;
    return { key: `p:${text.length}:${bl.lines[0].b[1]}`, text, rects: bl.lines.map((l) => ({ x: l.b[0], y: l.b[1], w: l.b[2], h: l.b[3] })) };
  }
  return null;
}
