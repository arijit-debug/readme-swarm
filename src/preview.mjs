// Writes preview.html next to the README: the generated block inside a page
// styled like a GitHub profile README (830px column), so the animation can be
// checked before pushing. SVGs are inlined (same layout GitHub gives the
// <img> tags) so record.mjs can seek every animation to an exact time.
//
//   node src/preview.mjs [--config swarm.config.json] [--light]

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const configPath = path.resolve(args.includes('--config') ? args[args.indexOf('--config') + 1] : 'swarm.config.json');
const light = args.includes('--light');
const root = path.dirname(configPath);
const cfg = JSON.parse(await readFile(configPath, 'utf8'));
const readmePath = path.join(root, cfg.readme);
const md = await readFile(readmePath, 'utf8');
const RE = /<!-- SWARM:START[\s\S]*?<!-- SWARM:END -->/;
let block = md.match(RE)?.[0] ?? '';
const rest = md.replace(RE, '');

// <picture> (light/dark pair) -> the plain <img> of the theme being previewed
block = block.replace(/<picture><source[^>]*srcset="([^"]+)"[^>]*\/><source[^>]*srcset="([^"]+)"[^>]*\/><img src="[^"]+"([^>]*)\/><\/picture>/g, (_, dark, lightSrc, rest) => `<img src="${light ? lightSrc : dark}"${rest}/>`);

// <img src="./x.svg?v=.." width="44%" align="left" /> -> inline SVG wrapper
const imgs = [...block.matchAll(/<img src="\.\/([^"?]+)\?v=[^"]*"[^>]*?width="([^"]+)"([^>]*)\/>/g)];
for (const m of imgs) {
  const svg = (await readFile(path.join(path.dirname(readmePath), m[1]), 'utf8')).replace(/<svg([^>]*?) width="[\d.]+" height="[\d.]+"/, '<svg$1 width="100%" style="display:block;height:auto"');
  const left = /align="left"/.test(m[3]);
  const html = `<span class="im" style="width:${m[2]};${left ? 'float:left;margin-right:2%' : ''}">${svg}</span>`;
  block = block.replace(m[0], () => html);
}

const html = `<!doctype html><meta charset="utf-8"><title>readme-swarm preview</title>
<style>
body{margin:0;background:${light ? '#ffffff' : '#0d1117'};color:${light ? '#1f2328' : '#e6edf3'};font:16px/1.5 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
.box{width:830px;margin:20px auto;border:1px solid ${light ? '#d1d9e0' : '#3d444d'};border-radius:6px;padding:24px 32px;box-sizing:border-box}
.im{display:inline-block;vertical-align:middle;margin-bottom:4px}
.box p{margin:0 0 16px}
h3{margin:24px 0 16px;font-size:1.25em}
a{color:#4493f8}
</style>
<div class="box">${block}\n${rest.replace(/^\s+/, '')}</div>
<script>
// ?t=seconds pauses every animation at that moment (used by record.mjs)
const t = new URLSearchParams(location.search).get('t');
window.seek = (s) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = s * 1000; });
if (t !== null) seek(+t);
</script>`;
await writeFile(path.join(root, 'preview.html'), html);
console.log('preview.html written');
