const fs = require('fs');
const path = require('path');

// Generate resources/icon.png (1024) + resources/splash.png (2732)
// dari logo vektor public/icon.svg untuk @capacitor/assets.
//
// CATATAN safe-zone adaptive icon Android: konten penting harus muat dalam
// lingkaran tengah (~60% kanvas) agar tidak terpotong mask launcher.
// Karena itu icon.png memakai varian teks kompak di tengah, sedangkan
// icon.svg full-bleed tetap dipakai untuk web/PWA/header.
const ICON_SAFE_SVG = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#EA580C" />
  <text x="512" y="500" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="150" font-weight="800" letter-spacing="2" fill="#FFFFFF">Digital</text>
  <text x="512" y="650" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="140" font-weight="300" letter-spacing="10" fill="#FFFFFF">Note</text>
</svg>`;

async function main() {
  const sharp = require('sharp');
  const root = path.resolve(__dirname, '..');
  const resourcesDir = path.join(root, 'resources');
  if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir, { recursive: true });

  await sharp(Buffer.from(ICON_SAFE_SVG))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(resourcesDir, 'icon.png'));
  console.log(' - resources/icon.png (1024x1024, safe-zone)');

  const svgPath = path.join(root, 'public', 'icon.svg');
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
