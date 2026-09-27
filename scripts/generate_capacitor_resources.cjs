const fs = require('fs');
const path = require('path');

// Generate resources/icon.png (1024) + resources/splash.png (2732)
// dari logo vektor public/icon.svg untuk @capacitor/assets.
async function main() {
  const sharp = require('sharp');
  const root = path.resolve(__dirname, '..');
  const resourcesDir = path.join(root, 'resources');
  if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir, { recursive: true });

  const svgPath = path.join(root, 'public', 'icon.svg');
  if (!fs.existsSync(svgPath)) throw new Error('public/icon.svg tidak ditemukan');

  await sharp(svgPath).resize(1024, 1024, { fit: 'contain', background: '#EA580C' }).png().toFile(path.join(resourcesDir, 'icon.png'));
  console.log(' - resources/icon.png (1024x1024)');

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
