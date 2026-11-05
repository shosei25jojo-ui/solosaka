import { GAIT } from '../game/gait.js';

/**
 * スマホ用の調整パネル（TUNE ボタンで開閉）
 * ストライド倍率・ピッチ倍率のスライダー、ボール/守備役/デバッグ表示の ON/OFF。
 */
export class TunePanel {
  constructor({ onToggle } = {}) {
    this.onToggle = onToggle || (() => {});
    const el = document.createElement('div');
    el.id = 'tune';
    el.innerHTML = `
      <div class="row"><label>ストライド倍率 <b id="tv-s">1.00</b></label>
        <input id="tr-s" type="range" min="0.5" max="1.6" step="0.01" value="1"></div>
      <div class="row"><label>ピッチ倍率 <b id="tv-c">1.00</b></label>
        <input id="tr-c" type="range" min="0.5" max="1.6" step="0.01" value="1"></div>
      <div class="row btns">
        <button id="tb-reset" type="button">倍率リセット</button>
        <button id="tb-ball" type="button" class="on">ボール</button>
        <button id="tb-def" type="button" class="on">守備役</button>
        <button id="tb-dbg" type="button" class="on">DEBUG表示</button>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    const s = el.querySelector('#tr-s'), c = el.querySelector('#tr-c');
    const vs = el.querySelector('#tv-s'), vc = el.querySelector('#tv-c');
    const sync = () => {
      GAIT.global.strideMul = +s.value; GAIT.global.cadenceMul = +c.value;
      vs.textContent = (+s.value).toFixed(2); vc.textContent = (+c.value).toFixed(2);
    };
    s.addEventListener('input', sync); c.addEventListener('input', sync);
    el.querySelector('#tb-reset').addEventListener('click', () => { s.value = 1; c.value = 1; sync(); });
    for (const [id, key] of [['#tb-ball', 'ball'], ['#tb-def', 'defender'], ['#tb-dbg', 'debug']]) {
      const b = el.querySelector(id);
      b.addEventListener('click', () => { b.classList.toggle('on'); this.onToggle(key, b.classList.contains('on')); });
    }
    // パネル上のタッチがゲーム操作に漏れないように
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation());
  }

  toggle() { this.el.classList.toggle('open'); return this.el.classList.contains('open'); }
}
