import * as THREE from 'three';
import type { ArenaId } from '../shared/types.ts';

export function createPitchTexture(arenaId: ArenaId, maxAnisotropy = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d')!;

  const w = canvas.width;
  const h = canvas.height;
  const stripes = 14;
  const stripeH = h / stripes;

  // Rocket League grass-textured pitch with alternating light & dark mowing stripes
  // Top half (y < h/2, -Z) = Orange half; Bottom half (y >= h/2, +Z) = Blue half
  for (let i = 0; i < stripes; i++) {
    const isLight = i % 2 === 0;
    const isOrangeHalf = i < stripes / 2;

    if (arenaId === 'cyber_arena') {
      ctx.fillStyle = isLight ? '#1C5B42' : '#154B36';
    } else if (arenaId === 'sunset_arena') {
      ctx.fillStyle = isLight ? '#2E7D38' : '#23662C';
    } else {
      ctx.fillStyle = isLight ? '#2B7837' : '#21612B';
    }
    ctx.fillRect(0, i * stripeH, w, stripeH);

    // Subtle team-half tint across mowing stripes (Orange on top half, Blue on bottom half)
    ctx.fillStyle = isOrangeHalf
      ? isLight
        ? 'rgba(249, 115, 22, 0.14)'
        : 'rgba(234, 88, 12, 0.08)'
      : isLight
        ? 'rgba(14, 165, 233, 0.14)'
        : 'rgba(2, 132, 199, 0.08)';
    ctx.fillRect(0, i * stripeH, w, stripeH);
  }

  // Natural grass blade & turf micro-texture
  for (let i = 0; i < 12000; i++) {
    const gx = Math.random() * w;
    const gy = Math.random() * h;
    ctx.fillStyle =
      Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 20, 5, 0.075)';
    ctx.fillRect(gx, gy, 2, 3);
  }

  // Stronger team zone tint near the two goal boxes
  const orangeGrad = ctx.createLinearGradient(0, 0, 0, h * 0.25);
  orangeGrad.addColorStop(0, 'rgba(249, 115, 22, 0.28)');
  orangeGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
  ctx.fillStyle = orangeGrad;
  ctx.fillRect(0, 0, w, h * 0.25);

  const blueGrad = ctx.createLinearGradient(0, h, 0, h * 0.75);
  blueGrad.addColorStop(0, 'rgba(14, 165, 233, 0.28)');
  blueGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');
  ctx.fillStyle = blueGrad;
  ctx.fillRect(0, h * 0.75, w, h * 0.25);

  // Crisp white stadium pitch markings
  const lineColor = 'rgba(255, 255, 255, 0.9)';
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 7;

  // Outer perimeter line
  ctx.strokeRect(28, 28, w - 56, h - 56);

  // Midfield line
  ctx.beginPath();
  ctx.moveTo(28, h * 0.5);
  ctx.lineTo(w - 28, h * 0.5);
  ctx.stroke();

  // Center circle & inner kickoff ring
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.5, 135, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.5, 18, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();

  // Outer penalty boxes & inner goal boxes (Orange top, Blue bottom)
  ctx.strokeRect(w * 0.5 - 230, 28, 460, 220);
  ctx.strokeRect(w * 0.5 - 125, 28, 250, 96);

  ctx.strokeRect(w * 0.5 - 230, h - 248, 460, 220);
  ctx.strokeRect(w * 0.5 - 125, h - 124, 250, 96);

  // Goal area arcs
  ctx.beginPath();
  ctx.arc(w * 0.5, 248, 92, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w * 0.5, h - 248, 92, Math.PI, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createHexMeshTexture(
  lineColor = 'rgba(56, 189, 248, 0.58)',
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(14, 116, 144, 0.08)';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.4;

  const r = 32;
  const dx = r * 1.5;
  const dy = r * Math.sqrt(3);

  for (let row = -1; row <= 6; row++) {
    for (let col = -1; col <= 7; col++) {
      const cx = col * dx;
      const cy = row * dy + (col % 2 === 0 ? 0 : dy * 0.5);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createGoalNetTexture(
  strokeColor = 'rgba(186, 230, 253, 0.72)',
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.2;

  const step = 16;
  for (let i = -128; i <= 256; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i, 128);
    ctx.lineTo(i + 128, 0);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createSkylineTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090E1A';
  ctx.fillRect(0, 0, 256, 512);

  for (let y = 16; y < 496; y += 22) {
    for (let x = 14; x < 242; x += 24) {
      const lit = Math.random();
      if (lit < 0.42) {
        ctx.fillStyle =
          lit < 0.16 ? '#38BDF8' : lit < 0.32 ? '#FDE68A' : '#FB923C';
        ctx.fillRect(x, y, 12, 10);
      } else {
        ctx.fillStyle = '#131C2E';
        ctx.fillRect(x, y, 12, 10);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createBallTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Metallic silver/charcoal Rocket League match ball
  ctx.fillStyle = '#2B3548';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cols = 8;
  const rows = 4;
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * cw;
      const cy = (r + 0.5) * ch;
      const isPentagonStyle = (r + c) % 2 === 0;
      const sides = isPentagonStyle ? 5 : 6;
      const rad = Math.min(cw, ch) * 0.43;

      ctx.beginPath();
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2 - Math.PI * 0.5;
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fillStyle = isPentagonStyle ? '#161E2B' : '#C8D3E0';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = isPentagonStyle ? '#38BDF8' : '#475569';
      ctx.stroke();

      // Inner accent core on dark pentagons so ball spin reads crisply
      if (isPentagonStyle) {
        ctx.beginPath();
        ctx.arc(cx, cy, rad * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#F59E0B';
        ctx.fill();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
