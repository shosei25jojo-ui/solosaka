import { PITCH } from '../config.js';

/** 最小限のボール（STEP B で本格的な物理に置き換える） */
export const BALL = {
  radius: 0.11,
  rollDecel: 2.2,   // 芝の転がり抵抗 (m/s²)
  gravity: 9.81,
  bounce: 0.5,
};

export class Ball {
  constructor(x = 0, y = 0) {
    this.x = x; this.y = y; this.z = BALL.radius;
    this.px = x; this.py = y; this.pz = this.z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.owner = null;
    this.spin = 0; // 見た目用の回転角
  }

  step(dt) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    // 空中
    if (this.z > BALL.radius + 1e-3 || this.vz > 0) {
      this.vz -= BALL.gravity * dt;
      this.z += this.vz * dt;
      if (this.z < BALL.radius) {
        this.z = BALL.radius;
        this.vz = -this.vz * BALL.bounce;
        if (Math.abs(this.vz) < 0.6) this.vz = 0;
      }
    }
    // 地上の転がり
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 0 && this.z <= BALL.radius + 0.02) {
      const ns = Math.max(0, sp - BALL.rollDecel * dt);
      this.vx *= ns / sp; this.vy *= ns / sp;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += (Math.hypot(this.vx, this.vy) / BALL.radius) * dt;
    // 看板で止める
    const bx = PITCH.halfL + 4.5, by = PITCH.halfW + 3.4;
    if (Math.abs(this.x) > bx) { this.x = Math.sign(this.x) * bx; this.vx *= -0.3; }
    if (Math.abs(this.y) > by) { this.y = Math.sign(this.y) * by; this.vy *= -0.3; }
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
}
