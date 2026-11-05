import { Container, Graphics, PerspectiveMesh } from 'pixi.js';
import { PITCH } from '../config.js';
import { GROUND, createPitchTexture, createCrowdTexture, createBoardTexture } from './textures.js';

const tmp = [{ x: 0, y: 0, s: 1, d: 1 }, { x: 0, y: 0, s: 1, d: 1 }, { x: 0, y: 0, s: 1, d: 1 }, { x: 0, y: 0, s: 1, d: 1 }];

/** ワールド上の平面四角形（テクスチャ左上→右上→右下→左下）を透視投影で貼るメッシュ */
class WorldQuad {
  constructor(texture, corners, verts = 16) {
    this.corners = corners; // [[x,y,z] x4]
    this.mesh = new PerspectiveMesh({ texture, verticesX: verts, verticesY: verts });
  }
  update(cam) {
    const c = this.corners;
    for (let i = 0; i < 4; i++) cam.project(c[i][0], c[i][1], c[i][2], tmp[i]);
    this.mesh.setCorners(tmp[0].x, tmp[0].y, tmp[1].x, tmp[1].y, tmp[2].x, tmp[2].y, tmp[3].x, tmp[3].y);
  }
}

/** ピッチ・スタンド・広告ボード（背景レイヤー） */
export class Stadium {
  constructor() {
    this.container = new Container();
    const pitchTex = createPitchTexture();
    const crowdA = createCrowdTexture(7);
    const crowdB = createCrowdTexture(99);
    const board = createBoardTexture();

    const { x0, x1, y0, y1 } = GROUND;
    this.quads = [
      // 地面
      new WorldQuad(pitchTex, [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], 24),
      // 奥スタンド（下段→上段へ傾斜）。テクスチャ上端=最上段
      new WorldQuad(crowdA, [[-82, -66, 19], [82, -66, 19], [76, -39.5, 1.3], [-76, -39.5, 1.3]], 16),
      // 左右ゴール裏スタンド
      new WorldQuad(crowdB, [[-82, 60, 19], [-82, -66, 19], [-59.5, -39.5, 1.3], [-59.5, 42, 1.3]], 16),
      new WorldQuad(crowdB, [[82, -66, 19], [82, 60, 19], [59.5, 42, 1.3], [59.5, -39.5, 1.3]], 16),
      // 広告ボード（奥・左右）
      new WorldQuad(board, [[-58, -37.5, 0.95], [58, -37.5, 0.95], [58, -37.5, 0], [-58, -37.5, 0]], 12),
      new WorldQuad(board, [[-57.5, 38, 0.95], [-57.5, -37.5, 0.95], [-57.5, -37.5, 0], [-57.5, 38, 0]], 12),
      new WorldQuad(board, [[57.5, -37.5, 0.95], [57.5, 38, 0.95], [57.5, 38, 0], [57.5, -37.5, 0]], 12),
    ];
    // スタンドの最前列の壁（コンクリート）
    this.walls = new Graphics();
    for (const q of this.quads) this.container.addChild(q.mesh);
    this.container.addChildAt(this.walls, 1);
  }

  update(cam) {
    for (const q of this.quads) q.update(cam);
    const g = this.walls;
    g.clear();
    // 奥・左右スタンド前の壁
    wall(g, cam, [[-76, -39.5], [76, -39.5]], 1.3, 0x1a1f27);
    wall(g, cam, [[-59.5, 42], [-59.5, -39.5]], 1.3, 0x161b22);
    wall(g, cam, [[59.5, -39.5], [59.5, 42]], 1.3, 0x161b22);
  }
}

const pA = { x: 0, y: 0, s: 1, d: 1 }, pB = { x: 0, y: 0, s: 1, d: 1 }, pC = { x: 0, y: 0, s: 1, d: 1 }, pD = { x: 0, y: 0, s: 1, d: 1 };
function wall(g, cam, [[ax, ay], [bx, by]], h, color) {
  cam.project(ax, ay, 0, pA); cam.project(bx, by, 0, pB);
  cam.project(bx, by, h, pC); cam.project(ax, ay, h, pD);
  g.poly([pA.x, pA.y, pB.x, pB.y, pC.x, pC.y, pD.x, pD.y]).fill(color);
}

