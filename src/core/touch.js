/**
 * スマホ用：フローティング仮想スティック（画面左半分）＋ DASH ボタン（右下）
 * DOM で描画し、Pointer Events のマルチタッチで操作する。
 */
export class TouchControls {
  constructor(input) {
    this.input = input;
    this.layer = document.getElementById('touch-layer');
    this.base = el('div', 'stick-base');
    this.knob = el('div', 'stick-knob');
    this.base.appendChild(this.knob);
    this.dashBtn = el('div', 'touch-btn');
    this.dashBtn.textContent = 'DASH';
    // R2 コントロールドリブル（ストライド×ピッチの確認用）
    this.ctrlBtn = el('div', 'touch-btn small');
    this.ctrlBtn.textContent = 'R2';
    this.layer.append(this.base, this.dashBtn, this.ctrlBtn);
    this.stickId = null;
    this.dashId = null;
    this.ctrlId = null;
    this.origin = { x: 0, y: 0 };
    this.layout();
    window.addEventListener('resize', () => this.layout());

    const enable = () => this.enable();
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) this.enable();
    window.addEventListener('touchstart', enable, { once: true, passive: true });

    const L = this.layer;
    L.addEventListener('pointerdown', (e) => this.down(e));
    L.addEventListener('pointermove', (e) => this.move(e));
    L.addEventListener('pointerup', (e) => this.up(e));
    L.addEventListener('pointercancel', (e) => this.up(e));
    L.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  enable() { this.layer.classList.add('on'); }

  layout() {
    const w = window.innerWidth, h = window.innerHeight;
    this.size = Math.max(110, Math.min(170, h * 0.36));
    this.radius = this.size * 0.42;
    this.base.style.width = this.base.style.height = this.size + 'px';
    this.base.style.margin = `${-this.size / 2}px 0 0 ${-this.size / 2}px`;
    this.home = { x: Math.max(this.size * 0.75, w * 0.12), y: h - this.size * 0.78 };
    const bs = Math.max(84, Math.min(120, h * 0.24));
    this.dashBtn.style.width = this.dashBtn.style.height = bs + 'px';
    this.dashBtn.style.margin = `${-bs / 2}px 0 0 ${-bs / 2}px`;
    this.dashPos = { x: w - Math.max(bs * 0.9, w * 0.1), y: h - bs * 0.95, r: bs * 0.75 };
    this.dashBtn.style.left = this.dashPos.x + 'px';
    this.dashBtn.style.top = this.dashPos.y + 'px';
    const cs = bs * 0.72;
    this.ctrlBtn.style.width = this.ctrlBtn.style.height = cs + 'px';
    this.ctrlBtn.style.margin = `${-cs / 2}px 0 0 ${-cs / 2}px`;
    this.ctrlPos = { x: this.dashPos.x - bs * 1.15, y: this.dashPos.y + bs * 0.12, r: cs * 0.6 };
    this.ctrlBtn.style.left = this.ctrlPos.x + 'px';
    this.ctrlBtn.style.top = this.ctrlPos.y + 'px';
    if (this.stickId === null) this.placeBase(this.home.x, this.home.y);
  }

  placeBase(x, y) {
    this.origin.x = x; this.origin.y = y;
    this.base.style.left = x + 'px';
    this.base.style.top = y + 'px';
    this.knob.style.transform = 'translate(0px, 0px)';
  }

  down(e) {
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    const dp = this.dashPos, cp = this.ctrlPos;
    if (Math.hypot(x - cp.x, y - cp.y) < cp.r * 1.2) {
      if (this.ctrlId === null) {
        this.ctrlId = e.pointerId;
        this.input.touch.control = true;
        this.ctrlBtn.classList.add('active');
      }
    } else if (Math.hypot(x - dp.x, y - dp.y) < dp.r * 1.25 || (x > window.innerWidth * 0.6 && y > window.innerHeight * 0.45)) {
      if (this.dashId === null) {
        this.dashId = e.pointerId;
        this.input.touch.dash = true;
        this.dashBtn.classList.add('active');
      }
    } else if (x < window.innerWidth * 0.55 && this.stickId === null) {
      this.stickId = e.pointerId;
      const m = this.size / 2;
      this.placeBase(Math.max(m, x), Math.min(window.innerHeight - m, Math.max(m, y)));
      this.base.classList.add('active');
      this.input.touch.active = true;
      this.move(e);
    }
    try { this.layer.setPointerCapture(e.pointerId); } catch { /* noop */ }
  }

  move(e) {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
    const m = Math.hypot(dx, dy);
    const R = this.radius;
    // 大きく引っ張ったらスティック基点が指についてくる
    if (m > R * 1.6) {
      const k = (m - R * 1.6) / m;
      this.placeBase(this.origin.x + dx * k, this.origin.y + dy * k);
      dx = e.clientX - this.origin.x; dy = e.clientY - this.origin.y;
    }
    const mm = Math.hypot(dx, dy);
    const cl = Math.min(mm, R);
    const kx = mm > 0 ? (dx / mm) * cl : 0, ky = mm > 0 ? (dy / mm) * cl : 0;
    this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
    // 小さなデッドゾーン + 少し早めに最大入力へ
    let v = cl / R;
    v = v < 0.1 ? 0 : Math.min(1, (v - 0.1) / 0.8);
    this.input.touch.moveX = mm > 0 ? (dx / mm) * v : 0;
    this.input.touch.moveY = mm > 0 ? (dy / mm) * v : 0;
  }

  up(e) {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.input.touch.moveX = this.input.touch.moveY = 0;
      this.input.touch.active = false;
      this.base.classList.remove('active');
      this.placeBase(this.home.x, this.home.y);
    }
    if (e.pointerId === this.ctrlId) {
      this.ctrlId = null;
      this.input.touch.control = false;
      this.ctrlBtn.classList.remove('active');
    }
    if (e.pointerId === this.dashId) {
      this.dashId = null;
      this.input.touch.dash = false;
      this.dashBtn.classList.remove('active');
    }
  }
}

function el(tag, cls) {
  const d = document.createElement(tag);
  d.className = cls;
  return d;
}
