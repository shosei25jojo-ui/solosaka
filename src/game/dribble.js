import { GAIT } from './gait.js';
import { BALL } from './ball.js';

/**
 * ドリブル: ボールタッチは「接地イベント」で行う。
 * - touchEvery: 何歩ごとに触るか（R2 はほぼ毎歩 / ダッシュは数歩おき）
 * - lead: 次のタッチの瞬間に、体の何 m 前にボールが来るように押し出すか
 * 次のタッチまでの時間 T = 歩数 / ピッチ。転がり抵抗 a を考慮して初速を決める:
 *   距離 d = v·T − ½·a·T²  →  v = (d + ½·a·T²) / T
 */
export class Dribble {
  constructor(ball) {
    this.ball = ball;
    this.stepsSinceTouch = 0;
    this.touches = 0;
    this.lastTouchState = '-';
  }

  attach(player) {
    player.onContact((p, side, foot) => this.onContact(p, side, foot));
  }

  _key(state) {
    return GAIT.dribble.touchEvery[state] != null ? state : 'dribble';
  }

  /** 毎ステップ: 拾う / 失う の判定 */
  update(players) {
    const b = this.ball;
    const D = GAIT.dribble;
    if (b.owner) {
      const o = b.owner;
      const d = Math.hypot(b.x - o.x, b.y - o.y);
      if (d > D.loseDist) this._release();
      // 止まったら足裏で止める
      else if (o.speed < 0.3 && d < 1.0) { b.vx *= 0.85; b.vy *= 0.85; }
    } else {
      for (const p of players) {
        if (!p.canDribble) continue;
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        const rel = Math.hypot(b.vx - p.vx, b.vy - p.vy);
        if (d < D.pickup && rel < D.pickupRelSpeed && b.z < 0.5) {
          b.owner = p; p.hasBall = true;
          this.stepsSinceTouch = 99; // 次の接地ですぐ触る
          break;
        }
      }
    }
  }

  _release() {
    if (this.ball.owner) this.ball.owner.hasBall = false;
    this.ball.owner = null;
  }

  onContact(p, side, foot) {
    const b = this.ball;
    if (b.owner !== p) return;
    const D = GAIT.dribble;
    const key = this._key(p.mode);
    const g = p.gait;
    // 走り出し中・加速中は小さく細かく触る（体がボールを追い越さないように）
    const accelerating = g.strideCmd * g.cadenceCmd > p.speed * 1.15;
    let every = D.touchEvery[key];
    if (g.stepsSinceStart < GAIT.startup.strideCurve.length) every = 1;
    else if (accelerating) every = Math.min(every, D.accelTouchEvery);
    // 切り返した歩では、ボールの向きを変えるためにその場で触る
    const turnNow = g.headingTarget != null ? Math.abs(Math.atan2(Math.sin(g.headingTarget - p.heading), Math.cos(g.headingTarget - p.heading))) : 0;
    if (turnNow > D.redirectTurn) every = 1;
    this.stepsSinceTouch++;
    if (this.stepsSinceTouch < every) return;
    // 接地足の近く（足の前方）にボールがあるときだけ触れる
    const fx = Math.cos(p.heading), fy = Math.sin(p.heading);
    const footFwdX = foot[0] + fx * 0.25, footFwdY = foot[1] + fy * 0.25;
    if (Math.hypot(b.x - footFwdX, b.y - footFwdY) > D.reach) return;

    const cad = Math.max(g.cadence, 1);
    const T = every / cad;
    // 次のタッチまでの平均速度（加速中は目標値へ向かう分を見込む）
    const speed = (p.speed + Math.min(g.strideCmd * g.cadenceCmd, p.speed + 4 * T)) / 2;
    // 次のタッチ時の体の位置 + lead にボールを送る（向きは接地で決まった新しい向き）
    const hd = g.headingTarget ?? p.heading;
    const hx = Math.cos(hd), hy = Math.sin(hd);
    const lead = speed < 0.5 ? 0.35 : D.lead[key];
    const tx = p.x + hx * (speed * T + lead);
    const ty = p.y + hy * (speed * T + lead);
    const dx = tx - b.x, dy = ty - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) return;
    const a = BALL.rollDecel;
    let v = (d + 0.5 * a * T * T) / T;
    v = Math.min(v, 16);
    b.vx = (dx / d) * v;
    b.vy = (dy / d) * v;
    b.vz = key === 'dashDribble' || key === 'dash' ? 0.8 : 0; // 大きく押し出すと少し浮く
    this.stepsSinceTouch = 0;
    this.touches++;
    this.lastTouchState = key;
  }
}
