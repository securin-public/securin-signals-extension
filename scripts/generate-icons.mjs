// Renders the Securin Signals toolbar icon (signal mark on an ink tile) to PNG
// at each manifest size, with 4x4 supersampling. No image dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const INK = [16, 34, 61];
const SIGNAL = [46, 196, 182];

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Shape in a 24-unit space, matching src/shared/BrandMark.tsx.
function sample(x, y) {
  // Rounded tile (r=5.5)
  const r = 5.5,
    cx = Math.min(Math.max(x, r), 24 - r),
    cy = Math.min(Math.max(y, r), 24 - r);
  if (Math.hypot(x - cx, y - cy) > r) return null;
  const ox = 7.5,
    oy = 16.5;
  const d = Math.hypot(x - ox, y - oy);
  const inQuadrant = x >= ox - 0.6 && y <= oy + 0.6;
  if (d <= 2.6) return SIGNAL;
  if (inQuadrant && Math.abs(d - 6.4) <= 1.25) return SIGNAL;
  if (inQuadrant && Math.abs(d - 11.4) <= 1.25)
    return SIGNAL.map((c, i) => Math.round(c * 0.65 + INK[i] * 0.35));
  return INK;
}

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const ss = 4,
    buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = sample(
            ((px + (sx + 0.5) / ss) / size) * 24,
            ((py + (sy + 0.5) / ss) / size) * 24,
          );
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a++;
          }
        }
      const i = (py * size + px) * 4;
      if (a) {
        buf[i] = r / a;
        buf[i + 1] = g / a;
        buf[i + 2] = b / a;
        buf[i + 3] = (a / (ss * ss)) * 255;
      }
    }
  writeFileSync(`public/icons/icon-${size}.png`, png(size, buf));
}
console.log('icons written');
