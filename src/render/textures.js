import { Texture, CanvasSource } from 'pixi.js';
import { PITCH } from '../config.js';

// ピッチテクスチャが覆うワールド範囲
export const GROUND = { x0: -64, x1: 64, y0: -44, y1: 44 };

function makeTexture(canvas, anisotropy = 8) {
  const source = new CanvasSource({
    resource: canvas,
    autoGenerateMipmaps: true,
    scaleMode: 'linear',
    mipmapFilter: 'linear',
    maxAnisotropy: anisotropy,
    addressMode: 'clamp-to-edge',
  });
  return new Texture({ source });
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 芝・刈り込みストライプ・ラインを焼き込んだ地面テクスチャ */
export function createPitchTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sx = W / (GROUND.x1 - GROUND.x0);
  const sy = H / (GROUND.y1 - GROUND.y0);
  const toM = () => g.setTransform(sx, 0, 0, sy, -GROUND.x0 * sx, -GROUND.y0 * sy);

  toM();
  // ベース
  g.fillStyle = '#2e7d32';
  g.fillRect(GROUND.x0, GROUND.y0, GROUND.x1 - GROUND.x0, GROUND.y1 - GROUND.y0);
  // 縦ストライプ（ゴールライン方向に 18 本）
  const stripeW = PITCH.length / 18;
  for (let i = -12; i < 12; i++) {
    const x = -PITCH.halfL + i * stripeW;
    g.fillStyle = i % 2 === 0 ? '#348a37' : '#2b742e';
    g.fillRect(x, GROUND.y0, stripeW, GROUND.y1 - GROUND.y0);
  }
  // 横方向にもごく薄いストライプ（格子刈り風）
  const crossW = PITCH.width / 8;
  for (let j = -6; j < 6; j++) {
    if (j % 2 === 0) continue;
    g.fillStyle = 'rgba(255,255,255,0.025)';
    g.fillRect(GROUND.x0, -PITCH.halfW + j * crossW, GROUND.x1 - GROUND.x0, crossW);
  }
  // ピッチ外周はやや暗く
  g.fillStyle = 'rgba(0,0,0,0.10)';
  g.fillRect(GROUND.x0, GROUND.y0, GROUND.x1 - GROUND.x0, -PITCH.halfW - 1.5 - GROUND.y0);
  g.fillRect(GROUND.x0, PITCH.halfW + 1.5, GROUND.x1 - GROUND.x0, GROUND.y1 - PITCH.halfW - 1.5);
  g.fillRect(GROUND.x0, -PITCH.halfW - 1.5, -PITCH.halfL - 2 - GROUND.x0, PITCH.width + 3);
  g.fillRect(PITCH.halfL + 2, -PITCH.halfW - 1.5, GROUND.x1 - PITCH.halfL - 2, PITCH.width + 3);

  // ノイズ（芝の質感）
  g.setTransform(1, 0, 0, 1, 0, 0);
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const r = rng(1234);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 18 + (r() < 0.04 ? -14 : 0);
    d[i] = Math.max(0, Math.min(255, d[i] + n * 0.5));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.4));
  }
  g.putImageData(img, 0, 0);

  // ゴール内の芝の擦れ（ラインはベクターで別描画）
  toM();
  g.fillStyle = 'rgba(120,100,60,0.18)';
  for (const side of [-1, 1]) g.fillRect(side < 0 ? -PITCH.halfL - 2 : PITCH.halfL, -PITCH.goalHalfW, 2, PITCH.goalHalfW * 2);
  g.fillStyle = 'rgba(110,95,60,0.10)';
  for (const side of [-1, 1]) g.fillRect(side < 0 ? -PITCH.halfL : PITCH.halfL - 6, -PITCH.goalHalfW - 1, 6, PITCH.goalHalfW * 2 + 2);
  return makeTexture(c, 16);
}

/** 観客席テクスチャ（段々の座席＋観客のドット） */
export function createCrowdTexture(seed = 7) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(seed);
  const rows = 22;
  const rowH = H / rows;
  const palette = ['#d62839', '#d62839', '#f2f2f2', '#f2f2f2', '#1b2a4a', '#2a2a2a', '#e8b04a', '#6b7a8f', '#a33', '#ddd'];
  for (let i = 0; i < rows; i++) {
    const y = i * rowH;
    g.fillStyle = i % 2 ? '#20262f' : '#262d37';
    g.fillRect(0, y, W, rowH);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y + rowH - 3, W, 3);
    for (let x = 0; x < W; x += 9 + r() * 4) {
      if (r() < 0.12) continue;
      const col = palette[(r() * palette.length) | 0];
      const px = x + r() * 3;
      const py = y + rowH * 0.25 + r() * rowH * 0.2;
      g.fillStyle = col;
      g.fillRect(px - 3, py + 5, 7, rowH * 0.45);
      g.fillStyle = r() < 0.5 ? '#e0b08a' : '#8a5a3c';
      g.beginPath(); g.arc(px + 0.5, py + 2, 3, 0, Math.PI * 2); g.fill();
    }
  }
  // 通路
  g.fillStyle = '#3a404a';
  for (let x = 120; x < W; x += 256) g.fillRect(x, 0, 10, H);
  return makeTexture(c, 4);
}

/** 広告ボード */
export function createBoardTexture() {
  const W = 2048, H = 64;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const ads = [
    ['#0d1b2a', '#ffffff', 'SOLOSAKA'],
    ['#d62839', '#ffffff', 'STEP 1'],
    ['#f2c14e', '#111111', 'SOLO FOOTBALL'],
    ['#1b998b', '#ffffff', 'PIXI × VITE'],
    ['#ffffff', '#d62839', 'SOLOSAKA'],
    ['#2d3142', '#f2c14e', '60 HZ'],
    ['#d62839', '#ffffff', 'SOLOSAKA'],
    ['#0d1b2a', '#1b998b', 'KICK OFF'],
  ];
  const pw = W / ads.length;
  ads.forEach(([bg, fg, text], i) => {
    g.fillStyle = bg;
    g.fillRect(i * pw, 0, pw, H);
    g.fillStyle = fg;
    g.font = 'italic 900 38px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, i * pw + pw / 2, H / 2 + 2);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(i * pw, 0, 2, H);
  });
  return makeTexture(c, 8);
}
