const fs = require('fs');
const path = require('path');

// Generate resources/icon.png (1024) + resources/splash.png (2732)
// dari logo vektor public/icon.svg (SATU-SATUNYA sumber logo) untuk @capacitor/assets.
//
// CATATAN safe-zone adaptive icon Android: konten penting harus muat dalam
// lingkaran tengah agar tidak terpotong mask launcher. Karena itu foreground
// memakai isi icon.svg yang diperkecil (0.66x) dan dipusatkan di atas
// background orange penuh (tanpa outer putih/transparan).
async function main() {
  const sharp = require('sharp');
  const root = path.resolve(__dirname, '..');
  const resourcesDir = path.join(root, 'resources');
  if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir, { recursive: true });

  const svgPath = path.join(root, 'public', 'icon.svg');
  if (!fs.existsSync(svgPath)) throw new Error('public/icon.svg tidak ditemukan');
  const iconSvg = fs.readFileSync(svgPath, 'utf8');
  const inner = iconSvg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');

  // Foreground 1024: background orange penuh + artwork icon.svg di tengah 66%.
  const foregroundSvg =
    `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="1024" height="1024" fill="#EA580C" />` +
    `<g transform="translate(512,512) scale(1.6) translate(-256,-256)">${inner}</g>` +
    `</svg>`;

  await sharp(Buffer.from(foregroundSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(resourcesDir, 'icon.png'));
  console.log(' - resources/icon.png (1024x1024, safe-zone)');

  const logo = await sharp(svgPath).resize(1200, 1200).png().toBuffer();
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#EA580C' } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(resourcesDir, 'splash.png'));
  console.log(' - resources/splash.png (2732x2732)');

  console.log('Capacitor resources generated successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
