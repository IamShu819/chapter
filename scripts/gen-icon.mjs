import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join } from 'path';

const densities = {
  'mdpi':    { size: 48,  fg: 108 },
  'hdpi':    { size: 72,  fg: 162 },
  'xhdpi':   { size: 96,  fg: 216 },
  'xxhdpi':  { size: 144, fg: 324 },
  'xxxhdpi': { size: 192, fg: 432 },
};

const accent = '#2D6A4F';
const base = 'C:/Users/wy/chapter/android/app/src/main/res';

async function generate() {
  for (const [density, { size, fg }] of Object.entries(densities)) {
    const half = size / 2;
    const radius = size * 0.29; // ~10px on 34px, matching CSS border-radius: 10px
    // Legacy icon: green bg + white 章
    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${radius}" fill="${accent}"/>
      <text x="${half}" y="${half}" text-anchor="middle" dominant-baseline="central"
        font-family="serif" font-size="${size * 0.53}" font-weight="700" fill="white">章</text>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(join(base, `mipmap-${density}`, 'ic_launcher.png'), png);
    writeFileSync(join(base, `mipmap-${density}`, 'ic_launcher_round.png'), png);

    // Foreground for adaptive icon (larger canvas, same character centered)
    const fgHalf = fg / 2;
    const svgFg = `<svg width="${fg}" height="${fg}" xmlns="http://www.w3.org/2000/svg">
      <text x="${fgHalf}" y="${fgHalf}" text-anchor="middle" dominant-baseline="central"
        font-family="serif" font-size="${fg * 0.53}" font-weight="700" fill="white">章</text>
    </svg>`;
    const pngFg = await sharp(Buffer.from(svgFg)).png().toBuffer();
    writeFileSync(join(base, `mipmap-${density}`, 'ic_launcher_foreground.png'), pngFg);

    console.log(`Generated ${density}: ${size}x${size} legacy, ${fg}x${fg} foreground`);
  }

  // Update background color
  const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${accent}</color>
</resources>`;
  writeFileSync(join(base, 'values', 'ic_launcher_background.xml'), bgXml);
  console.log('Updated background color to', accent);
}

generate().catch(console.error);
