import { MOVE, PITCH } from '../config.js';
import { Locomotion } from './locomotion.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};

/** 選手（移動の物理 + モーション） */
export class Player {
  constructor({ x = 0, y = 0, heading = 0, kit }) {
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.vx = 0; this.vy = 0;
    this.speed = 0;
    this.heading = heading;
    this.turnRate = 0;
    this.accelFwd = 0;
    this.mode = 'jog'; // 'jog' | 'dash' | 'control'
    this.kit = kit;
    this.loco = new Locomotion();
    this.loco.reset(this);
  }

  /** 状態（足の接地位置など）を保ったまま平行移動 */
  teleport(x, y) {
    const dx = x - this.x, dy = y - this.y;
    this.x = x; this.y = y; this.px += dx; this.py += dy;
    for (const leg of this.loco.legs) { leg.pos[0] += dx; leg.pos[1] += dy; leg.lift[0] += dx; leg.lift[1] += dy; }
    for (const arr of [this.loco.joints, this.loco.prevJoints]) {
      for (let i = 0; i < arr.length; i += 3) { arr[i] += dx; arr[i + 1] += dy; }
    }
  }

  /**
   * @param {{moveX:number, moveY:number, dash:boolean, control:boolean}} input
   */
  step(input, dt) {
    this.px = this.x; this.py = this.y;
    let ix = input.moveX, iy = input.moveY;
    const mag = Math.min(1, Math.hypot(ix, iy));

    this.mode = input.dash ? 'dash' : input.control ? 'control' : 'jog';
    const vmax = this.mode === 'dash' ? MOVE.dashSpeed : this.mode === 'control' ? MOVE.controlSpeed : MOVE.jogSpeed;
    let target = vmax * mag;
    const prevHeading = this.heading;
    const prevSpeed = this.speed;

    if (mag > 0.05) {
      const want = Math.atan2(iy, ix);
      const diff = angDiff(this.heading, want);
      const ad = Math.abs(diff);
      // 速いほど曲がりにくい（横方向の加速度には限界がある）
      const omega = this.speed < 0.7 ? 15 : clamp(1.8 + 11 / this.speed, 2.6, 14);
      // 大きな方向転換は一度ブレーキしてから切り返す
      if (ad > 1.75 && this.speed > 2.4) target = Math.min(target, 1.2);
      else if (ad > 0.45) target *= 1 - 0.4 * clamp((ad - 0.45) / 1.3, 0, 1);
      this.heading += clamp(diff, -omega * dt, omega * dt);
      this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    }

    if (target > this.speed) {
      const a = MOVE.accel * (this.mode === 'dash' ? MOVE.dashAccelBoost : 1) * Math.max(0.15, 1 - this.speed / MOVE.accelTopRef);
      this.speed = Math.min(target, this.speed + a * dt);
    } else {
      const d = mag > 0.05 ? MOVE.brake : MOVE.coast;
      this.speed = Math.max(target, this.speed - d * dt);
    }

    this.vx = Math.cos(this.heading) * this.speed;
    this.vy = Math.sin(this.heading) * this.speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // フィールド外周（看板の内側）で止める
    const bx = PITCH.halfL + 4, by = PITCH.halfW + 3;
    if (this.x < -bx || this.x > bx) { this.x = clamp(this.x, -bx, bx); this.speed *= 0.5; }
    if (this.y < -by || this.y > by) { this.y = clamp(this.y, -by, by); this.speed *= 0.5; }

    const tr = angDiff(prevHeading, this.heading) / dt;
    this.turnRate += (tr - this.turnRate) * (1 - Math.exp(-dt * 12));
    const af = (this.speed - prevSpeed) / dt;
    this.accelFwd += (af - this.accelFwd) * (1 - Math.exp(-dt * 10));

    this.loco.update(this, dt);
  }
}
