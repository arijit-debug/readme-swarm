import { Scene, C, FONT_MONO, FONT_SANS, esc, wrap, sweep, brushTimes } from './scene.mjs';

// Every visible change in these sections is tied to a cursor: a box appears
// where a cursor drags, text appears where a cursor types, and pixels clear
// where a cursor's brush passes. All sections start together.

// ---------------------------------------------------------------------------
// Portrait: a terminal window. One cursor marks the face; four more sweep it
// in parallel bands, and every pixel cell over the face dissolves at the
// moment a brush passes it. Cells only cover characters, never empty space.
export function portrait(cfg, cursors, t0 = 0.15) {
  const lines = cfg.ascii.replace(/\r/g, '').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const CW = 6.6;
  const LH = 13.2;
  const X0 = 26;
  const Y0 = 58;
  const W = 844;
  const H = Math.round(Y0 + lines.length * LH + 62);
  const s = new Scene({ id: 'p', w: 940, h: H, ui: 2.1 });
  const [lead, ...sweepers] = cursors;

  s.def(
    `<linearGradient id="p-dv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.green}" stop-opacity="0"/><stop offset=".5" stop-color="${C.green}" stop-opacity=".95"/><stop offset="1" stop-color="${C.green}" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="p-scan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.green}" stop-opacity="0"/><stop offset=".5" stop-color="${C.green}" stop-opacity=".10"/><stop offset="1" stop-color="${C.green}" stop-opacity="0"/></linearGradient>` +
      `<clipPath id="p-body"><rect x="0" y="40" width="${W}" height="${H - 40}"/></clipPath>`,
  );
  s.add(
    `<rect width="${W}" height="${H}" rx="12" fill="${C.bg}"/><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="none" stroke="${C.line}"/>` +
      `<line x1="0" y1="40" x2="${W}" y2="40" stroke="${C.faint}"/>` +
      `<circle cx="22" cy="20" r="6" fill="#ff5f57"/><circle cx="42" cy="20" r="6" fill="#febc2e"/><circle cx="62" cy="20" r="6" fill="#28c840"/>` +
      `<text x="${W / 2}" y="24" text-anchor="middle" font-family='${FONT_MONO}' font-size="12" fill="${C.muted}">${esc(cfg.title)}</text>`,
  );

  // the art itself, final state; the reveal cells sit on top of it
  let minC = Infinity;
  let maxC = 0;
  let firstR = Infinity;
  let lastR = 0;
  let rows = '';
  lines.forEach((line, i) => {
    const trimmed = line.replace(/\s+$/, '');
    const lead0 = trimmed.length - trimmed.trimStart().length;
    const body = trimmed.trimStart();
    if (!body) return;
    minC = Math.min(minC, lead0);
    maxC = Math.max(maxC, trimmed.length - 1);
    firstR = Math.min(firstR, i);
    lastR = i;
    rows += `<text x="${(X0 + lead0 * CW).toFixed(1)}" y="${(Y0 + i * LH).toFixed(1)}" textLength="${(body.length * CW).toFixed(1)}" lengthAdjust="spacingAndGlyphs" font-family='${FONT_MONO}' font-size="11" fill="${C.text}" xml:space="preserve">${esc(body)}</text>`;
  });
  s.add(rows);

  const face = {
    x: Math.round(X0 + minC * CW - 6),
    y: Math.round(Y0 + firstR * LH - 14),
    w: Math.round((maxC - minC + 1) * CW + 12),
    h: Math.round((lastR - firstR + 1) * LH + 10),
  };

  // cells: a 3-column grid, kept only where a character sits
  const CELL = CW * 3;
  const gy0 = Y0 - 11;
  const keep = new Map();
  lines.forEach((line, i) => {
    [...line].forEach((ch, c) => {
      if (ch === ' ') return;
      const ci = Math.floor(c / 3);
      const top = Y0 + i * LH - 10 - gy0;
      for (let cj = Math.floor(top / CELL); cj <= Math.floor((top + 13) / CELL); cj++) keep.set(`${ci},${cj}`, [ci, cj]);
    });
  });
  const cells = [...keep.values()].map(([ci, cj]) => ({ x: X0 + ci * CELL, y: gy0 + cj * CELL, w: CELL, h: CELL }));

  // timing: mark the face, then the brushes sweep their bands at once
  const tMark = t0 + 0.1;
  const tSweep = tMark + 0.75;
  const dur = 2.1;
  const R = CELL * 1.9;
  const bands = Math.max(1, sweepers.length);
  const bh = face.h / bands;
  const paths = sweepers.map((c, k) => {
    const t1 = tSweep + k * 0.07;
    const pts = sweep({ x: face.x - 12, y: face.y + k * bh + R * 0.55, w: face.w + 24, h: Math.max(1, bh - R * 1.1), t1, t2: t1 + dur, passes: Math.max(2, Math.ceil(bh / (R * 1.05))) });
    const side = k % 2 ? W + 40 : -40;
    return { c, t1, t2: t1 + dur, pts: [[t1 - 0.4, side, pts[0][2]], ...pts, [t1 + dur + 0.5, side, pts[pts.length - 1][2] + 30]] };
  });
  brushTimes(cells, paths.map((p) => p.pts.slice(1, -1)), R);
  const tEnd = Math.max(...paths.map((p) => p.t2));
  const blk = s.block({ ...face, tMark, drag: 0.6, tRough: tMark + 0.62, tDone: tEnd + 0.05, code: `<Portrait ascii={${lines.length}} />` });
  s.revealCells(cells);
  paths.forEach((p) => s.cursor(p.c.name, p.c.color, p.pts, { linear: true, brush: { r: R * 1.35, t1: p.t1, t2: p.t2 } }));

  // the lead cursor marks the face, then types `whoami`
  const py = Y0 + lines.length * LH + 22;
  const tWho = tEnd + 0.2;
  s.add(`<text x="${X0}" y="${py}" font-family='${FONT_MONO}' font-size="12" fill="${C.muted}" style="${s.appear(tWho - 0.1, 0.2, 'none')}"><tspan fill="${C.green}">$</tspan> whoami</text>`);
  const who = s.type({ x: X0, y: py + 19, text: cfg.whoami, t: tWho + 0.2, cps: 26, size: 12, charW: 7.2, fill: C.text, weight: 600 });
  lead &&
    s.cursor(lead.name, lead.color, [
      [t0 - 0.05, W + 20, 120],
      [tMark, face.x, face.y],
      [blk.tDragEnd, face.x + face.w, face.y + face.h],
      [tSweep + 0.6, face.x + face.w - 30, face.y + face.h * 0.6],
      [tEnd - 0.3, face.x + face.w - 60, face.y + face.h - 40],
      [tWho, X0 + 10, py - 6],
      [tWho + 0.2, X0, py + 8],
      [who.end, X0 + who.width, py + 8],
      [who.end + 0.6, W + 30, py],
    ]);

  // after the build: a slow scan keeps passing, as on the original portrait
  s.add(
    `<g clip-path="url(#p-body)"><rect x="0" y="0" width="${W}" height="90" fill="url(#p-scan)" opacity="0" style="${s.anim([
      [who.end - 0.001, 'opacity:0;transform:translateY(-120px)'],
      [who.end + 0.05, 'opacity:1;transform:translateY(-120px)'],
      [who.end + 7, `opacity:1;transform:translateY(${H + 120}px)`],
    ], ';animation-iteration-count:infinite')}"/></g>` +
      `<rect x="890" y="82" width="4" height="${H - 165}" rx="2" fill="url(#p-dv)" style="transform-box:fill-box;transform-origin:top;${s.appear(t0 + 0.2, 0.8, 'scaleY(0)')}"/>`,
  );
  return { scene: s, end: who.end, alt: cfg.alt };
}

