import { MOVE } from '../config.js';

/**
 * 入力の統合（キーボード / ゲームパッド(DualSense 等 standard mapping) / タッチ）
 *
 * ボタン割り当て（standard mapping）
 *   0 × ショートパス   1 ○ ロングパス   2 □ シュート   3 △ スルーパス
 *   4 L1 カーソルチェンジ   5 R1 ダッシュ   7 R2 コントロールドリブル
 *   左スティック(axes 0,1) 移動   右スティック(axes 2,3) 手動カーソル切替
 */
export const ACTIONS = ['shortPass', 'longPass', 'shoot', 'throughPass', 'switchCursor', 'dash', 'control'];
const PAD_BUTTON = { shortPass: 0, longPass: 1, shoot: 2, throughPass: 3, switchCursor: 4, dash: 5, control: 7 };
const KEY_BUTTON = {
  shortPass: ['KeyJ'], longPass: ['KeyL'], shoot: ['KeyK'], throughPass: ['KeyI'],
  switchCursor: ['KeyQ'], dash: ['ShiftLeft', 'ShiftRight'], control: ['KeyE', 'ControlLeft'],
};

function deadzone(x, y, dz) {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * k, y * k];
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { moveX: 0, moveY: 0, dash: false, control: false, active: false };
    this.state = {
      moveX: 0, moveY: 0, rightX: 0, rightY: 0,
      dash: false, control: false,
    };
    this.pressed = {};
    this.justPressed = {};
    for (const a of ACTIONS) { this.pressed[a] = false; this.justPressed[a] = false; }
    this.source = 'keyboard';
    this.padName = '';
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      this.source = 'keyboard';
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** 固定ステップごとに呼ぶ */
  poll() {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    const km = Math.hypot(mx, my);
    if (km > 0) { mx /= km; my /= km; }
    let rx = 0, ry = 0;
    const btn = {};
    for (const a of ACTIONS) btn[a] = KEY_BUTTON[a].some((c) => k.has(c));

    // ゲームパッド
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const [lx, ly] = deadzone(pad.axes[0] || 0, pad.axes[1] || 0, MOVE.stickDeadZone);
      const [sx, sy] = deadzone(pad.axes[2] || 0, pad.axes[3] || 0, 0.3);
      let used = false;
      if (lx || ly) { mx = lx; my = ly; used = true; }
      if (sx || sy) { rx = sx; ry = sy; used = true; }
      // 十字キーでも移動
      const b = pad.buttons;
      if (b[12]?.pressed || b[13]?.pressed || b[14]?.pressed || b[15]?.pressed) {
        let dx = (b[15]?.pressed ? 1 : 0) - (b[14]?.pressed ? 1 : 0);
        let dy = (b[13]?.pressed ? 1 : 0) - (b[12]?.pressed ? 1 : 0);
        const dm = Math.hypot(dx, dy) || 1;
        mx = dx / dm; my = dy / dm; used = true;
      }
      for (const a of ACTIONS) {
        const bt = b[PAD_BUTTON[a]];
        if (!bt) continue;
        const on = bt.pressed || bt.value > 0.3;
        if (on) used = true;
        btn[a] = btn[a] || on;
      }
      if (used) { this.source = 'gamepad'; this.padName = pad.id; }
      break;
    }

    // タッチ（仮想スティック + DASH）
    const t = this.touch;
    if (t.active || t.dash || t.control) this.source = 'touch';
    if (t.moveX || t.moveY) { mx = t.moveX; my = t.moveY; }
    if (t.dash) btn.dash = true;
    if (t.control) btn.control = true;

    if (this.override) { // 開発・テスト用
      mx = this.override.moveX ?? mx; my = this.override.moveY ?? my;
      btn.dash = this.override.dash ?? btn.dash; btn.control = this.override.control ?? btn.control;
    }
    for (const a of ACTIONS) {
      this.justPressed[a] = btn[a] && !this.pressed[a];
      this.pressed[a] = btn[a];
    }
    const s = this.state;
    s.moveX = mx; s.moveY = my; s.rightX = rx; s.rightY = ry;
    s.dash = btn.dash; s.control = btn.control;
    return s;
  }
}
