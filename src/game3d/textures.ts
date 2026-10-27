import * as THREE from 'three';

/**
 * Creates a procedural crisp canvas texture for 3D signs, gates, and platforms.
 */
export function createTextTexture(
  badge: string,
  text: string,
  bgColor: string = '#1E293B',
  accentColor: string = '#3B82F6',
  width: number = 512,
  height: number = 256
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Border & Accent Header
  ctx.lineWidth = 12;
  ctx.strokeStyle = accentColor;
  ctx.strokeRect(6, 6, width - 12, height - 12);

  // Badge pill (e.g. "A", "B", "C")
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.roundRect(width / 2 - 45, 20, 90, 55, 14);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 36px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, width / 2, 48);

  // Main Option Text (wrapped if needed)
  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 32px Fredoka, sans-serif';

  // Simple auto-fit font size if text is long
  if (text.length > 25) {
    ctx.font = 'bold 24px Fredoka, sans-serif';
  }

  // Multi-line wrap
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(testLine).width > width - 40 && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const startY = height / 2 + 30 - ((lines.length - 1) * 36) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, startY + i * 36);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Creates checkerboard / grid texture for obby platforms
 */
export function createPlatformTexture(color1: string, color2: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color1;
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = color2;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillRect(64, 64, 64, 64);

  // Border bevel
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
