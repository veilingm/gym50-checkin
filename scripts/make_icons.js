const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [200, 16, 46];
const FG = [255, 255, 255];

function make(S, scale, file) {
  const px = new Uint8Array(S * S * 4);
  const cx = 0.5, cy = 0.5;
  const R = 0.300 * scale, T = 0.052 * scale;
  const stemW = 0.062 * scale, stemTop = 0.385 * scale;
  const hub = 0.034 * scale;
  const ux = -0.866, uy = -0.5;
  const L = 0.190 * scale, hw = 0.022 * scale;

  function inside(x, y) {
    const dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (Math.abs(d - R) <= T / 2) return true;
    if (Math.abs(dx) <= stemW / 2 && dy <= -(R - 0.012) && dy >= -stemTop) return true;
    let t = dx * ux + dy * uy;
    t = Math.max(0, Math.min(L, t));
    if (Math.hypot(dx - ux * t, dy - uy * t) <= hw) return true;
    if (d <= hub) return true;
    return false;
  }

  const SS = 3;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (inside((x + (sx + 0.5) / SS) / S, (y + (sy + 0.5) / SS) / S)) hit++;
        }
      }
      const a = hit / (SS * SS);
      const i = (y * S + x) * 4;
      px[i] = Math.round(BG[0] + (FG[0] - BG[0]) * a);
      px[i + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * a);
      px[i + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * a);
      px[i + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(outDir, file), encodePng(S, S, Buffer.from(px)));
  console.log(`${file} ${S}x${S}`);
}

make(192, 1.0, 'icon-192.png');
make(512, 1.0, 'icon-512.png');
make(512, 0.78, 'maskable-512.png');
make(180, 1.0, 'apple-touch-icon.png');
