// A Scene is one self-contained SVG. Every animated element gets its own
// generated @keyframes, timed in absolute seconds from page load, so separate
// images on a README can play as one sequence. The static attributes on each
// element are its final state: with reduced motion (or no animation support)
// the image shows the finished page.

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const FONT_MONO = '"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace';
export const FONT_SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif';

export const C = {
  bg: '#0d1117',
  panel: '#161b22',
  line: '#30363d',
  faint: '#21262d',
  text: '#e6edf3',
  muted: '#9198a1',
  green: '#7ee787',
  blue: '#388bfd',
  link: '#4493f8',
  chip: '#656c7633',
};

// GitHub's own markdown colours, so text images match the page around them.
export const THEMES = {
  dark: C,
  light: {
    bg: '#ffffff',
    panel: '#f6f8fa',
    line: '#d1d9e0',
    faint: '#eff2f5',
    text: '#1f2328',
    muted: '#59636e',
    green: '#1a7f37',
    blue: '#0969da',
    link: '#0969da',
    chip: '#818b981f',
  },
};

const EASE = 'cubic-bezier(.45,0,.2,1)';

export class Scene {
  // ui: scale for cursors, badges and tooltips, so they read the same size
  // whatever width the image is shown at on the README.
  constructor({ id, w, h, ui = 1, theme = C }) {
    this.id = id;
    this.c = theme;
    this.ui = ui;
    this.w = w;
    this.h = h;
    this.keyframes = [];
    this.defs = [];
    this.body = [];
    this.over = [];
    this.n = 0;
  }

  uid(tag = 'e') {
    return `${this.id}-${tag}${this.n++}`;
  }

  // stops: [[seconds, 'css decls', optionalTimingFunction], ...]
  anim(stops, extra = '') {
    const clean = [];
    for (const s of stops) {
      const last = clean[clean.length - 1];
      const t = last && s[0] <= last[0] ? last[0] + 0.001 : s[0];
      clean.push([t, s[1], s[2]]);
    }
    const t0 = clean[0][0];
    const d = Math.max(0.01, clean[clean.length - 1][0] - t0);
    const name = this.uid('k');
    const frames = clean
      .map(([t, css, fn]) => `${(((t - t0) / d) * 100).toFixed(3)}%{${css}${fn ? `;animation-timing-function:${fn}` : ''}}`)
      .join('');
    this.keyframes.push(`@keyframes ${name}{${frames}}`);
    return `animation:${name} ${d.toFixed(3)}s linear ${t0.toFixed(3)}s both${extra}`;
  }

  // Visible only between t1 and t2 (fading in and out).
  window(t1, t2, fade = 0.15, peak = 1) {
    return this.anim([
      [t1 - 0.001, 'opacity:0'],
      [t1 + fade, `opacity:${peak}`],
      [t2, `opacity:${peak}`],
      [t2 + fade, 'opacity:0'],
    ]);
  }

  // Hidden until t, then fades/settles in. Final state is the element as drawn.
  appear(t, dur = 0.4, from = 'translateY(4px)') {
    return this.anim([
      [t - 0.001, `opacity:0;transform:${from}`, EASE],
      [t + dur, 'opacity:1;transform:none'],
    ]);
  }

  add(s) {
    this.body.push(s);
  }

  top(s) {
    this.over.push(s);
  }

  def(s) {
    this.defs.push(s);
  }

  // ---- building blocks -------------------------------------------------