/** ゴール（ポスト・クロスバー・ネット）。選手と奥行きソートする */
export class Goal {
  constructor(side) {
    this.side = side; // -1 左 / +1 右
    this.g = new Graphics();
    this.x = side * PITCH.halfL;
    this.p = [];
    for (let i = 0; i < 8; i++) this.p.push({ x: 0, y: 0, s: 1, d: 1 });
  }

  update(cam) {
    const g = this.g;
    g.clear();
    const x0 = this.x;
    const xb = x0 + this.side * PITCH.goalDepth;
    const hw = PITCH.goalHalfW;
    const h = PITCH.goalH;
    const hb = 1.9; // 後ろ上端の高さ
    const P = (x, y, z, o) => cam.project(x, y, z, o);
    const [fl0, fl1, fr0, fr1, bl0, bl1, br0, br1] = this.p;
    P(x0, -hw, 0, fl0); P(x0, -hw, h, fl1); P(x0, hw, 0, fr0); P(x0, hw, h, fr1);
    P(xb, -hw, 0, bl0); P(xb, -hw, hb, bl1); P(xb, hw, 0, br0); P(xb, hw, hb, br1);
    this.g.zIndex = -cam.depth(x0 + this.side * 1.0, 0, 1);

    const netColor = 0xe8eef2;
    const netW = Math.max(0.6, fl0.s * 0.02);
    // ネット: 背面・側面・天井の格子
    const n = 14, m = 6;
    const q = { x: 0, y: 0, s: 1, d: 1 }, r = { x: 0, y: 0, s: 1, d: 1 };
    for (let i = 0; i <= n; i++) {
      const y = -hw + (2 * hw * i) / n;
      // 背面縦
      P(xb, y, 0, q); P(xb, y, hb, r); g.moveTo(q.x, q.y).lineTo(r.x, r.y);
      // 天井（クロスバー→後ろ上端）
      P(x0, y, h, q); g.moveTo(q.x, q.y).lineTo(r.x, r.y);
    }
    for (let j = 0; j <= m; j++) {
      const t = j / m;
      // 背面横
      P(xb, -hw, hb * t, q); P(xb, hw, hb * t, r); g.moveTo(q.x, q.y).lineTo(r.x, r.y);
      // 側面
      for (const y of [-hw, hw]) {
        P(x0, y, h * t, q); P(xb, y, hb * t, r); g.moveTo(q.x, q.y).lineTo(r.x, r.y);
      }
    }
    for (let k = 1; k < 4; k++) {
      const xx = x0 + (xb - x0) * (k / 4);
      const zt = h + (hb - h) * (k / 4);
      for (const y of [-hw, hw]) { P(xx, y, 0, q); P(xx, y, zt, r); g.moveTo(q.x, q.y).lineTo(r.x, r.y); }
      P(xx, -hw, zt, q); P(xx, hw, zt, r); g.moveTo(q.x, q.y).lineTo(r.x, r.y);
    }
    g.stroke({ width: netW, color: netColor, alpha: 0.45 });
    // 後ろの支柱
    g.moveTo(bl0.x, bl0.y).lineTo(bl1.x, bl1.y).lineTo(br1.x, br1.y).lineTo(br0.x, br0.y);
    g.moveTo(fl1.x, fl1.y).lineTo(bl1.x, bl1.y);
    g.moveTo(fr1.x, fr1.y).lineTo(br1.x, br1.y);
    g.stroke({ width: Math.max(1, fl0.s * 0.05), color: 0xbfc6cc, alpha: 0.9 });
    // ポスト・クロスバー
    g.moveTo(fl0.x, fl0.y).lineTo(fl1.x, fl1.y).lineTo(fr1.x, fr1.y).lineTo(fr0.x, fr0.y);
    g.stroke({ width: Math.max(1.5, fl0.s * 0.12), color: 0xffffff, cap: 'round', join: 'round' });
  }
}

