const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// DigiNote emblem: orange (#EA580C) ring + phone + growth arrow + Rp coin + pen
// on white background, matching the brand logo. Pure node.js PNG writer.
const ORANGE = [234, 88, 12, 255];
const WHITE = [255, 255, 255, 255];

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function createDigiNotePNG(width, height) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);
    const crc = crc32(Buffer.concat([Buffer.from(type), data]));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  const CX = 0.5;
  const CY = 0.488;

  function putPixel(r, g, b, a) {
    rawData[offset++] = r;
    rawData[offset++] = g;
    rawData[offset++] = b;
    rawData[offset++] = a;
  }

  function inRect(nx, ny, x0, x1, y0, y1) {
    return nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1;
  }

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0
    const ny = y / height;

    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const dCenter = Math.hypot(nx - CX, ny - CY);

      // 1. Outer ring band
      if (dCenter >= 0.299 && dCenter <= 0.357) {
        putPixel(...ORANGE);
        continue;
      }

      // 2. Smartphone frame (outline)
      const inPhoneOuter = inRect(nx, ny, 0.53, 0.7, 0.29, 0.63);
      const inPhoneInner = inRect(nx, ny, 0.561, 0.669, 0.321, 0.599);
      const inNotch = inRect(nx, ny, 0.576, 0.654, 0.3, 0.322);
      const inHomeBar = inRect(nx, ny, 0.586, 0.645, 0.585, 0.6);
      if ((inPhoneOuter && !inPhoneInner) || inNotch || inHomeBar) {
        putPixel(...ORANGE);
        continue;
      }

      // 3. Growth arrow (polyline + head)
      const onArrow =
        distToSegment(nx, ny, 0.439, 0.557, 0.512, 0.469) < 0.0195 ||
        distToSegment(nx, ny, 0.512, 0.469, 0.557, 0.512) < 0.0195 ||
        distToSegment(nx, ny, 0.557, 0.512, 0.654, 0.381) < 0.0195 ||
        distToSegment(nx, ny, 0.654, 0.381, 0.602, 0.387) < 0.016 ||
        distToSegment(nx, ny, 0.654, 0.381, 0.648, 0.438) < 0.016;
      if (onArrow) {
        putPixel(...ORANGE);
        continue;
      }

      // 4. Rp coin (disc + white ring)
      const dCoin = Math.hypot(nx - 0.342, ny - 0.635);
      if (dCoin <= 0.078) {
        if (dCoin >= 0.043 && dCoin <= 0.0625) {
          putPixel(...WHITE);
        } else {
          putPixel(...ORANGE);
        }
        continue;
      }

      // 5. Pen (bar + tip)
      const inPenBar = inRect(nx, ny, 0.707, 0.758, 0.352, 0.566);
      const inPenTip =
        ny >= 0.566 && ny <= 0.645 && Math.abs(nx - 0.7325) <= (0.645 - ny) * 0.33;
      if (inPenBar || inPenTip) {
        putPixel(...ORANGE);
        continue;
      }

      // 6. Banknote (tilted outline + center dot)
      const cosA = Math.cos(0.279);
      const sinA = Math.sin(0.279);
      const bx = (nx - 0.352) * cosA - (ny - 0.467) * sinA;
      const by = (nx - 0.352) * sinA + (ny - 0.467) * cosA;
      const inBillOuter = Math.abs(bx) < 0.078 && Math.abs(by) < 0.047;
      const inBillInner = Math.abs(bx) < 0.054 && Math.abs(by) < 0.023;
      if (inBillOuter && !inBillInner) {
        putPixel(...ORANGE);
        continue;
      }
      if (Math.hypot(nx - 0.352, ny - 0.467) < 0.016) {
        putPixel(...ORANGE);
        continue;
      }

      // Background: white (opaque, safe for maskable + apple-touch)
      putPixel(...WHITE);
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (c >>> 8) ^ table[(c ^ buf[n]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  table[n] = c;
}

const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate PWA icons with DigiNote branding
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createDigiNotePNG(192, 192));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createDigiNotePNG(512, 512));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createDigiNotePNG(512, 512));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createDigiNotePNG(180, 180));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createDigiNotePNG(64, 64));

console.log('DigiNote PWA icons generated successfully in public/');