  // A named cursor flying through [t, x, y] points (sorted by t). Long moves
  // bow slightly; `linear` keeps constant speed so other effects can be timed
  // off the cursor's exact position (see pathAt). `brush` draws a soft glow
  // under the cursor between two times, and `clicks` drop a ripple there.
  cursor(name, color, path, { linear = false, brush = null, clicks = [] } = {}) {
    path = [...path].sort((a, b) => a[0] - b[0]);
    // keep the arrow and its name tag inside the image while it works;
    // only the entry and exit points may sit off the edge
    const tagW = 10 + name.length * 6.4;
    const maxX = this.w - (11 + tagW + 4) * this.ui;
    const maxY = Math.max(this.h * 0.45, this.h - 36 * this.ui);
    path = path.map((p, i) => (i === 0 || i === path.length - 1 ? p : [p[0], Math.max(2, Math.min(maxX, p[1])), Math.max(2, Math.min(maxY, p[2]))]));
    const ease = linear ? undefined : EASE;
    const stops = [];
    path.forEach(([t, x, y], i) => {
      if (i > 0 && !linear) {
        const [pt, px, py] = path[i - 1];
        const dx = x - px;
        const dy = y - py;
        const len = Math.hypot(dx, dy);
        if (len > 60 && t - pt > 0.2) {
          const bow = len * 0.07;
          stops.push([pt + (t - pt) / 2, `transform:translate(${(px + dx / 2 - (dy / len) * bow).toFixed(1)}px,${(py + dy / 2 + (dx / len) * bow).toFixed(1)}px)`, ease]);
        }
      }
      stops.push([t, `transform:translate(${x.toFixed ? x.toFixed(1) : x}px,${y.toFixed ? y.toFixed(1) : y}px)`, ease]);
    });
    const t0 = path[0][0];
    const t1 = path[path.length - 1][0];
    const move = this.anim(stops);
    const fade = this.window(t0, t1 - 0.25, 0.2);
    const u = this.ui;
    let glow = '';
    if (brush) {
      const g = this.uid('br');
      this.def(`<radialGradient id="${g}"><stop offset="0" stop-color="${this.c.green}" stop-opacity=".55"/><stop offset=".45" stop-color="${this.c.green}" stop-opacity=".16"/><stop offset="1" stop-color="${this.c.green}" stop-opacity="0"/></radialGradient>`);
      glow = `<circle r="${brush.r}" fill="url(#${g})" opacity="0" style="${this.window(brush.t1, brush.t2, 0.2)}"/>`;
    }
    this.top(
      `<g style="${move}">${glow}<g opacity="0" style="${fade}"><g transform="scale(${u})">` +
        `<path d="M1.4 1.6L1.4 17.1L5.7 13.4L8.6 20L11.1 18.9L8.3 12.4L14 12.4Z" fill="#000" fill-opacity=".35"/>` +
        `<path d="M0 0L0 15.5L4.3 11.8L7.2 18.4L9.7 17.3L6.9 10.8L12.6 10.8Z" fill="${color}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<rect x="11" y="17" width="${tagW.toFixed(1)}" height="16" rx="8" fill="${color}"/>` +
        `<text x="${(11 + tagW / 2).toFixed(1)}" y="28.6" text-anchor="middle" font-family='${FONT_SANS}' font-size="10.5" font-weight="600" fill="#fff">${esc(name)}</text>` +
        `</g></g></g>`,
    );
    for (const tc of clicks) {
      const [x, y] = pathAt(path, tc);
      this.ripple(x, y, tc, color);
    }
  }

