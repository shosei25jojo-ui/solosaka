import { GAIT } from './gait.js';

/**
 * 守備の寄せ（テスト用の簡易 AI）。
 * ボール保持者（いなければボール）へ寄せる。間合い(GAIT.press.closeDist)の外は大股で詰め、
 * 中に入ったら小刻みなステップに切り替えて holdDist で止まり、相手を向く。
 */
export class PressAI {
  constructor(player) {
    this.player = player;
    this.near = false;
    this.input = { moveX: 0, moveY: 0, dash: false, control: false, press: 'far', faceX: null, faceY: null };
  }

  think(targetX, targetY) {
    const p = this.player, P = GAIT.press;
    const dx = targetX - p.x, dy = targetY - p.y;
    const d = Math.hypot(dx, dy);
    if (this.near) { if (d > P.closeDist + P.hysteresis) this.near = false; }
    else if (d < P.closeDist - P.hysteresis) this.near = true;
    const inp = this.input;
    inp.press = this.near ? 'near' : 'far';
    inp.faceX = targetX; inp.faceY = targetY;
    const gap = d - P.holdDist;
    if (gap > 0.15) {
      // 残り距離で止まれる速度まで（ストライドを詰めて）減速しながら寄せる
      const vDes = Math.sqrt(2 * P.approachDecel * gap);
      const m = Math.max(0.15, Math.min(1, vDes / p.gait.fullSpeed(this.near ? 'pressNear' : 'pressFar')));
      inp.moveX = (dx / d) * m; inp.moveY = (dy / d) * m;
    } else {
      inp.moveX = 0; inp.moveY = 0;
    }
    return inp;
  }
}