const ICONS = {
  music: 'M6 12.5V3.2l7-1.7v9.3M6 12.5a2 2 0 1 1-4 0a2 2 0 0 1 4 0zM13 10.8a2 2 0 1 1-4 0a2 2 0 0 1 4 0z',
  film: 'M1.5 6.5h13v7.5h-13zM1.5 6.5l1.8-4.2l11 0l-1.6 4.2M5.6 2.4l-1.7 4.1M9.6 2.4l-1.7 4.1',
  pen: 'M2.5 13.5l.9-3.6l7.6-7.6l2.7 2.7l-7.6 7.6zM9.6 3.7l2.7 2.7',
  code: 'M5.5 4l-4 4l4 4M10.5 4l4 4l-4 4',
  spark: 'M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4',
};
function icon(name, x, y) {
  const d = ICONS[name];
  if (!d) return `<text x="${x + 8}" y="${y + 12}" text-anchor="middle" font-family='${FONT_SANS}' font-size="12" font-weight="700" fill="${C.text}">${esc(String(name || '?').slice(0, 1).toUpperCase())}</text>`;
  return `<path transform="translate(${x} ${y})" d="${d}" fill="none" stroke="${C.text}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------------------
// Profile card: one cursor marks the avatar and sweeps it, and the image
// sharpens from coarse blocks as the brush passes; a second cursor types the
// name, handle and role beside it at the same time.
export function profileCard(cfg, [c1, c2], t0, frames) {
  const W = 380;
  const H = 90;
  const A = 68;
  const AX = 11;
  const AY = 11;
  const s = new Scene({ id: 'pc', w: W, h: H });
  s.add(`<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="${C.bg}" stroke="${C.line}"/>`);
  s.def(`<clipPath id="pc-av"><rect x="${AX}" y="${AY}" width="${A}" height="${A}" rx="12"/></clipPath>`);
  const tMark = t0 + 0.1;
  const tSweep = tMark + 0.5;
  const dur = 1.5;
  const R = 13;
  const pts = sweep({ x: AX - 4, y: AY + 6, w: A + 8, h: A - 12, t1: tSweep, t2: tSweep + dur, passes: 5 });
  const cells = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) cells.push({ x: AX + i * 9, y: AY + j * 9, w: 9, h: 9 });
  brushTimes(cells, [pts], R);
  const blk = s.block({ x: AX, y: AY, w: A, h: A, tMark, drag: 0.4, tRough: tMark + 0.42, tDone: tSweep + dur + 0.05, code: '<Avatar />', label: false });

  let imgs = '';
  frames.forEach((f, i) => {
    const t = tSweep + (dur * i) / (frames.length - 1);
    imgs += `<image href="${f}" x="${AX}" y="${AY}" width="${A}" height="${A}" preserveAspectRatio="xMidYMid slice" style="${s.anim([[t - 0.001, 'opacity:0'], [t, 'opacity:1']])}"/>`;
  });
  s.add(`<g clip-path="url(#pc-av)">${imgs}</g><rect x="${AX + 0.5}" y="${AY + 0.5}" width="${A - 1}" height="${A - 1}" rx="12" fill="none" stroke="${C.line}"/>`);
  s.revealCells(cells, { levels: 24 });
  s.cursor(c1.name, c1.color, [[t0 - 0.1, -30, 30], [tMark, AX, AY], [blk.tDragEnd, AX + A, AY + A], [tSweep, pts[0][1], pts[0][2]], ...pts, [tSweep + dur + 0.5, -40, H]], { linear: true, brush: { r: 22, t1: tSweep, t2: tSweep + dur } });

  const tx = AX + A + 16;
  const n1 = s.type({ x: tx, y: AY + 22, text: cfg.name, t: t0 + 0.3, cps: 22, size: 17, charW: 10.2, fill: C.text, weight: 700, caret: c2.color });
  const n2 = s.type({ x: tx, y: AY + 42, text: cfg.handle, t: n1.end + 0.08, cps: 34, size: 11.5, charW: 6.9, fill: C.muted, caret: c2.color });
  const n3 = s.type({ x: tx, y: AY + 63, text: cfg.role, t: n2.end + 0.08, cps: 48, size: 11.5, charW: 6.9, fill: C.text, caret: c2.color });
  s.cursor(c2.name, c2.color, [
    [t0 - 0.1, W + 20, 20],
    [t0 + 0.3, tx, AY + 8],
    [n1.end, tx + n1.width, AY + 8],
    [n1.end + 0.08, tx, AY + 32],
    [n2.end, tx + n2.width, AY + 32],
    [n2.end + 0.08, tx, AY + 53],
    [n3.end, tx + n3.width, AY + 53],
    [n3.end + 0.6, W + 30, H - 10],
  ]);
  return { scene: s, end: Math.max(n3.end, tSweep + dur), alt: `${cfg.name} (${cfg.handle}), ${cfg.role}` };
}

// ---------------------------------------------------------------------------
// About card: heading and bullets typed in by one cursor that rides the caret.
export function about(cfg, cursor, t0) {
  const W = 380;
  const MAX = 46;
  const rows = [];
  cfg.lines.forEach((ln) => wrap(ln, MAX - 2).forEach((part, i) => rows.push((i === 0 ? '- ' : '  ') + part)));
  const H = 50 + rows.length * 18 + 10;
  const s = new Scene({ id: 'a', w: W, h: H });
  s.add(`<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="${C.bg}" stroke="${C.line}"/>`);
  const blk = s.block({ x: 10, y: 10, w: W - 20, h: H - 20, tMark: t0 + 0.1, drag: 0.45, tRough: t0 + 0.6, tDone: t0 + 0.85, code: '<About />', skeleton: [[20, 18, 120, 14], ...rows.map((_, i) => [20, 44 + i * 18, 180 + ((i * 53) % 130), 9])] });
  let t = blk.tDone;
  const path = [[t0 - 0.2, W + 20, 30], [blk.tMark, 10, 10], [blk.tDragEnd, W - 10, H - 10]];
  const h1 = s.type({ x: 20, y: 31, text: cfg.title, t, cps: 22, size: 16, charW: 9.6, fill: C.text, weight: 700, caret: cursor.color });
  path.push([t, 20, 18], [h1.end, 20 + h1.width, 18]);
  t = h1.end + 0.1;
  rows.forEach((r, i) => {
    const y = 55 + i * 18;
    const ty = s.type({ x: 20, y, text: r, t, cps: 95, size: 12, charW: 7.05, fill: C.text, caret: cursor.color });
    path.push([t, 20, y - 9], [ty.end, 20 + ty.width, y - 9]);
    t = ty.end + 0.05;
  });
  path.push([t + 0.6, W + 30, H - 20]);
  s.cursor(cursor.name, cursor.color, path);
  return { scene: s, end: t, alt: `${cfg.title} ${cfg.lines.join(' ')}` };
}

// ---------------------------------------------------------------------------
// A small heading strip, e.g. "Currently building".
export function heading(cfg, cursor, t0, id) {
  const W = 380;
  const H = 30;
  const s = new Scene({ id, w: W, h: H });
  const ty = s.type({ x: 6, y: 21, text: cfg.title, t: t0 + 0.2, cps: 26, size: 15, charW: 9, fill: C.text, weight: 700, caret: cursor.color });
  s.cursor(cursor.name, cursor.color, [
    [t0 - 0.1, W + 20, 20],
    [t0 + 0.2, 6, 8],
    [ty.end, 6 + ty.width, 8],
    [ty.end + 0.5, W + 30, 20],
  ]);
  return { scene: s, end: ty.end, alt: cfg.title };
}

// ---------------------------------------------------------------------------
// One project row, its own image so the README can wrap it in a link. The
// cursor drags the row out, drops the icon, types the name and description,
// then sets the link arrow.
export function project(item, cursor, t0, id) {
  const W = 380;
  const desc = wrap(item.desc, 44);
  const H = 38 + desc.length * 14;
  const s = new Scene({ id, w: W, h: H });
  s.add(`<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="${C.bg}" stroke="${C.line}"/>`);
  const blk = s.block({
    x: 8,
    y: 6,
    w: W - 16,
    h: H - 12,
    tMark: t0 + 0.1,
    drag: 0.42,
    tRough: t0 + 0.56,
    tDone: t0 + 0.8,
    code: `<Project name="${item.name}" />`,
    skeleton: [[16, 12, 26, 26], [52, 13, 120, 11], ...desc.map((_, i) => [52, 31 + i * 14, 200 + i * 40, 8])],
  });
  const tIcon = blk.tDone + 0.12;
  s.add(`<g style="transform-box:fill-box;transform-origin:center;${s.appear(tIcon, 0.3, 'scale(.6)')}"><rect x="14" y="12" width="28" height="28" rx="7" fill="${C.panel}" stroke="${C.line}"/>${icon(item.icon, 20, 18)}</g>`);
  const nm = s.type({ x: 52, y: 25, text: item.name, t: tIcon + 0.18, cps: 30, size: 13.5, charW: 8.1, fill: item.href ? '#58a6ff' : C.text, weight: 700, caret: cursor.color });
  const path = [
    [t0 - 0.3, W + 20, 6],
    [blk.tMark, 8, 6],
    [blk.tDragEnd, W - 8, H - 6],
    [tIcon, 28, 26],
    [tIcon + 0.18, 52, 13],
    [nm.end, 52 + nm.width, 13],
  ];
  let t = nm.end + 0.06;
  desc.forEach((d, i) => {
    const ty = s.type({ x: 52, y: 39 + i * 14, text: d, t, cps: 80, size: 10.5, charW: 6.3, fill: C.muted, caret: cursor.color });
    path.push([t, 52, 30 + i * 14], [ty.end, 52 + ty.width, 30 + i * 14]);
    t = ty.end + 0.04;
  });
  const tTag = t + 0.2;
  s.add(
    `<g style="transform-box:fill-box;transform-origin:center;${s.appear(tTag, 0.3, 'scale(.6)')}">` +
      (item.href
        ? `<g transform="translate(${W - 32} 10)"><rect width="22" height="22" rx="6" fill="${C.panel}" stroke="${C.line}"/><path d="M8 14L14 8M9.5 8H14V12.5" fill="none" stroke="#58a6ff" stroke-width="1.6" stroke-linecap="round"/></g>`
        : `<text x="${W - 14}" y="24" text-anchor="end" font-family='${FONT_MONO}' font-size="9.5" fill="${C.muted}">${esc(item.tag || 'private')}</text>`) +
      `</g>`,
  );
  path.push([tTag, W - 22, 21], [tTag + 0.55, W + 30, H / 2]);
  s.cursor(cursor.name, cursor.color, path, { clicks: [tIcon, tTag] });
  return { scene: s, end: tTag, alt: `${item.name}: ${item.desc}` };
}

// ---------------------------------------------------------------------------
// Toolkit chips: a cursor types the heading, marks the row, then hops from
// chip to chip, and each chip drops in as the cursor lands on it.
export function toolkit(cfg, cursor, t0, W = 380) {
  const PAD = 14;
  const chips = [];
  let x = PAD;
  let y = 52;
  for (const label of cfg.items) {
    const cw = Math.round(label.length * 7.1 + 20);
    if (x + cw > W - PAD) {
      x = PAD;
      y += 32;
    }
    chips.push({ label, x, y, w: cw });
    x += cw + 8;
  }
  const H = y + 34;
  const s = new Scene({ id: 'k', w: W, h: H });
  const ty = s.type({ x: 6, y: 27, text: cfg.title, t: t0 + 0.15, cps: 22, size: 17, charW: 10.2, fill: C.text, weight: 700, caret: cursor.color });
  const blk = s.block({ x: 8, y: 44, w: W - 16, h: H - 50, tMark: ty.end + 0.05, drag: 0.4, tRough: ty.end + 0.5, tDone: ty.end + 0.7, code: '<Toolkit />', skeleton: chips.map((c) => [c.x, c.y, c.w, 24]) });
  const path = [[t0 - 0.1, W + 20, 20], [t0 + 0.15, 6, 14], [ty.end, 6 + ty.width, 14], [blk.tMark, 8, 44], [blk.tDragEnd, W - 8, H - 8]];
  const clicks = [];
  chips.forEach((c, i) => {
    const t = blk.tDone + 0.05 + i * 0.17;
    path.push([t, c.x + c.w / 2, c.y + 12]);
    clicks.push(t);
    s.add(
      `<g style="${s.appear(t, 0.32, 'translateY(-10px)')}"><rect x="${c.x}" y="${c.y}" width="${c.w}" height="24" rx="12" fill="${C.panel}" stroke="${C.line}"/>` +
        `<text x="${c.x + c.w / 2}" y="${c.y + 16}" text-anchor="middle" font-family='${FONT_MONO}' font-size="11.5" fill="${C.text}">${esc(c.label)}</text></g>`,
    );
  });
  const tLast = blk.tDone + 0.05 + (chips.length - 1) * 0.17;
  path.push([tLast + 0.6, W + 30, H - 10]);
  s.cursor(cursor.name, cursor.color, path, { clicks });
  return { scene: s, end: tLast + 0.3, alt: `${cfg.title}: ${cfg.items.join(', ')}` };
}

// ---------------------------------------------------------------------------
// Editor timeline: an NLE panel. Two cursors work in parallel: each drags out
// a clip and types its repo and commit message, then the next. One then
// sweeps the audio track to draw the waveform, and the other drops the
// playhead, which keeps looping.
export function timeline(cfg, commits, cursors, t0, updated) {
  const W = 940;
  const H = 232;
  const s = new Scene({ id: 't', w: W, h: H, ui: 1.2 });
  const LEFT = 92;
  const RIGHT = W - 16;
  const span = RIGHT - LEFT;
  const tracks = [{ name: 'V2', y: 74 }, { name: 'V1', y: 112 }, { name: 'A1', y: 150 }];
  const palette = ['#d97757', '#58a6ff', '#a371f7', '#3fb950', '#f0883e', '#db61a2'];
  const repoColor = new Map();
  const [A, B] = cursors;

  s.add(`<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="${C.bg}" stroke="${C.line}"/>`);
  const title = s.type({ x: 16, y: 21, text: cfg.title, t: t0 + 0.15, cps: 40, size: 11.5, charW: 6.9, fill: C.text, weight: 600, caret: A.color });
  s.add(
    `<g style="${s.appear(t0 + 0.1, 0.35, 'none')}"><line x1="1" y1="32.5" x2="${W - 1}" y2="32.5" stroke="${C.faint}"/></g>` +
      `<text x="${W - 16}" y="21" text-anchor="end" font-family='${FONT_MONO}' font-size="10.5" fill="${C.muted}" style="${s.appear(title.end, 0.4, 'none')}">${esc(`${commits.length} recent commits   /   rebuilt ${updated}`)}</text>`,
  );
  let ruler = `<g style="${s.appear(t0 + 0.2, 0.4, 'none')}"><rect x="${LEFT}" y="38" width="${span}" height="22" fill="${C.panel}"/>`;
  for (let i = 0; i <= 40; i++) {
    const x = LEFT + (span / 40) * i;
    const major = i % 5 === 0;
    ruler += `<line x1="${x.toFixed(1)}" y1="${major ? 46 : 53}" x2="${x.toFixed(1)}" y2="60" stroke="${C.line}"/>`;
    if (major && i < 40) ruler += `<text x="${(x + 3).toFixed(1)}" y="52" font-family='${FONT_MONO}' font-size="8.5" fill="${C.muted}">00:${String((i / 5) * 2).padStart(2, '0')}:00</text>`;
  }
  s.add(ruler + `</g>`);
  tracks.forEach((tr, i) =>
    s.add(
      `<g style="${s.appear(t0 + 0.25 + i * 0.08, 0.3, 'none')}"><rect x="12" y="${tr.y}" width="72" height="32" rx="5" fill="${C.panel}" stroke="${C.line}"/>` +
        `<text x="24" y="${tr.y + 20}" font-family='${FONT_MONO}' font-size="11" font-weight="600" fill="${C.text}">${tr.name}</text>` +
        `<rect x="50" y="${tr.y + 10}" width="12" height="12" rx="2" fill="none" stroke="${C.muted}"/><circle cx="72" cy="${tr.y + 16}" r="4" fill="none" stroke="${C.muted}"/>` +
        `<rect x="${LEFT}" y="${tr.y}" width="${span}" height="32" fill="${C.panel}" fill-opacity=".35"/></g>`,
    ),
  );

  const n = commits.length;
  const gap = 6;
  const slot = (span - gap * (n + 1)) / Math.max(1, n);
  const clock = [title.end + 0.05, t0 + 0.35];
  const paths = [
    [[t0 - 0.05, W + 20, 60], [t0 + 0.15, 16, 8], [title.end, 16 + title.width, 8]],
    [[t0 + 0.1, -30, 110]],
  ];
  commits.forEach((c, i) => {
    if (!repoColor.has(c.repo)) repoColor.set(c.repo, palette[repoColor.size % palette.length]);
    const col = repoColor.get(c.repo);
    const tr = tracks[i % 2];
    const who = i % 2;
    const x = LEFT + gap + i * (slot + gap);
    const w = Math.min(slot * 2 + gap - 4, RIGHT - gap - x);
    // fit each label inside its clip, measured in its own font size
    const fit = (str, cw) => {
      const max = Math.floor((w - 18) / cw);
      return str.length > max ? str.slice(0, Math.max(1, max - 1)) + '…' : str;
    };
    const msg = fit(c.message, 5.9);
    const repoShort = fit(c.repo, 5.1);
    const t = clock[who];
    const blk = s.block({ x: +x.toFixed(1), y: tr.y + 2, w: +w.toFixed(1), h: 28, tMark: t, drag: 0.3, tRough: t + 0.32, tDone: t + 0.4, label: false });
    s.add(
      `<g style="${s.appear(blk.tDone, 0.25, 'none')}"><rect x="${x.toFixed(1)}" y="${tr.y + 2}" width="${w.toFixed(1)}" height="28" rx="4" fill="${col}" fill-opacity=".22" stroke="${col}"/>` +
        `<rect x="${x.toFixed(1)}" y="${tr.y + 2}" width="4" height="28" rx="2" fill="${col}"/></g>`,
    );
    const r1 = s.type({ x: +(x + 9).toFixed(1), y: tr.y + 13.5, text: repoShort, t: blk.tDone + 0.05, cps: 70, size: 8.5, charW: 5.1, fill: col, caret: false });
    const r2 = s.type({ x: +(x + 9).toFixed(1), y: tr.y + 25, text: msg, t: r1.end + 0.03, cps: 85, size: 9.8, charW: 5.9, fill: C.text, caret: col });
    paths[who].push([t, x, tr.y + 2], [blk.tDragEnd, x + w, tr.y + 30], [blk.tDone + 0.05, x + 9, tr.y + 8], [r1.end, x + 9 + r1.width, tr.y + 8], [r1.end + 0.03, x + 9, tr.y + 19], [r2.end, x + 9 + r2.width, tr.y + 19]);
    clock[who] = r2.end + 0.08;
  });

  // audio: cursor B sweeps the A1 track and the waveform draws in under it
  const a1 = tracks[2];
  let wave = '';
  for (let i = 0; i < 150; i++) {
    const x = LEFT + 6 + i * ((span - 12) / 150);
    const amp = 3 + Math.abs(Math.sin(i * 0.37) * 7 + Math.sin(i * 1.13) * 4);
    wave += `<rect x="${x.toFixed(1)}" y="${(a1.y + 16 - amp).toFixed(1)}" width="2.4" height="${(amp * 2).toFixed(1)}" rx="1" fill="${C.green}" fill-opacity=".55"/>`;
  }
  const tWave = Math.max(...clock) + 0.05;
  const waveDur = 1.0;
  s.def(`<clipPath id="t-wv"><rect x="${LEFT}" y="${a1.y}" height="32" width="${span}" style="${s.anim([[tWave - 0.001, 'width:0px'], [tWave + waveDur, `width:${span}px`]])}"/></clipPath>`);
  s.add(`<g clip-path="url(#t-wv)">${wave}</g>`);
  paths[1].push([tWave - 0.2, LEFT, a1.y + 16], [tWave, LEFT, a1.y + 16]);
  const sweepB = [[tWave, LEFT, a1.y + 16], [tWave + waveDur, RIGHT, a1.y + 16]];

  // playhead appears where cursor A drops it, then loops
  const tPlay = tWave + waveDur + 0.1;
  paths[0].push([tPlay - 0.3, LEFT, 44], [tPlay, LEFT, 44]);
  const ph = (x) => `transform:translateX(${x.toFixed(1)}px)`;
  s.top(
    `<g style="${s.appear(tPlay, 0.2, 'none')}"><g style="${s.anim([[tPlay, ph(0)], [tPlay + 6, ph(span)]], ';animation-iteration-count:infinite')}">` +
      `<path d="M${LEFT - 6} 38h12v9l-6 6l-6-6z" fill="#f85149"/><rect x="${LEFT - 0.75}" y="47" width="1.5" height="${H - 64}" fill="#f85149"/></g></g>`,
  );
  let lx = 16;
  let legend = `<g style="${s.appear(tPlay, 0.4, 'none')}">`;
  for (const [repo, col] of repoColor) {
    legend += `<rect x="${lx}" y="${H - 26}" width="9" height="9" rx="2" fill="${col}"/><text x="${lx + 14}" y="${H - 18}" font-family='${FONT_MONO}' font-size="10" fill="${C.muted}">${esc(repo)}</text>`;
    lx += 30 + repo.length * 6.2;
  }
  legend += `<text x="${W - 16}" y="${H - 18}" text-anchor="end" font-family='${FONT_MONO}' font-size="10" fill="${C.muted}">${esc(cfg.footer || '')}</text></g>`;
  s.add(legend);

  paths[0].push([tPlay + 0.6, W + 30, H - 30]);
  s.cursor(A.name, A.color, paths[0], { clicks: [tPlay] });
  // B places clips, then sweeps along the audio at constant speed so the
  // waveform reveal stays exactly under it
  s.cursor(B.name, B.color, [...paths[1], ...sweepB.slice(1), [tWave + waveDur + 0.6, W + 30, a1.y + 40]], { linear: true, brush: { r: 26, t1: tWave, t2: tWave + waveDur } });

  const alt = `Editor timeline of recent commits: ${commits.map((c) => `${c.repo}: ${c.message}`).join('; ')}`;
  return { scene: s, end: tPlay, alt };
}