  // A click: a ring that expands and fades where the cursor pressed.
  ripple(x, y, t, color = this.c.blue) {
    const r = 14 * this.ui;
    this.top(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="none" stroke="${color}" stroke-width="${1.6 * this.ui}" opacity="0" style="transform-box:fill-box;transform-origin:center;${this.anim([
        [t - 0.001, 'opacity:0;transform:scale(.2)'],
        [t + 0.02, 'opacity:.9;transform:scale(.2)', 'cubic-bezier(.2,.7,.3,1)'],
        [t + 0.45, 'opacity:0;transform:scale(1)'],
      ])}"/>`,
    );
  }

  // Cells that each dissolve at their own time (t), flashing green first.
  // Times are quantised into shared keyframe classes to keep the file small.
  revealCells(cells, { levels = 60, dur = 0.34 } = {}) {
    if (!cells.length) return;
    const lo = Math.min(...cells.map((c) => c.t));
    const hi = Math.max(...cells.map((c) => c.t));
    const name = this.uid('rv');
    const q = (t) => Math.round(((t - lo) / Math.max(0.01, hi - lo)) * (levels - 1));
    const used = new Set(cells.map((c) => q(c.t)));
    for (const i of used) {
      const t = lo + ((hi - lo) * i) / (levels - 1);
      this.keyframes.push(
        `@keyframes ${name}-${i}{0%{opacity:1;fill:${this.c.bg}}35%{opacity:1;fill:${this.c.green};fill-opacity:.55}70%{opacity:1;fill:${this.c.green};fill-opacity:.18}100%{opacity:0;fill:${this.c.green};fill-opacity:0}}` +
          `.${name}-${i}{animation:${name}-${i} ${dur}s steps(4,end) ${t.toFixed(3)}s both}`,
      );
    }
    this.top(`<g>${cells.map((c) => `<rect class="${name}-${q(c.t)}" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${(c.w + 0.6).toFixed(1)}" height="${(c.h + 0.6).toFixed(1)}" opacity="0"/>`).join('')}</g>`);
  }

  // The four build states of a block: mark (dashed drag box + size badge),
  // rough (outline, skeleton bars, code tooltip), done (content + glow).
  block({ x, y, w, h, tMark, drag = 0.55, tRough, tDone, code, skeleton = [], label = true }) {
    const tDragEnd = tMark + drag;
    tRough = tRough ?? tDragEnd + 0.1;
    tDone = tDone ?? tRough + 0.55;
    const sel = this.anim([
      [tMark - 0.001, 'opacity:0;transform:scale(.02)'],
      [tMark, 'opacity:1;transform:scale(.02)', 'cubic-bezier(.3,0,.25,1)'],
      [tDragEnd, 'opacity:1;transform:scale(1)'],
      [tDone, 'opacity:1;transform:scale(1)'],
      [tDone + 0.25, 'opacity:0;transform:scale(1)'],
    ]);
    this.top(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${this.c.blue}" fill-opacity=".07" stroke="${this.c.blue}" stroke-width="1.2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" opacity="0" style="transform-box:fill-box;transform-origin:0 0;${sel}"/>`,
    );
    this.ripple(x, y, tMark);
    this.ripple(x + w, y + h, tDragEnd);
    if (label) {
      const u = this.ui;
      const txt = `${Math.round(w)} × ${Math.round(h)}`;
      const lw = (txt.length * 6.1 + 10) * u;
      const lh = 15 * u;
      const lx = Math.min(this.w - lw - 2, x + w - lw);
      const ly = y + h + 4 + lh <= this.h ? y + h + 4 : y + h - lh - 4;
      this.top(
        `<g opacity="0" style="${this.window(tMark + drag * 0.4, tDone, 0.12)}"><rect x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${lw.toFixed(1)}" height="${lh}" rx="${3 * u}" fill="${this.c.blue}"/>` +
          `<text x="${(lx + lw / 2).toFixed(1)}" y="${(ly + 11 * u).toFixed(1)}" text-anchor="middle" font-family='${FONT_MONO}' font-size="${9.5 * u}" fill="#fff">${txt}</text></g>`,
      );
    }
    const rough = this.window(tRough, tDone, 0.12);
    const bars = skeleton
      .map(([bx, by, bw, bh]) => `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${Math.min(4, bh / 2)}" fill="${this.c.faint}"/>`)
      .join('');
    this.add(
      `<g opacity="0" style="${rough}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="${this.c.blue}" stroke-opacity=".7" vector-effect="non-scaling-stroke"/>${bars}</g>`,
    );
    if (code) {
      const u = this.ui;
      const cw = (code.length * 6.1 + 14) * u;
      const ch = 18 * u;
      const cx = Math.max(2, Math.min(this.w - cw - 2, x));
      const cy = y - ch - 4 >= 1 ? y - ch - 4 : y + 4;
      this.top(
        `<g opacity="0" style="${this.window(tRough, tDone, 0.12)}"><rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch}" rx="${4 * u}" fill="${this.c.panel}" stroke="${this.c.line}"/>` +
          `<text x="${(cx + 7 * u).toFixed(1)}" y="${(cy + 12.5 * u).toFixed(1)}" font-family='${FONT_MONO}' font-size="${9.5 * u}" fill="${this.c.green}">${esc(code)}</text></g>`,
      );
    }
    this.add(
      `<rect x="${x - 1}" y="${y - 1}" width="${w + 2}" height="${h + 2}" rx="4" fill="none" stroke="${this.c.green}" stroke-width="1.5" opacity="0" style="${this.anim([
        [tDone - 0.001, 'opacity:0'],
        [tDone + 0.12, 'opacity:.85'],
        [tDone + 0.9, 'opacity:0'],
      ])}"/>`,
    );
    return { tMark, tDragEnd, tRough, tDone };
  }

  // Typed text with a caret. Monospace with textLength keeps every step exact.
  type({ x, y, text, t, cps = 55, size = 13, charW = 7.8, fill = this.c.text, weight = 400, caret = this.c.green, font = FONT_MONO }) {
    const n = [...text].length;
    const width = n * charW;
    const dur = Math.max(0.05, n / cps);
    const clip = this.uid('c');
    this.def(
      // once typed, the mask opens wide so a glyph rendered a little wider
      // than its slot is never shaved off
      `<clipPath id="${clip}"><rect x="${x - 2}" y="${y - size * 1.2}" height="${size * 1.8}" width="${(width + size * 4).toFixed(1)}" style="${this.anim([
        [t - 0.001, 'width:0px', `steps(${n},end)`],
        [t + dur, `width:${(width + 2).toFixed(1)}px`],
        [t + dur + 0.05, `width:${(width + size * 4).toFixed(1)}px`],
      ])}"/></clipPath>`,
    );
    this.add(
      `<text x="${x}" y="${y}" textLength="${width.toFixed(1)}" lengthAdjust="spacingAndGlyphs" font-family='${font}' font-size="${size}" font-weight="${weight}" fill="${fill}" clip-path="url(#${clip})" xml:space="preserve">${esc(text)}</text>`,
    );
    if (caret) {
      const mv = this.anim([
        [t - 0.001, 'transform:translateX(0px)', `steps(${n},end)`],
        [t + dur, `transform:translateX(${width.toFixed(1)}px)`],
      ]);
      this.top(
        `<g style="${mv}"><rect x="${x + 1}" y="${y - size + 1}" width="2" height="${size + 2}" fill="${caret}" opacity="0" style="${this.window(t, t + dur + 0.25, 0.05)}"/></g>`,
      );
    }
    return { end: t + dur, width };
  }

  // Pixel reveal: a grid of cells over (x, y, w, h) that flash green and
  // dissolve, sweeping top to bottom between t1 and t2 with a little jitter.
  // Cells share a few dozen keyframe classes, which keeps the file small.
  pixelate({ x, y, w, h, cell = 28, t1, t2, seed = 7, levels = 36, flash = this.c.green }) {
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    const name = this.uid('px');
    const span = Math.max(0.1, t2 - t1 - 0.35);
    for (let i = 0; i < levels; i++) {
      const t = t1 + (span * i) / (levels - 1);
      this.keyframes.push(
        `@keyframes ${name}-${i}{0%{opacity:1;fill:${this.c.bg}}55%{opacity:1;fill:${flash};fill-opacity:.38}100%{opacity:0;fill:${flash};fill-opacity:0}}` +
          `.${name}-${i}{animation:${name}-${i} .35s steps(3,end) ${t.toFixed(3)}s both}`,
      );
    }
    let r = seed * 7919;
    const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    let cells = '';
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = Math.max(0, Math.min(levels - 1, Math.round(((j + rand() * 2.2) / (rows + 2.2)) * (levels - 1))));
        cells += `<rect class="${name}-${k}" x="${(x + i * cell).toFixed(1)}" y="${(y + j * cell).toFixed(1)}" width="${cell + 0.6}" height="${cell + 0.6}" opacity="0"/>`;
      }
    }
    this.top(`<g>${cells}</g>`);
  }

  // A bright band that scans down once over (x, y, w, h) between t1 and t2.
  scan({ x, y, w, h, t1, t2, band = 70 }) {
    const grad = this.uid('sg');
    const clip = this.uid('sc');
    this.def(
      `<linearGradient id="${grad}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${this.c.green}" stop-opacity="0"/><stop offset=".8" stop-color="${this.c.green}" stop-opacity=".22"/><stop offset="1" stop-color="#d2ffd9" stop-opacity=".7"/></linearGradient>` +
        `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`,
    );
    this.top(
      `<g clip-path="url(#${clip})"><rect x="${x}" y="${y - band}" width="${w}" height="${band}" fill="url(#${grad})" opacity="0" style="${this.anim([
        [t1 - 0.001, 'opacity:0;transform:translateY(0px)'],
        [t1 + 0.05, 'opacity:1;transform:translateY(0px)'],
        [t2, `opacity:1;transform:translateY(${h + band}px)`],
        [t2 + 0.05, `opacity:0;transform:translateY(${h + band}px)`],
      ])}"/></g>`,
    );
  }

  render({ title } = {}) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}" overflow="hidden" role="img"${title ? ` aria-label="${esc(title)}"` : ''}>` +
      (title ? `<title>${esc(title)}</title>` : '') +
      `<style>${this.keyframes.join('')}` +
      `@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>` +
      `<defs>${this.defs.join('')}</defs>` +
      this.body.join('') +
      this.over.join('') +
      `</svg>\n`
    );
  }
}

