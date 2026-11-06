// Just enough PNG to build the pixel-reveal frames with no dependencies:
// decode 8-bit RGB/RGBA (non-interlaced), box-downsample to an N x N grid,
// upscale with nearest neighbour, and encode back to PNG.

import { inflateSync, deflateSync } from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

export function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let w, h, type, depth, interlace;
  const idat = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    const kind = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    o += 12 + len;
  }
  if (depth !== 8 || interlace || (type !== 2 && type !== 6)) throw new Error('only 8-bit RGB/RGBA non-interlaced PNGs are supported');
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) line.copy(out, (y * w + x) * 3, x * bpp, x * bpp + 3);
    prev = line;
  }
  return { w, h, rgb: out };
}

export function encode({ w, h, rgb }) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const chunk = (kind, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(kind, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Average the image down to n x n cells, then draw it at size x size with
// hard edges: one frame of the pixel reveal.
export function mosaic(img, n, size) {
  const cells = new Float64Array(n * n * 3);
  const counts = new Uint32Array(n * n);
  for (let y = 0; y < img.h; y++) {
    const cy = Math.min(n - 1, Math.floor((y / img.h) * n));
    for (let x = 0; x < img.w; x++) {
      const cx = Math.min(n - 1, Math.floor((x / img.w) * n));
      const k = cy * n + cx;
      const p = (y * img.w + x) * 3;
      cells[k * 3] += img.rgb[p];
      cells[k * 3 + 1] += img.rgb[p + 1];
      cells[k * 3 + 2] += img.rgb[p + 2];
      counts[k]++;
    }
  }
  const rgb = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    const cy = Math.min(n - 1, Math.floor((y / size) * n));
    for (let x = 0; x < size; x++) {
      const k = cy * n + Math.min(n - 1, Math.floor((x / size) * n));
      const p = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) rgb[p + c] = Math.round(cells[k * 3 + c] / counts[k]);
    }
  }
  return { w: size, h: size, rgb };
}
