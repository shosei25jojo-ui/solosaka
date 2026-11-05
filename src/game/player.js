import { PITCH } from '../config.js';
import { Locomotion } from './locomotion.js';
import { GaitController, makeGaitProfile } from './gait.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};

/**
 * 選手。移動速度はストライド × ピッチ（GaitController）で決まり、
 * 走りモーション（Locomotion）は移動距離で位相を進め、接地で onContact を発火する。
 */
export class Player {
  constructor({ x = 0, y = 0, heading = 0, kit, abilities, name = '' }) {
    this.name = name;
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.vx = 0; this.vy = 0;
    this.speed = 0;
    this.heading = heading;
    this.turnRate = 0;
    this.accelFwd = 0;
    this.mode = 'jog';
    this.kit = kit;
    this.hasBall = false;
    this.gait = new GaitController(makeGaitProfile(abilities));
    this.contactListeners = [];
    this.loco = new Locomotion();
    this.loco.onContact = (side, footPos) => {
      this.gait.onContact(this, side);
      for (const fn of this.contactListeners) fn(this, side, footPos);
    };
    this.loco.reset(this);
  }

  /** 接地イベントの購読 fn(player, side(-1 左 / +1 右), footPos[x,y,z]) */
  onContact(fn) { this.contactListeners.push(fn); }

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
   * @param {{moveX:number, moveY:number, dash:boolean, control:boolean, press?:null|'far'|'near', faceX?:number, faceY?:number}} input
   */
  step(input, dt) {
    this.px = this.x; this.py = this.y;
    const ix = input.moveX, iy = input.moveY;
    const mag = Math.min(1, Math.hypot(ix, iy));
    const prevHeading = this.heading;
    const prevSpeed = this.speed;

    const face = input.faceX != null ? Math.atan2(input.faceY - this.y, input.faceX - this.x) : null;
    const g = this.gait;
    this.speed = g.update(this, {
      ix, iy, mag,
      dash: !!input.dash, control: !!input.control,
      hasBall: this.hasBall, press: input.press ?? null, face,
    }, dt);
    this.mode = g.state;

    this.vx = Math.cos(this.heading) * this.speed;
    this.vy = Math.sin(this.heading) * this.speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // フィールド外周（看板の内側）で止める
    const bx = PITCH.halfL + 4, by = PITCH.halfW + 3;
    if (this.x < -bx || this.x > bx) { this.x = clamp(this.x, -bx, bx); g.stride *= 0.5; }
    if (this.y < -by || this.y > by) { this.y = clamp(this.y, -by, by); g.stride *= 0.5; }

    const tr = angDiff(prevHeading, this.heading) / dt;
    this.turnRate += (tr - this.turnRate) * (1 - Math.exp(-dt * 12));
    const af = (this.speed - prevSpeed) / dt;
    this.accelFwd += (af - this.accelFwd) * (1 - Math.exp(-dt * 10));

    this.loco.update(this, dt, Math.hypot(this.x - this.px, this.y - this.py));
  }
}
