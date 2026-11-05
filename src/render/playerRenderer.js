import { Graphics, Container } from 'pixi.js';
import { J, JOINT_COUNT, BODY } from '../game/skeleton.js';

function shade(color, k) {
  const r = Math.min(255, ((color >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((color >> 8) & 255) * k) | 0;
  const b = Math.min(255, (color & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}

/**
 * 3D 骨格をカメラで投影し、テーパー付きカプセルで描く 2D 骨格モデル。
 * 左右の手足は奥行きで前後関係を決める。
 */
export class PlayerRenderer {
  constructor(player, shadowLayer) {
    this.player = player;
    this.view = new Container();
    this.g = new Graphics();
    this.view.addChild(this.g);
    this.shadow = new Graphics();
    shadowLayer.addChild(this.shadow);
    this.pts = [];
    for (let i = 0; i < JOINT_COUNT; i++) this.pts.push({ x: 0, y: 0, s: 1, d: 1 });
    this.world = new Float32Array(JOINT_COUNT * 3);
    this.tmp = { x: 0, y: 0, s: 1, d: 1 };
  }

  draw(cam, alpha) {
    const p = this.player;
    const lo = p.loco;
    const a = lo.prevJoints, b = lo.joints, w = this.world;
    for (let i = 0; i < w.length; i++) w[i] = a[i] + (b[i] - a[i]) * alpha;
    const P = this.pts;
    for (let i = 0; i < JOINT_COUNT; i++) cam.project(w[i * 3], w[i * 3 + 1], w[i * 3 + 2], P[i]);

    const px = p.px + (p.x - p.px) * alpha;
    const py = p.py + (p.y - p.py) * alpha;
    this.view.zIndex = -cam.depth(px, py, 0);

    this._drawShadow(cam, w);

    const g = this.g;
    g.clear();
    const kit = p.kit;
    const s = P[J.PELVIS].s; // px / m

    const legsLFar = P[J.L_HIP].d > P[J.R_HIP].d;
    const armsLFar = P[J.L_SH].d > P[J.R_SH].d;
    const farLeg = legsLFar ? 'L' : 'R', nearLeg = legsLFar ? 'R' : 'L';
    const farArm = armsLFar ? 'L' : 'R', nearArm = armsLFar ? 'R' : 'L';

    this._arm(g, farArm, s, kit, 0.82);
    this._leg(g, farLeg, s, kit, 0.82);
    this._leg(g, nearLeg, s, kit, 1);

    // パンツ（腰まわり）
    const lw = P[J.L_WA], rw = P[J.R_WA], lh = P[J.L_HIP], rh = P[J.R_HIP], pv = P[J.PELVIS];
    const lk = P[J.L_KN], rk = P[J.R_KN];
    const ltx = lh.x + (lk.x - lh.x) * 0.22, lty = lh.y + (lk.y - lh.y) * 0.22;
    const rtx = rh.x + (rk.x - rh.x) * 0.22, rty = rh.y + (rk.y - rh.y) * 0.22;
    g.poly([lw.x, lw.y, rw.x, rw.y, rtx, rty, pv.x, pv.y + s * 0.03, ltx, lty])
      .fill(kit.shorts)
      .stroke({ width: s * 0.13, color: kit.shorts, join: 'round' });

    // 胴体（シャツ）: 正面形の多角形 + 背骨に沿ったカプセル（側面の厚み）
    const ls = P[J.L_SH], rs = P[J.R_SH];
    const ch0 = P[J.CHEST];
    const t = this.tmp;
    const ux = w[J.CHEST * 3] - w[J.PELVIS * 3], uy = w[J.CHEST * 3 + 1] - w[J.PELVIS * 3 + 1], uz = w[J.CHEST * 3 + 2] - w[J.PELVIS * 3 + 2];
    cam.project(w[J.PELVIS * 3] + ux * 0.3, w[J.PELVIS * 3 + 1] + uy * 0.3, w[J.PELVIS * 3 + 2] + uz * 0.3, t);
    const bx = t.x, by = t.y;
    cam.project(w[J.PELVIS * 3] + ux * 0.86, w[J.PELVIS * 3 + 1] + uy * 0.86, w[J.PELVIS * 3 + 2] + uz * 0.86, t);
    capsule(g, { x: bx, y: by }, t, s * 0.105, s * 0.125, kit.shirt);
    g.poly([ls.x, ls.y, rs.x, rs.y, rw.x, rw.y, lw.x, lw.y])
      .fill(kit.shirt)
      .stroke({ width: s * 0.12, color: kit.shirt, join: 'round' });
    // 脇腹の陰影（奥側）
    const fs = armsLFar ? ls : rs, fw = armsLFar ? lw : rw;
    g.moveTo(fs.x, fs.y).lineTo(fw.x, fw.y).stroke({ width: s * 0.07, color: shade(kit.shirt, 0.78), cap: 'round' });
    // 裾
    g.moveTo(lw.x, lw.y).lineTo(rw.x, rw.y).stroke({ width: s * 0.05, color: shade(kit.shirt, 0.85), cap: 'round' });

    // 首・頭
    const ch = P[J.CHEST], nk = P[J.NECK], hd = P[J.HEAD];
    capsule(g, ch, nk, s * 0.05, s * 0.045, kit.skin);
    g.moveTo(ls.x + (ch.x - ls.x) * 0.55, ls.y + (ch.y - ls.y) * 0.55)
      .lineTo(rs.x + (ch.x - rs.x) * 0.55, rs.y + (ch.y - rs.y) * 0.55)
      .stroke({ width: s * 0.035, color: kit.trim, cap: 'round' }); // 襟
    this._head(g, cam, w, hd, s, kit);

    this._arm(g, nearArm, s, kit, 1);
  }

  _leg(g, side, s, kit, k) {
    const P = this.pts;
    const hip = P[J[side + '_HIP']], kn = P[J[side + '_KN']], an = P[J[side + '_AN']];
    const to = P[J[side + '_TO']], he = P[J[side + '_HE']];
    const skin = shade(kit.skin, k), sock = shade(kit.socks, k), shorts = shade(kit.shorts, k), boot = shade(kit.boots, k);
    // 太もも
    capsule(g, hip, kn, s * 0.083, s * 0.056, skin);
    // パンツの裾
    const mx = hip.x + (kn.x - hip.x) * 0.42, my = hip.y + (kn.y - hip.y) * 0.42;
    capsule(g, hip, { x: mx, y: my }, s * 0.095, s * 0.078, shorts);
    // ひざ〜すね（素肌）→ ソックス（ふくらはぎのふくらみ付き）
    capsule(g, kn, an, s * 0.05, s * 0.034, skin);
    const lerpP = (t) => ({ x: kn.x + (an.x - kn.x) * t, y: kn.y + (an.y - kn.y) * t });
    const s0 = lerpP(0.13), calf = lerpP(0.34);
    capsule(g, s0, calf, s * 0.053, s * 0.058, sock);
    capsule(g, calf, an, s * 0.058, s * 0.035, sock);
    // スパイク
    capsule(g, he, to, s * 0.04, s * 0.032, boot);
    capsule(g, an, { x: (an.x + to.x) * 0.5, y: (an.y + to.y) * 0.5 }, s * 0.036, s * 0.035, boot);
    g.moveTo(he.x, he.y).lineTo((he.x + to.x) * 0.5, (he.y + to.y) * 0.5)
      .stroke({ width: s * 0.012, color: shade(kit.bootAccent, k), cap: 'round' });
  }

  _arm(g, side, s, kit, k) {
    const P = this.pts;
    const sh = P[J[side + '_SH']], el = P[J[side + '_EL']], ha = P[J[side + '_HA']];
    const skin = shade(kit.skin, k), shirt = shade(kit.shirt, k);
    capsule(g, sh, el, s * 0.047, s * 0.039, skin);
    capsule(g, el, ha, s * 0.038, s * 0.029, skin);
    g.circle(ha.x, ha.y, s * 0.042).fill(skin);
    // 半袖
    const mx = sh.x + (el.x - sh.x) * 0.5, my = sh.y + (el.y - sh.y) * 0.5;
    capsule(g, sh, { x: mx, y: my }, s * 0.068, s * 0.055, shirt);
  }

  _head(g, cam, w, hd, s, kit) {
    const p = this.player;
    const fx = Math.cos(p.heading), fy = Math.sin(p.heading);
    const hx = w[J.HEAD * 3], hy = w[J.HEAD * 3 + 1], hz = w[J.HEAD * 3 + 2];
    const t = this.tmp;
    cam.project(hx + fx * 0.03, hy + fy * 0.03, hz - 0.012, t);
    const faceX = t.x, faceY = t.y, faceD = t.d;
    cam.project(hx - fx * 0.022, hy - fy * 0.022, hz + 0.025, t);
    const hairX = t.x, hairY = t.y;
    const r = s * BODY.headR;
    const faceFront = faceD < hd.d; // 顔がカメラ側
    if (faceFront) {
      g.circle(hairX, hairY, r * 1.0).fill(kit.hair);
      g.circle(faceX, faceY, r * 0.94).fill(kit.skin);
      // 前髪
      g.circle(hairX + (hd.x - hairX) * 0.2, hairY - r * 0.35, r * 0.72).fill(kit.hair);
      g.circle(faceX, faceY + r * 0.15, r * 0.7).fill(kit.skin);
    } else {
      g.circle(faceX, faceY, r * 0.94).fill(kit.skin);
      g.circle(hairX, hairY, r * 1.0).fill(kit.hair);
    }
  }

  _drawShadow(cam, w) {
    const g = this.shadow;
    g.clear();
    const t = this.tmp;
    const cx = w[J.PELVIS * 3], cy = w[J.PELVIS * 3 + 1];
    // 太陽はやや左奥 → 影は右手前へ
    const ox = cx + 0.12, oy = cy + 0.08;
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const ex = Math.cos(a) * 0.5, ey = Math.sin(a) * 0.28;
      // 楕円を影方向に回転
      const rx = ex * 0.85 - ey * 0.5, ry = ex * 0.5 + ey * 0.85;
      cam.project(ox + rx, oy + ry, 0, t);
      pts.push(t.x, t.y);
    }
    g.poly(pts).fill({ color: 0x000000, alpha: 0.26 });
    // 足元の接地影
    for (const j of [J.L_AN, J.R_AN]) {
      const z = w[j * 3 + 2];
      const al = Math.max(0, 0.3 - z * 0.6);
      if (al <= 0.01) continue;
      cam.project(w[j * 3] + 0.05, w[j * 3 + 1] + 0.03, 0, t);
      g.ellipse(t.x, t.y, t.s * 0.16, t.s * 0.07).fill({ color: 0x000000, alpha: al });
    }
  }
}

/** テーパー付きカプセル（2 円 + 接線四角形） */
function capsule(g, a, b, ra, rb, color) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  g.circle(a.x, a.y, ra);
  g.circle(b.x, b.y, rb);
  if (L > 0.5) {
    const nx = -dy / L, ny = dx / L;
    g.poly([a.x + nx * ra, a.y + ny * ra, b.x + nx * rb, b.y + ny * rb, b.x - nx * rb, b.y - ny * rb, a.x - nx * ra, a.y - ny * ra]);
  }
  g.fill(color);
}
