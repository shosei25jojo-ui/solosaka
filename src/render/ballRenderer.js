import { Graphics, Container } from 'pixi.js';
import { BALL } from '../game/ball.js';

export class BallRenderer {
  constructor(ball, shadowLayer) {
    this.ball = ball;
    this.view = new Container();
    this.g = new Graphics();
    this.view.addChild(this.g);
    this.shadow = new Graphics();
    shadowLayer.addChild(this.shadow);
    this.p = { x: 0, y: 0, s: 1, d: 1 };
  }

  draw(cam, a) {
    const b = this.ball;
    const x = b.px + (b.x - b.px) * a, y = b.py + (b.y - b.py) * a, z = b.pz + (b.z - b.pz) * a;
    const p = this.p;
    cam.project(x + 0.03 * z, y + 0.02 * z, 0, p);
    this.shadow.clear().ellipse(p.x, p.y, p.s * BALL.radius * 1.2, p.s * BALL.radius * 0.6).fill({ color: 0, alpha: 0.35 });
    cam.project(x, y, z, p);
    this.view.zIndex = -cam.depth(x, y, 0) + 0.01;
    const r = Math.max(2.2, p.s * BALL.radius);
    const g = this.g;
    g.clear();
    g.circle(p.x, p.y, r).fill(0xf7f7f2);
    // 回転して見える模様
    const sp = b.spin;
    for (let i = 0; i < 3; i++) {
      const ang = sp + (i * Math.PI * 2) / 3;
      const k = Math.cos(ang);
      if (k < -0.2) continue;
      g.circle(p.x + Math.sin(ang) * r * 0.55, p.y - r * 0.1 + i * r * 0.2 - r * 0.2, r * 0.28 * (0.5 + 0.5 * k)).fill(0x22252b);
    }
    g.circle(p.x, p.y, r).stroke({ width: Math.max(0.6, r * 0.12), color: 0x8a8f96, alpha: 0.6 });
  }
}
