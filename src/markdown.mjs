// The "markdown" look: the column reads like plain GitHub markdown (h3
// headings, bullets, inline `code` chips, links), with no cards around it,
// in the visitor's light or dark theme. Cursors still build it: they drag a
// selection around each block, then type every character.

import { Scene, FONT_MONO, FONT_SANS, esc } from './scene.mjs';

// Arial advance widths (1/1000 em) for ASCII, used to place the caret and to
// wrap lines. The text itself is laid out by the browser, so small font
// differences only move the caret a little.
const AW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const isEmoji = (ch) => /\p{Extended_Pictographic}/u.test(ch);
export function textWidth(str, size, { bold = false, mono = false } = {}) {
  let w = 0;
  for (const ch of str) {
    if (mono) w += 0.6;
    else if (isEmoji(ch)) w += 1.25;
    else if (ch === '️') continue;
    else w += (AW[ch.charCodeAt(0) - 32] ?? 600) / 1000;
  }
  return w * size * (bold ? 1.07 : 1) * (mono ? 1 : 0.98);
}

function wrapRuns(runs, maxW, size) {
  // runs: [{text, ...style}] -> lines of runs, breaking at spaces
  const words = [];
  for (const r of runs) for (const part of r.text.split(/(\s+)/)) if (part) words.push({ ...r, text: part });
  const lines = [[]];
  let w = 0;
  for (const word of words) {
    const ww = textWidth(word.text, size, word);
    if (w + ww > maxW && w > 0 && word.text.trim()) {
      lines.push([]);
      w = 0;
    }
    if (!w && !word.text.trim()) continue;
    lines[lines.length - 1].push(word);
    w += ww;
  }
  return lines;
}

// One line of styled runs, typed character by character from time t. Every
// character is its own tspan that appears at its moment, so the text never
// stretches; the caret rides an estimate of the advance widths.
function typeLine(s, { x, y, runs, t, cps, size, caret }) {
  const th = s.c;
  const name = s.uid('ch');
  s.keyframes.push(`@keyframes ${name}{from{fill-opacity:0}to{fill-opacity:1}}`);
  let k = 0;
  let xx = 0;
  const caretStops = [];
  let spans = '';
  for (const r of runs) {
    const fill = r.code ? th.text : r.link ? th.link : r.muted ? th.muted : th.text;
    const weight = r.bold ? 600 : 400;
    const family = r.mono ? FONT_MONO : FONT_SANS;
    const fs = r.mono ? size * 0.85 : size;
    for (const ch of r.text) {
      const tc = t + k / cps;
      spans += `<tspan font-family='${family}' font-weight="${weight}" font-size="${fs}" fill="${fill}"${r.link ? ' text-decoration="underline"' : ''} style="animation:${name} .06s linear ${tc.toFixed(3)}s both">${esc(ch)}</tspan>`;
      xx += textWidth(ch, fs, r);
      caretStops.push([tc + 1 / cps, xx]);
      k++;
    }
  }
  s.add(`<text x="${x}" y="${y}" xml:space="preserve">${spans}</text>`);
  const end = t + k / cps;
  if (caret) {
    const stops = [[t - 0.001, 'transform:translateX(0px)', 'steps(1,end)'], ...caretStops.map(([tc, cx]) => [tc, `transform:translateX(${cx.toFixed(1)}px)`, 'steps(1,end)'])];
    s.top(`<g style="${s.anim(stops)}"><rect x="${x + 1}" y="${y - size + 1}" width="2" height="${size + 3}" fill="${caret}" opacity="0" style="${s.window(t, end + 0.25, 0.05)}"/></g>`);
  }
  return { end, width: xx };
}

// A block of wrapped rich lines typed one after another by one cursor.
function typeBlock(s, { x, y, lines, t, cps, size, lh, caret, path, gap = 0.04, bulletX = null }) {
  lines.forEach((runs, i) => {
    const yy = y + i * lh;
    if (bulletX !== null && runs.bullet) s.add(`<circle cx="${bulletX}" cy="${yy - size * 0.32}" r="${size * 0.16}" fill="${s.c.text}" style="${s.appear(t, 0.15, 'scale(.3)')};transform-box:fill-box;transform-origin:center"/>`);
    const r = typeLine(s, { x, y: yy, runs, t, cps, size, caret });
    path.push([t, x, yy - size * 0.8], [r.end, x + r.width, yy - size * 0.8]);
    t = r.end + gap;
  });
  return t;
}

