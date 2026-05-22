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

    // Gradient background
    const x1 = W / 2 - Math.cos(angle) * W;
    const y1 = H / 2 - Math.sin(angle) * H;
    const x2 = W / 2 + Math.cos(angle) * W;
    const y2 = H / 2 + Math.sin(angle) * H;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle pattern overlay
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 6; i++) {
      const cx = (hash * (i + 1) * 37) % W;
      const cy = (hash * (i + 1) * 53) % H;
      const r = 40 + (hash * (i + 1)) % 80;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Border frame
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    const margin = 16;
    ctx.strokeRect(margin, margin, W - margin * 2, H - margin * 2);

    // Title text
    const cleanTitle = title.replace(/\.[^.]+$/, '').trim();
    const lines = breakText(ctx, cleanTitle, W - 60, 'bold 32px serif');

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lineHeight = 42;
    const totalTextH = lines.length * lineHeight;
    const startY = H / 2 - totalTextH / 2 + (author ? -16 : 0);

    // Text shadow
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;

    lines.forEach((line, i) => {
      ctx.font = lines.length > 2 ? 'bold 28px serif' : 'bold 34px serif';
      ctx.fillText(line, W / 2, startY + i * lineHeight);
    });

    // Author
    ctx.shadowBlur = 0;
    if (author && author !== '未知') {
      ctx.font = '16px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(author, W / 2, startY + lines.length * lineHeight + 16);
    }

    // Bottom decoration line
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 30, H - 50);
    ctx.lineTo(W / 2 + 30, H - 50);
    ctx.stroke();

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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