/** ピッチのライン（地面上の帯としてワールド幅で透視投影 → どの距離でもくっきり） */
export class PitchLines {
  constructor() {
    this.g = new Graphics();
    this.polylines = buildLinePolylines();
    this.spots = [[0, 0, 0.16], [-PITCH.halfL + PITCH.penaltySpot, 0, 0.14], [PITCH.halfL - PITCH.penaltySpot, 0, 0.14]];
    this.a = { x: 0, y: 0, s: 1, d: 1 }; this.b = { x: 0, y: 0, s: 1, d: 1 };
    this.c = { x: 0, y: 0, s: 1, d: 1 }; this.e = { x: 0, y: 0, s: 1, d: 1 };
  }

  update(cam) {
    const g = this.g;
    g.clear();
    const hw = PITCH.lineW / 2 + 0.01;
    const { a, b, c, e } = this;
    for (const pl of this.polylines) {
      for (let i = 0; i + 3 < pl.length; i += 2) {
        let x0 = pl[i], y0 = pl[i + 1], x1 = pl[i + 2], y1 = pl[i + 3];
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
        if (L < 1e-6) continue;
        const ux = dx / L, uy = dy / L;
        // 継ぎ目が切れないよう少し延長
        x0 -= ux * hw; y0 -= uy * hw; x1 += ux * hw; y1 += uy * hw;
        const nx = -uy * hw, ny = ux * hw;
        cam.project(x0 + nx, y0 + ny, 0, a); cam.project(x1 + nx, y1 + ny, 0, b);
        cam.project(x1 - nx, y1 - ny, 0, c); cam.project(x0 - nx, y0 - ny, 0, e);
        g.poly([a.x, a.y, b.x, b.y, c.x, c.y, e.x, e.y]);
      }
    }
    for (const [sx, sy, r] of this.spots) {
      const pts = [];
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2;
        cam.project(sx + Math.cos(t) * r, sy + Math.sin(t) * r, 0, a);
        pts.push(a.x, a.y);
      }
      g.poly(pts);
    }
    g.fill({ color: 0xf5f8f0, alpha: 0.92 });
  }
}

function buildLinePolylines() {
  const L = PITCH.halfL, W = PITCH.halfW;
  const out = [];
  const arc = (cx, cy, r, a0, a1, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      pts.push(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
    }
    return pts;
  };
  out.push([-L, -W, L, -W], [L, -W, L, W], [L, W, -L, W], [-L, W, -L, -W]);
  out.push([0, -W, 0, W]);
  out.push(arc(0, 0, PITCH.centerCircleR, 0, Math.PI * 2, 72));
  for (const sd of [-1, 1]) {
    const gx = sd * L;
    const pd = gx - sd * PITCH.penaltyDepth, ph = PITCH.penaltyHalfW;
    out.push([gx, -ph, pd, -ph, pd, ph, gx, ph]);
    const gd = gx - sd * PITCH.goalAreaDepth, gh = PITCH.goalAreaHalfW;
    out.push([gx, -gh, gd, -gh, gd, gh, gx, gh]);
    const px = gx - sd * PITCH.penaltySpot;
    const ang = Math.acos((PITCH.penaltyDepth - PITCH.penaltySpot) / PITCH.centerCircleR);
    out.push(sd < 0 ? arc(px, 0, PITCH.centerCircleR, -ang, ang, 24) : arc(px, 0, PITCH.centerCircleR, Math.PI - ang, Math.PI + ang, 24));
    for (const ys of [-1, 1]) {
      const a0 = sd < 0 ? (ys < 0 ? 0 : -Math.PI / 2) : (ys < 0 ? Math.PI / 2 : Math.PI);
      out.push(arc(gx, ys * W, 1, a0, a0 + Math.PI / 2, 6));
    }
  }
  return out;
}