const W = 400;
const SIZE = 16;
const LH = 24;

// "### Technology." and its bullets
export function mdAbout(cfg, cursor, t0, theme, id = 'ma') {
  const PAD = 24;
  const lines = [];
  for (const ln of cfg.lines) {
    wrapRuns([{ text: ln }], W - PAD - 8, SIZE).forEach((l, i) => {
      if (i === 0) l.bullet = true;
      lines.push(l);
    });
  }
  const top = 34;
  const H = top + 18 + lines.length * LH;
  const s = new Scene({ id, w: W, h: H, theme });
  const blk = s.block({ x: 2, y: 4, w: W - 4, h: H - 8, tMark: t0 + 0.1, drag: 0.45, tRough: t0 + 0.6, tDone: t0 + 0.8, code: '### ' + cfg.title, skeleton: [[4, 12, 120, 14], ...lines.map((_, i) => [PAD, top + 12 + i * LH, 200 + ((i * 61) % 140), 9])] });
  const path = [[t0 - 0.2, W + 20, 20], [blk.tMark, 2, 4], [blk.tDragEnd, W - 2, H - 4]];
  const h = typeLine(s, { x: 0, y: 25, runs: [{ text: cfg.title, bold: true }], t: blk.tDone, cps: 24, size: 20, caret: cursor.color });
  path.push([blk.tDone, 0, 10], [h.end, h.width, 10]);
  const end = typeBlock(s, { x: PAD, y: top + 24, lines, t: h.end + 0.08, cps: 90, size: SIZE, lh: LH, caret: cursor.color, path, bulletX: 9 });
  path.push([end + 0.6, W + 30, H - 10]);
  s.cursor(cursor.name, cursor.color, path);
  return { scene: s, end, alt: `${cfg.title} ${cfg.lines.join(' ')}` };
}

// "### 🛠️ Currently building": the emoji pops where the cursor clicks, then
// the words are typed. Returns the cursor's path so callers can extend it.
function headingInto(s, title, cursor, t0) {
  const [emoji, text] = title.match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u)?.slice(1) ?? [null, title];
  const tE = t0 + 0.2;
  let x = 0;
  const path = [[t0 - 0.1, W + 20, 20]];
  const clicks = [];
  if (emoji) {
    s.add(`<text x="0" y="27" font-size="19" style="transform-box:fill-box;transform-origin:center;${s.appear(tE, 0.3, 'scale(.4)')}">${esc(emoji)}</text>`);
    path.push([tE, 10, 14]);
    clicks.push(tE);
    x = 28;
  }
  const h = typeLine(s, { x, y: 27, runs: [{ text, bold: true }], t: tE + 0.15, cps: 26, size: 20, caret: cursor.color });
  path.push([tE + 0.15, x, 12], [h.end, x + h.width, 12]);
  return { end: h.end, path, clicks };
}

export function mdHeading(cfg, cursor, t0, theme, id) {
  const s = new Scene({ id, w: W, h: 38, theme });
  const h = headingInto(s, cfg.title, cursor, t0);
  h.path.push([h.end + 0.5, W + 30, 20]);
  s.cursor(cursor.name, cursor.color, h.path, { clicks: h.clicks });
  return { scene: s, end: h.end, alt: cfg.title };
}

