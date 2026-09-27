const fs = require('fs');
const path = require('path');

// Rasterisasi public/icon.svg (logo vektor DigiNote) menjadi PNG PWA.
// Membutuhkan devDependency "sharp" (npm install terlebih dahulu).
async function main() {
  const sharp = require('sharp');
  const publicDir = path.resolve(__dirname, '../public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const svgPath = path.join(publicDir, 'icon.svg');
  if (!fs.existsSync(svgPath)) {
    throw new Error('public/icon.svg tidak ditemukan');
  }

  const targets = [
    ['pwa-192x192.png', 192],
    ['pwa-512x512.png', 512],
    ['pwa-maskable-512x512.png', 512],
    ['apple-touch-icon.png', 180],
    ['favicon.ico', 64],
  ];

  for (const [name, size] of targets) {
    // Background putih agar maskable & apple-touch-icon tidak berpixel transparan/hitam
    const png = await sharp(svgPath)
      .flatten({ background: '#FFFFFF' })
      .resize(size, size, { fit: 'cover' })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(publicDir, name), png);
    console.log(` - ${name} (${size}x${size})`);
  }

  console.log('DigiNote PWA icons generated successfully in public/');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
