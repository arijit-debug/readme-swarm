// Records preview.html frame by frame through the Chrome DevTools Protocol:
// every animation is paused and seeked to an exact time, so the frames are
// perfectly smooth no matter how slow the machine is. ffmpeg joins them.
//
//   node src/record.mjs --page preview.html --out build.mp4 [--seconds 14] [--fps 30]
//   node src/record.mjs --page preview.html --frame 6.5 --out frame.png
//
// Needs Chrome (CHROME env var to override the path) and ffmpeg for video.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const page = path.resolve(opt('--page', 'preview.html'));
const out = path.resolve(opt('--out', 'build.mp4'));
const seconds = +opt('--seconds', 14);
const fps = +opt('--fps', 30);
const frame = opt('--frame', null);
const width = +opt('--width', 900);
const height = +opt('--height', 1000);
const scale = +opt('--scale', 2);

const chromePath =
  process.env.CHROME ||
  {
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  }[process.platform] ||
  'google-chrome';

const profile = await mkdtemp(path.join(tmpdir(), 'swarm-chrome-'));
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });

const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/ws:\/\/[^\s]+/);
    if (m) resolve(m[0]);
  });
  chrome.on('exit', () => reject(new Error('chrome exited early')));
});

const browser = new WebSocket(wsUrl);
await new Promise((r) => browser.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
browser.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    browser.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Page.enable');
await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
await s('Page.navigate', { url: pathToFileURL(page).href + '?t=0' });
await new Promise((r) => setTimeout(r, 1500));

const shot = async (t, file) => {
  await s('Runtime.evaluate', { expression: `seek(${t})` });
  const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(file, Buffer.from(data, 'base64'));
};

try {
  if (frame !== null) {
    await shot(+frame, out);
    console.log(`frame ${frame}s -> ${out}`);
  } else {
    const dir = await mkdtemp(path.join(tmpdir(), 'swarm-frames-'));
    const total = Math.round(seconds * fps);
    for (let i = 0; i < total; i++) await shot(i / fps, path.join(dir, `f${String(i).padStart(5, '0')}.png`));
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%05d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', out], { stdio: 'inherit' });
    await rm(dir, { recursive: true, force: true });
    if (ff.status !== 0) throw new Error('ffmpeg failed');
    console.log(`${total} frames -> ${out}`);
  }
} finally {
  browser.close();
  chrome.kill();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