// Card chrome shared by the right-column panels: a quiet dark panel with a
// filename header, so each block reads as one file of the profile.
export function card(scene, { file, t }) {
  const { w, h } = scene;
  scene.add(
    `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="10" fill="${C.bg}" stroke="${C.line}"/>` +
      `<g style="${scene.appear(t, 0.35, 'none')}"><line x1="1" y1="26.5" x2="${w - 1}" y2="26.5" stroke="${C.faint}"/>` +
      `<text x="14" y="17.5" font-family='${FONT_MONO}' font-size="10.5" fill="${C.muted}">${esc(file)}</text></g>`,
  );
}

// Position of a linear cursor path at time t.
export function pathAt(path, t) {
  if (t <= path[0][0]) return [path[0][1], path[0][2]];
  for (let i = 1; i < path.length; i++) {
    const [t1, x1, y1] = path[i];
    const [t0, x0, y0] = path[i - 1];
    if (t <= t1) {
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
  }
  const last = path[path.length - 1];
  return [last[1], last[2]];
}

// A boustrophedon sweep over a rectangle: back and forth, stepping down.
export function sweep({ x, y, w, h, t1, t2, passes }) {
  const pts = [];
  const step = h / Math.max(1, passes - 1);
  const dt = (t2 - t1) / passes;
  for (let i = 0; i < passes; i++) {
    const yy = y + i * step;
    const [a, b] = i % 2 ? [x + w, x] : [x, x + w];
    pts.push([t1 + i * dt, a, yy], [t1 + (i + 1) * dt - 0.02, b, yy]);
  }
  return pts;
}

// When a brush passing along the given paths first covers each cell: the
// first time any path comes within `radius` of the cell centre (or the
// closest approach if none does).
export function brushTimes(cells, paths, radius, dt = 0.012) {
  const samples = [];
  for (const p of paths) {
    for (let t = p[0][0]; t <= p[p.length - 1][0]; t += dt) samples.push([t, ...pathAt(p, t)]);
  }
  samples.sort((a, b) => a[0] - b[0]);
  for (const c of cells) {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    let best = Infinity;
    let bestT = samples[0]?.[0] ?? 0;
    c.t = null;
    for (const [t, x, y] of samples) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius) {
        c.t = t;
        break;
      }
      if (d < best) {
        best = d;
        bestT = t;
      }
    }
    if (c.t === null) c.t = bestT;
  }
  return cells;
}

export function wrap(text, max) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const word of words) {
    if (cur && (cur + ' ' + word).length > max) {
      lines.push(cur);
      cur = word;
    } else cur = cur ? cur + ' ' + word : word;
  }
  if (cur) lines.push(cur);
  return lines;
}
