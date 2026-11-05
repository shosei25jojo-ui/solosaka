import { CAMERA, VIEW_W } from '../config.js';

const DEG = Math.PI / 180;

/**
 * 斜め俯瞰の透視カメラ。
 * ワールド座標: x = ピッチ長手方向（画面右が +）, y = 幅方向（画面手前が +）, z = 高さ（上が +）。
 * カメラは注視点 (tx, ty, 0) から手前(+y)・上方へ dist 離れた位置にあり、pitch 角で見下ろす。
 */
export class Camera {
  constructor() {
    this.pitch = CAMERA.pitchDeg * DEG;
    this.cosA = Math.cos(this.pitch);
    this.sinA = Math.sin(this.pitch);
    // シミュレーション状態（固定ステップで更新）
    this.tx = 0; this.ty = 0; this.dist = CAMERA.dist;
    this.ptx = 0; this.pty = 0; this.pdist = CAMERA.dist;
    // 描画用（補間済み）
    this.rx = 0; this.ry = 0; this.rdist = CAMERA.dist;
    this.cx = CAMERA.screenCx;
    this.cy = CAMERA.screenCy;
    this._updateDerived();
  }

  snap(x, y) {
    this.tx = this.ptx = x;
    this.ty = this.pty = y;
    this.interpolate(1);
  }

  /** 固定ステップ: 追従対象（将来はボール）に向けて注視点を動かす */
  step(targetX, targetY, vx, vy, speed, dt) {
    this.ptx = this.tx; this.pty = this.ty; this.pdist = this.dist;
    let gx = targetX + vx * CAMERA.lookAhead;
    let gy = targetY + vy * CAMERA.lookAhead * 0.6;
    gx = Math.max(-CAMERA.clampX, Math.min(CAMERA.clampX, gx));
    gy = Math.max(CAMERA.clampYMin, Math.min(CAMERA.clampYMax, gy));
    const k = 1 - Math.exp(-CAMERA.follow * dt);
    this.tx += (gx - this.tx) * k;
    this.ty += (gy - this.ty) * k;
    const goalDist = CAMERA.dist + speed * CAMERA.distSpeedGain;
    this.dist += (goalDist - this.dist) * (1 - Math.exp(-1.2 * dt));
  }

  interpolate(a) {
    this.rx = this.ptx + (this.tx - this.ptx) * a;
    this.ry = this.pty + (this.ty - this.pty) * a;
    this.rdist = this.pdist + (this.dist - this.pdist) * a;
    this._updateDerived();
  }

  _updateDerived() {
    // 注視点での横幅が viewWidthAtTarget になる焦点距離（距離基準で固定 → 引くとズームアウト）
    this.focal = (VIEW_W * CAMERA.dist) / CAMERA.viewWidthAtTarget;
    this.camX = this.rx;
    this.camY = this.ry + this.rdist * this.cosA;
    this.camZ = this.rdist * this.sinA;
  }

  /** カメラ方向の奥行き（大きいほど遠い） */
  depth(x, y, z) {
    return -(y - this.camY) * this.cosA - (z - this.camZ) * this.sinA;
  }

  /**
   * ワールド→スクリーン。out = {x, y, s(px/m), d(depth)}
   */
  project(x, y, z, out) {
    const rx = x - this.camX;
    const ry = y - this.camY;
    const rz = z - this.camZ;
    let d = -ry * this.cosA - rz * this.sinA;
    if (d < 0.05) d = 0.05;
    const up = -ry * this.sinA + rz * this.cosA;
    const s = this.focal / d;
    out.x = this.cx + rx * s;
    out.y = this.cy - up * s;
    out.s = s;
    out.d = d;
    return out;
  }
}