// "- 🎵 [Name](link): description" as its own image, so it can be a link.
export function mdItem(item, cursor, t0, theme, id) {
  const PAD = 24;
  const runs = [
    { text: item.name, link: !!item.href, bold: !item.href },
    { text: ': ' + item.desc.replace(/^./, (c) => c.toLowerCase()) },
  ];
  const lines = wrapRuns(runs, W - PAD - 30, SIZE);
  lines[0].bullet = true;
  const H = 10 + lines.length * LH;
  const s = new Scene({ id, w: W, h: H, theme });
  const blk = s.block({ x: 2, y: 2, w: W - 4, h: H - 4, tMark: t0 + 0.1, drag: 0.4, tRough: t0 + 0.52, tDone: t0 + 0.72, code: `- ${item.name}`, label: false, skeleton: lines.map((_, i) => [PAD + 26, 10 + i * LH, 180 + i * 60, 9]) });
  const tE = blk.tDone + 0.08;
  s.add(`<circle cx="9" cy="${18 - SIZE * 0.32}" r="${SIZE * 0.16}" fill="${s.c.text}" style="${s.appear(tE, 0.15)}"/>`);
  s.add(`<text x="${PAD}" y="18" font-size="${SIZE}" style="transform-box:fill-box;transform-origin:center;${s.appear(tE, 0.3, 'scale(.4)')}">${esc(item.icon)}</text>`);
  const path = [[t0 - 0.3, W + 20, 4], [blk.tMark, 2, 2], [blk.tDragEnd, W - 2, H - 2], [tE, PAD + 8, 10]];
  // first line after the emoji, later lines from the text margin
  const first = typeLine(s, { x: PAD + 26, y: 18, runs: lines[0], t: tE + 0.15, cps: 70, size: SIZE, caret: cursor.color });
  path.push([tE + 0.15, PAD + 26, 5], [first.end, PAD + 26 + first.width, 5]);
  let t = first.end + 0.04;
  if (lines.length > 1) t = typeBlock(s, { x: PAD, y: 18 + LH, lines: lines.slice(1), t, cps: 70, size: SIZE, lh: LH, caret: cursor.color, path });
  path.push([t + 0.5, W + 30, H]);
  s.cursor(cursor.name, cursor.color, path, { clicks: [tE] });
  return { scene: s, end: t, alt: `${item.name}: ${item.desc}` };
}

// "### 🧰 Toolkit" and `code` chips that drop in where the cursor lands.
export function mdToolkit(cfg, cursor, t0, theme, id = 'mk') {
  const s = new Scene({ id, w: W, h: 38, theme });
  const head = headingInto(s, cfg.title, cursor, t0);
  const chips = [];
  let x = 0;
  let y = 52;
  const CH = 22;
  for (const label of cfg.items) {
    const cw = textWidth(label, 13.6, { mono: true }) + 12;
    if (x + cw > W) {
      x = 0;
      y += CH + 6;
    }
    chips.push({ label, x, y, w: cw });
    x += cw + 6;
  }
  s.h = y + CH + 6;
  const blk = s.block({ x: -2 + 2, y: 46, w: W - 2, h: s.h - 48, tMark: head.end + 0.05, drag: 0.35, tRough: head.end + 0.42, tDone: head.end + 0.6, label: false, skeleton: chips.map((c) => [c.x, c.y, c.w, CH]) });
  const path = [...head.path, [blk.tMark, 0, 46], [blk.tDragEnd, W - 2, s.h - 2]];
  const clicks = [...head.clicks];
  chips.forEach((c, i) => {
    const t = blk.tDone + 0.05 + i * 0.15;
    path.push([t, c.x + c.w / 2, c.y + CH / 2]);
    clicks.push(t);
    s.add(
      `<g style="${s.appear(t, 0.3, 'translateY(-8px)')}"><rect x="${c.x.toFixed(1)}" y="${c.y}" width="${c.w.toFixed(1)}" height="${CH}" rx="6" fill="${s.c.chip}"/>` +
        `<text x="${(c.x + 6).toFixed(1)}" y="${c.y + 15.5}" font-family='${FONT_MONO}' font-size="13.6" fill="${s.c.text}">${esc(c.label)}</text></g>`,
    );
  });
  const tLast = blk.tDone + 0.05 + (chips.length - 1) * 0.15;
  path.push([tLast + 0.6, W + 30, s.h - 10]);
  s.cursor(cursor.name, cursor.color, path, { clicks });
  return { scene: s, end: tLast + 0.3, alt: `${cfg.title.replace(/^\p{Extended_Pictographic}️?\s*/u, '')}: ${cfg.items.join(', ')}` };
}
