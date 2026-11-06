#!/usr/bin/env node
// readme-swarm: render a profile README as a set of animated SVGs that a swarm
// of named cursors builds on load, then rewrite the README between markers.
//
//   node src/cli.mjs [--config swarm.config.json] [--offline]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as S from './sections.mjs';
import * as M from './markdown.mjs';
import { THEMES } from './scene.mjs';
import { recentCommits } from './github.mjs';
import { decode, encode, mosaic } from './png.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);

const configPath = path.resolve(opt('--config', 'swarm.config.json'));
const root = path.dirname(configPath);
const cfg = JSON.parse(await readFile(configPath, 'utf8'));
const outDir = path.join(root, cfg.out || 'assets/swarm');
await mkdir(outDir, { recursive: true });

const palette = Object.entries(cfg.cursors || { Claude: '#d97757' }).map(([name, color]) => ({ name, color }));
// every job gets the next name, so the cursors on screen at once are all different
let nextCursor = 0;
const pick = () => palette[nextCursor++ % palette.length];

// ---- data
let commits = cfg.timeline?.fallback || [];
if (cfg.timeline && !flag('--offline')) {
  try {
    const live = await recentCommits({ user: cfg.user, max: cfg.timeline.max || 7, repos: cfg.timeline.repos, exclude: cfg.timeline.exclude, days: cfg.timeline.days, perRepo: cfg.timeline.perRepo, token: process.env.GITHUB_TOKEN });
    if (live.length) commits = live;
  } catch (e) {
    console.warn(`commits: ${e.message}; using fallback`);
  }
}
const updated = new Date().toISOString().slice(0, 10);

// ---- sections: the whole swarm starts together and every block builds at
// once, each a beat after the one above it so the eye still reads downward
const files = [];
const emit = (name, res, extra = {}) => files.push({ name, svg: res.scene.render({ title: res.alt }), alt: res.alt, ...extra });
const beat = cfg.layout?.stagger ?? 0.12;
let slot = 0;
const start = () => 0.25 + beat * slot++;

if (cfg.portrait) {
  const ascii = await readFile(path.join(root, cfg.portrait.ascii), 'utf8');
  emit('portrait', S.portrait({ ...cfg.portrait, ascii }, Array.from({ length: 1 + (cfg.portrait.sweepers ?? 4) }, pick), 0.15), { role: 'portrait' });
}
if (cfg.profile) {
  const img = decode(await readFile(path.join(root, cfg.profile.avatar)));
  const size = cfg.profile.size || 168;
  const frames = [6, 12, 24, 48, 84].map((n) => `data:image/png;base64,${encode(mosaic(img, n, size)).toString('base64')}`);
  emit('profile', S.profileCard(cfg.profile, [pick(), pick()], start(), frames), { href: cfg.profile.href });
}
const md = cfg.layout?.style === 'markdown';
// markdown style: each column block is rendered once per theme with the same
// cursors, and the README picks one with <picture> to match the visitor
const themed = (name, make, extra = {}) => {
  const dark = make(THEMES.dark);
  const light = make(THEMES.light);
  files.push({ name, svg: dark.scene.render({ title: dark.alt }), light: light.scene.render({ title: light.alt }), alt: dark.alt, ...extra });
};
if (md) {
  if (cfg.about) {
    const c = pick(), t = start();
    themed('about', (th) => M.mdAbout(cfg.about, c, t, th));
  }
  if (cfg.projects) {
    const c = pick(), t = start();
    themed('building', (th) => M.mdHeading({ title: cfg.projects.title }, c, t, th, 'mh'));
    cfg.projects.items.forEach((item, i) => {
      const ci = pick(), ti = start();
      themed(`project-${i + 1}`, (th) => M.mdItem(item, ci, ti, th, `mi${i}`), { href: item.href });
    });
  }
  if (cfg.toolkit) {
    const c = pick(), t = start();
    themed('toolkit', (th) => M.mdToolkit(cfg.toolkit, c, t, th));
  }
} else {
  if (cfg.about) emit('about', S.about(cfg.about, pick(), start()));
  if (cfg.projects) {
    emit('building', S.heading({ title: cfg.projects.title }, pick(), start(), 'h'));
    cfg.projects.items.forEach((item, i) => emit(`project-${i + 1}`, S.project(item, pick(), start(), `r${i}`), { href: item.href }));
  }
  if (cfg.toolkit) {
    const wide = cfg.toolkit.wide !== false;
    emit('toolkit', S.toolkit(cfg.toolkit, pick(), start(), wide ? 940 : 380), wide ? { role: 'wide' } : {});
  }
}
if (cfg.timeline && commits.length) {
  const cur = [pick(), pick()].map((c) => ({ ...c, path: [] }));
  emit('timeline', S.timeline(cfg.timeline, commits, cur, start(), updated), { role: 'timeline', href: cfg.timeline.href });
}

