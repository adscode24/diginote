const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create a valid PNG in pure node.js with exact Notaku orange logo
function createNotakuPNG(width, height) {
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

  const cornerRadius = width * 0.23;
  const cx = width / 2;
  const cy = height / 2;

  // Coordinate mapper
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0
    const ny = y / height; // 0 to 1

    for (let x = 0; x < width; x++) {
      const nx = x / width; // 0 to 1

      // Rounded rectangle test (squircle)
      let inSquircle = false;
      const qx = Math.max(0, Math.abs(x - cx) - (width / 2 - cornerRadius));
      const qy = Math.max(0, Math.abs(y - cy) - (height / 2 - cornerRadius));
      if (qx * qx + qy * qy <= cornerRadius * cornerRadius) {
        inSquircle = true;
      }

      if (!inSquircle) {
        // Transparent
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        continue;
      }

      // Check if pixel is inside the Phone (top right of n)
      // Phone is around nx: 0.52 to 0.68, ny: 0.20 to 0.44
      const inPhoneFrame = (nx >= 0.52 && nx <= 0.68 && ny >= 0.20 && ny <= 0.44);
      const inPhoneScreen = (nx >= 0.54 && nx <= 0.66 && ny >= 0.24 && ny <= 0.42);

      // Check if pixel is inside the Banknote (top left of n)
      // Banknote tilted around nx: 0.30 to 0.52, ny: 0.22 to 0.42
      // Approximate rotated box
      const bx = (nx - 0.40) * Math.cos(0.28) - (ny - 0.32) * Math.sin(0.28);
      const by = (nx - 0.40) * Math.sin(0.28) + (ny - 0.32) * Math.cos(0.28);
      const inBill = (Math.abs(bx) < 0.13 && Math.abs(by) < 0.08);
      const inBillInner = (Math.abs(bx) < 0.10 && Math.abs(by) < 0.06);

      // Check if pixel is inside the white letter "n"
      // Left leg: nx ~ 0.37 to 0.45, ny ~ 0.40 to 0.72
      // Right leg: nx ~ 0.57 to 0.65, ny ~ 0.43 to 0.72
      // Arch: connecting at top ny ~ 0.35 to 0.48, nx between 0.37 and 0.65
      const inLeftLeg = (nx >= 0.37 && nx <= 0.45 && ny >= 0.38 && ny <= 0.72);
      const inRightLeg = (nx >= 0.57 && nx <= 0.65 && ny >= 0.42 && ny <= 0.72);
      
      // Arch curve calculation
      const archCenterDist = Math.sqrt(Math.pow((nx - 0.51) / 0.14, 2) + Math.pow((ny - 0.45) / 0.11, 2));
      const inArch = (archCenterDist >= 0.65 && archCenterDist <= 1.35 && ny <= 0.45 && ny >= 0.32);

      // Rounded bottom caps for legs
      const inLeftCap = Math.hypot(nx - 0.41, ny - 0.71) < 0.045;
      const inRightCap = Math.hypot(nx - 0.61, ny - 0.71) < 0.045;

      const inLetterN = inLeftLeg || inRightLeg || inArch || inLeftCap || inRightCap;

      if (inLetterN) {
        // Pure crisp white letter 'n'
        rawData[offset++] = 255;
        rawData[offset++] = 255;
        rawData[offset++] = 255;
        rawData[offset++] = 255;
      } else if (inPhoneScreen) {
        // Light blue-gray screen
        rawData[offset++] = 220;
        rawData[offset++] = 230;
        rawData[offset++] = 242;
        rawData[offset++] = 255;
      } else if (inPhoneFrame) {
        // White phone frame
        rawData[offset++] = 255;
        rawData[offset++] = 255;
        rawData[offset++] = 255;
        rawData[offset++] = 255;
      } else if (inBillInner) {
        // Light peach / orange banknote interior
        rawData[offset++] = 255;
        rawData[offset++] = 230;
        rawData[offset++] = 205;
        rawData[offset++] = 255;
      } else if (inBill) {
        // White bill border
        rawData[offset++] = 255;
        rawData[offset++] = 255;
        rawData[offset++] = 255;
        rawData[offset++] = 255;
      } else {
        // Rich vibrant warm orange gradient
        // From #FFA000 at top to #FF5200 at bottom
        const t = ny;
        const r = 255;
        const g = Math.round(160 * (1 - t) + 82 * t);
        const b = 0;
        rawData[offset++] = r;
        rawData[offset++] = g;
        rawData[offset++] = b;
        rawData[offset++] = 255;
      }
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

// Generate PWA icons with Notaku branding
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createNotakuPNG(192, 192));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createNotakuPNG(512, 512));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createNotakuPNG(512, 512));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createNotakuPNG(180, 180));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createNotakuPNG(64, 64));

console.log('Notaku PWA icons generated successfully in public/');
