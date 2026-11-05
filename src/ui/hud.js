import { Container, Text, Graphics } from 'pixi.js';

/** デバッグ兼用 HUD（STEP 1） */
export class Hud {
  constructor() {
    this.view = new Container();
    const bg = new Graphics().roundRect(12, 10, 236, 70, 8).fill({ color: 0x000000, alpha: 0.42 });
    this.title = new Text({ text: 'SOLOSAKA  STEP 1', style: { fill: 0xffffff, fontSize: 15, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 } });
    this.title.position.set(22, 16);
    this.info = new Text({ text: '', style: { fill: 0xdfe8e0, fontSize: 13, fontFamily: 'monospace', lineHeight: 17 } });
    this.info.position.set(22, 38);
    this.view.addChild(bg, this.title, this.info);
    this.fps = 60;
    this.acc = 0;
  }

  update(dtReal, player, input, timeScale) {
    if (dtReal > 0) this.fps += (1 / dtReal - this.fps) * 0.05;
    this.acc += dtReal;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const kmh = (player.speed * 3.6).toFixed(1).padStart(5);
    const mode = player.mode.toUpperCase().padEnd(7);
    const src = input.source === 'gamepad' ? 'PAD' : input.source === 'touch' ? 'TOUCH' : 'KEY';
    this.info.text = `${kmh} km/h  ${mode}\n${src.padEnd(5)}  ${Math.round(this.fps)}fps${timeScale < 1 ? '  SLOW x' + timeScale : ''}`;
  }
}