// ---- write SVGs
for (const f of files) {
  f.hash = createHash('sha1').update(f.svg + (f.light || '')).digest('hex').slice(0, 8);
  if (f.light) {
    await writeFile(path.join(outDir, `${f.name}-dark.svg`), f.svg);
    await writeFile(path.join(outDir, `${f.name}-light.svg`), f.light);
  } else await writeFile(path.join(outDir, `${f.name}.svg`), f.svg);
}

// ---- README
if (cfg.readme) {
  const readmePath = path.join(root, cfg.readme);
  const rel = path.relative(path.dirname(readmePath), outDir).split(path.sep).join('/');
  const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const src = (f, v) => `./${rel}/${f.name}${v ? '-' + v : ''}.svg?v=${f.hash}`;
  const img = (f, width, more = '') =>
    f.light
      ? `<picture><source media="(prefers-color-scheme: dark)" srcset="${src(f, 'dark')}" /><source media="(prefers-color-scheme: light)" srcset="${src(f, 'light')}" /><img src="${src(f, 'light')}" alt="${attr(f.alt)}" width="${width}"${more} /></picture>`
      : `<img src="${src(f)}" alt="${attr(f.alt)}" width="${width}"${more} />`;
  // GitHub wraps any image without its own link in a link to the raw file,
  // so a click on the portrait would open portrait.svg. An inert link stops
  // that: clicking does nothing.
  const inert = cfg.layout?.inertHref ?? '#swarm';
  const link = (f, html) => (f.href || inert ? `<a href="${attr(f.href || inert)}">${html}</a>` : html);
  // The portrait and the column go on one source line: a newline between
  // inline images adds a full line of spacing on GitHub, enough to push the
  // column below the portrait. Each column block starts with <br> so that
  // where floats are ignored (the GitHub mobile app) the blocks stack in
  // order under the portrait instead of pairing up side by side.
  // layout.table puts the portrait and the column in a two-cell table: the
  // only layout that stays side by side in the GitHub mobile app, which
  // ignores align="left". GitHub draws a thin border around the cells.
  const table = !!cfg.layout?.table;
  const lines = [];
  let row = '';
  let left = '';
  const col = [];
  const flush = () => {
    if (table && (left || col.length)) {
      const pw = cfg.layout?.portraitWidth || '55%';
      lines.push(`<table>
<tr>
<td width="${pw}" valign="top">${left}</td>
<td valign="top">${col.join('<br>')}</td>
</tr>
</table>`, '');
      left = '';
      col.length = 0;
    } else if (row) lines.push(row), (row = '');
  };
  for (const f of files) {
    if (f.role === 'portrait') {
      if (table) left = link(f, img(f, '100%'));
      else row += link(f, img(f, cfg.layout?.portraitWidth || '52%', ' align="left"'));
    } else if (f.role === 'wide' || f.role === 'timeline') {
      flush();
      if (!table && !lines.includes('<br clear="left" />')) lines.push('', '<br clear="left" />', '');
      lines.push(`<p align="center">${link(f, img(f, '100%'))}</p>`);
    } else if (table) col.push(link(f, img(f, '100%')));
    else row += '<br>' + link(f, img(f, cfg.layout?.columnWidth || '42%'));
  }
  flush();
  if (!table && !lines.includes('<br clear="left" />')) lines.push('', '<br clear="left" />');
  const block = `<!-- SWARM:START (generated by readme-swarm, edit swarm.config.json instead) -->\n${lines.join('\n')}\n<!-- SWARM:END -->`;
  const md = await readFile(readmePath, 'utf8');
  const re = /<!-- SWARM:START[\s\S]*?<!-- SWARM:END -->/;
  if (!re.test(md)) throw new Error(`${cfg.readme} has no <!-- SWARM:START --> ... <!-- SWARM:END --> markers`);
  await writeFile(readmePath, md.replace(re, block));
}

console.log(`readme-swarm: ${files.length} SVGs -> ${path.relative(process.cwd(), outDir) || '.'} (${commits.length} commits)`);
