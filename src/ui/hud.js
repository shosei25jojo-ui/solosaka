import { Container, Text, Graphics } from 'pixi.js';
import { GAIT } from '../game/gait.js';

/** 左上 HUD。debug = true でストライド・ピッチ・速度・位相・状態を表示 */
export class Hud {
  constructor() {
    this.view = new Container();
    this.bg = new Graphics();
    this.title = new Text({ text: 'SOLOSAKA', style: { fill: 0xffffff, fontSize: 15, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 } });
    this.title.position.set(22, 16);
    this.info = new Text({ text: '', style: { fill: 0xdfe8e0, fontSize: 13, fontFamily: 'monospace', lineHeight: 17 } });
    this.info.position.set(22, 38);
    this.view.addChild(this.bg, this.title, this.info);
    this.fps = 60;
    this.acc = 0;
    this.debug = true;
    this._lastH = 0;
  }

  update(dtReal, player, input, timeScale, extra = {}) {
    if (dtReal > 0) this.fps += (1 / dtReal - this.fps) * 0.05;
    this.acc += dtReal;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const src = input.source === 'gamepad' ? 'PAD' : input.source === 'touch' ? 'TOUCH' : 'KEY';
    const g = player.gait;
    const st = GAIT.states[g.state]?.label ?? g.state;
    const kmh = (player.speed * 3.6).toFixed(1).padStart(5);
    let lines = [`${kmh} km/h  ${st}`, `${src.padEnd(5)}  ${Math.round(this.fps)}fps${timeScale < 1 ? '  SLOW x' + timeScale : ''}`];
    if (this.debug) {
      const startup = g.stepsSinceStart < GAIT.startup.strideCurve.length ? `  START ${g.stepsSinceStart + 1}歩目` : '';
      lines = [
        `STATE   ${st}${startup}`,
        `STRIDE  ${g.stride.toFixed(2)} m   (目標 ${g.strideCmd.toFixed(2)})`,
        `PITCH   ${g.cadence.toFixed(2)} 歩/s (目標 ${g.cadenceCmd.toFixed(2)})`,
        `SPEED   ${player.speed.toFixed(2)} m/s = ${kmh.trim()} km/h`,
        `PHASE   ${player.loco.phase.toFixed(3)}   接地 ${g.lastContact}  #${g.stepCount}`,
        `CROUCH  ${g.crouch.toFixed(2)}   x${GAIT.global.strideMul.toFixed(2)} / x${GAIT.global.cadenceMul.toFixed(2)}`,
        ...(extra.lines || []),
        `${src}  ${Math.round(this.fps)}fps${timeScale < 1 ? '  SLOW x' + timeScale : ''}`,
      ];
    }
    this.info.text = lines.join('\n');
    const h = 38 + lines.length * 17 + 8;
    const w = this.debug ? 330 : 236;
    if (h !== this._lastH || w !== this._lastW) {
      this.bg.clear().roundRect(12, 10, w, h, 8).fill({ color: 0x000000, alpha: 0.5 });
      this._lastH = h; this._lastW = w;
    }
  }
}
