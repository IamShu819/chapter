const PALETTES: [string, string][] = [
  ['#2D6A4F', '#40916C'],
  ['#264653', '#2A9D8F'],
  ['#6B2737', '#D4A373'],
  ['#1D3557', '#457B9D'],
  ['#5F0F40', '#9A031E'],
  ['#3A0CA3', '#7209B7'],
  ['#006D77', '#83C5BE'],
  ['#BC6C25', '#DDA15E'],
  ['#1B4332', '#52B788'],
  ['#4A1942', '#C850C0'],
  ['#0F3460', '#16213E'],
  ['#61304B', '#E78F8E'],
];

function hashTitle(title: string): number {
  let hash = 0;
  for (const char of title) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

export function generateCoverGradient(title: string): string {
  const hash = hashTitle(title);
  const idx = hash % PALETTES.length;
  const [c1, c2] = PALETTES[idx];
  const angle = (hash % 8) * 45;
  return `linear-gradient(${angle}deg, ${c1}, ${c2})`;
}

/**
 * Generate a cover image as a Blob using Canvas
 * Returns a PNG Blob that can be used as coverBlob
 */
export function generateCoverImage(title: string, author?: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const W = 300;
    const H = 420;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('Canvas 2D context not available')); return; }

    const hash = hashTitle(title);
    const [c1, c2] = PALETTES[hash % PALETTES.length];
    const angle = ((hash % 8) * 45) * Math.PI / 180;

    // Gradient background — 3-stop for richer depth
    const x1 = W / 2 - Math.cos(angle) * W;
    const y1 = H / 2 - Math.sin(angle) * H;
    const x2 = W / 2 + Math.cos(angle) * W;
    const y2 = H / 2 + Math.sin(angle) * H;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, c1);
    grad.addColorStop(0.5, lerpColor(c1, c2, 0.4));
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Paper grain texture — subtle noise
    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 12;
      d[i] = Math.min(255, Math.max(0, d[i] + noise));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // Subtle fabric-like crosshatch texture
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.5;
    for (let i = -H; i < W + H; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + H, 0);
      ctx.lineTo(i, H);
      ctx.stroke();
    }
    ctx.restore();

    // Book spine effect — left edge shadow
    const spineW = 14;
    const spineGrad = ctx.createLinearGradient(0, 0, spineW, 0);
    spineGrad.addColorStop(0, 'rgba(0,0,0,0.3)');
    spineGrad.addColorStop(0.5, 'rgba(0,0,0,0.08)');
    spineGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spineGrad;
    ctx.fillRect(0, 0, spineW, H);

    // Vignette — radial darkening at corners
    const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.85);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, W, H);

    // Inner border — single subtle line
    const m = 22;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);

    // Title text
    const cleanTitle = title.replace(/\.[^.]+$/, '').trim();
    const maxTextW = W - 70;
    const lines = breakText(ctx, cleanTitle, maxTextW, 'bold 32px serif');

    const titleSize = lines.length > 2 ? 28 : 34;
    const lineHeight = titleSize + 10;
    const totalTextH = lines.length * lineHeight;
    const hasAuthor = author && author !== '未知';
    const startY = H / 2 - totalTextH / 2 + (hasAuthor ? -20 : 0);

    // Text shadow
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    lines.forEach((line, i) => {
      ctx.font = `bold ${titleSize}px serif`;
      ctx.fillText(line, W / 2, startY + i * lineHeight);
    });

    // Author
    ctx.shadowBlur = 0;
    if (hasAuthor) {
      ctx.font = '15px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(author!, W / 2, startY + lines.length * lineHeight + 18);
    }

    // Bottom decorative element — small diamond
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    const dy = H - 48;
    ctx.save();
    ctx.translate(W / 2, dy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to generate cover image blob'));
    }, 'image/png');
  });
}

/**
 * Break long text into lines that fit within maxWidth
 */
function breakText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string[] {
  ctx.font = font;
  const lines: string[] = [];

  if (text.length <= 6) {
    lines.push(text);
    return lines;
  }

  let current = '';
  for (const char of text) {
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  // Limit to 4 lines
  if (lines.length > 4) {
    lines.length = 4;
    lines[3] = lines[3].slice(0, -1) + '…';
  }

  return lines;
}

function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${((rr << 16) | (rg << 8) | rb).toString(16).padStart(6, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
