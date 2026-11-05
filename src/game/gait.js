/**
 * ストライド × ピッチ による移動（60Hz 固定ステップ内で計算）
 *
 *   移動速度 = ストライド(1歩の距離 m) × ピッチ(1秒あたりの歩数)
 *
 * - 状態ごとに「目標ストライド・目標ピッチ」を決め、実際の値はそこへ追従する。
 *   ストライドを伸ばすのは 1 歩あたりの上限つき（= 加速）、縮めるのは速い（= 減速）。
 * - 方向転換は接地の瞬間にだけ決まる。1 歩で曲がれる角度はストライドが大きいほど小さい。
 *   → 大股ほど旋回が次の接地まで遅れ、旋回半径も大きい。小刻みほど切り返しが鋭い。
 * - 走りモーションの位相は移動距離で進める（locomotion.js 側）。接地で onContact が呼ばれる。
 *
 * 調整用の数値はすべて GAIT にまとめてある。
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};

// ====================================================================
// 調整用パラメータ（ここ 1 か所）
// ====================================================================
export const GAIT = {
  // 全選手共通の倍率（スマホの TUNE パネルのスライダーで変更）
  global: { strideMul: 1.0, cadenceMul: 1.0 },

  // 選手ごとの基準値の既定（能力値が無いときに使う）
  // baseStride: 通常走行の 1 歩 (m)、baseCadence: 通常走行の歩数/秒 → 1.70 × 3.30 ≒ 5.6 m/s
  profileDefaults: {
    baseStride: 1.70,
    baseCadence: 3.30,
    strideGrowPerStep: 0.14, // 加速: 1 歩で伸ばせるストライド (m)
    turnPerStep: 0.95,       // 敏捷性: 基準ストライドのとき 1 歩で曲がれる角度 (rad)
    touchControl: 1.0,       // ドリブル: タッチの正確さ（将来用）
  },

  // 状態ごとの倍率（基準値に掛ける）。duty = 1 サイクル中の接地時間の割合（見た目用）
  states: {
    jog:         { stride: 0.74, cadence: 0.86, duty: 0.40, label: 'JOG' },
    run:         { stride: 1.00, cadence: 1.00, duty: 0.34, label: 'RUN' },
    dash:        { stride: 1.38, cadence: 1.10, duty: 0.27, label: 'DASH' },
    control:     { stride: 0.55, cadence: 1.20, duty: 0.40, label: 'R2 CONTROL' },
    dribble:     { stride: 0.90, cadence: 1.00, duty: 0.35, label: 'DRIBBLE' },
    dashDribble: { stride: 1.24, cadence: 1.08, duty: 0.28, label: 'DASH DRIBBLE' },
    pressFar:    { stride: 1.20, cadence: 1.04, duty: 0.30, label: 'PRESS (FAR)' },
    pressNear:   { stride: 0.40, cadence: 1.28, duty: 0.42, label: 'PRESS (NEAR)' },
  },

  // スティックを少しだけ倒したときの歩き（倒し量 0..walkBelow で縮める）
  walk: { walkBelow: 0.35, strideMin: 0.45, cadenceMin: 0.6 },
  // ジョグ→通常走行のブレンド（スティック倒し量）
  jogToRun: { from: 0.45, to: 0.9 },

  // 走り出し: 最初の数歩は短く速い歩幅 → 伸ばしてトップスピードへ
  startup: {
    strideCurve: [0.40, 0.56, 0.72, 0.87],   // baseStride に対する上限
    cadenceCurve: [1.24, 1.17, 1.10, 1.04],  // その歩のピッチ倍率
    growPerStep: 0.36,                        // 走り出し中のストライドの伸び (m/歩)
    resetSpeed: 0.9,                          // これ以下に落ちたら次は「走り出し」から
  },

  // 減速・方向転換
  brake: {
    shrinkPerSec: 3.2,   // ストライドを縮める速さ (m/s)
    turnShrink: 0.62,    // 最大の切り返しで次の 1 歩をここまで詰める (1 - 0.62 = 38%)
    crouchBrake: 0.8,    // 減速で重心を下げる量（0..1 → locomotion で約 7cm）
    crouchTurn: 1.0,     // 切り返しで重心を下げる量
    crouchRecover: 4.0,  // 重心が戻る速さ (1/s)
    stopStride: 0.28,    // これ以下で入力なしなら停止
  },

  // 方向転換：1 歩で曲がれる角度 = turnPerStep × (refStride / ストライド)^exp
  turn: { refStride: 1.0, exp: 1.15, min: 0.12, max: 1.9, pivotRate: 11, pivotSpeed: 0.9 },

  // 守備の寄せ（間合いに入ったら小刻みに）
  press: { closeDist: 3.0, hysteresis: 0.3, holdDist: 1.6, approachDecel: 4.5 }, // approachDecel: 間合いへ詰めるときの減速度 (m/s²)

  // ドリブル: タッチは接地イベントで行う
  dribble: {
    touchEvery: { control: 1, dribble: 2, dashDribble: 4, run: 2, jog: 2, dash: 4 }, // 何歩ごとに触るか
    // 次のタッチの瞬間に体の何 m 前にボールが来るよう押し出すか（＝その時の足の届く位置）。
    // 押し出す距離 = 速度 × (touchEvery ÷ ピッチ) + lead → ダッシュは数歩ぶん大きく前へ出る
    lead:       { control: 0.42, dribble: 0.7, dashDribble: 1.35, run: 0.7, jog: 0.6, dash: 1.35 },
    reach: 1.25,       // 接地足（の少し前）からこの距離以内ならタッチできる
    pickup: 0.75,      // ルーズボールを拾える距離
    pickupRelSpeed: 9, // 拾える相対速度 (m/s)
    accelTouchEvery: 2, // 加速中のタッチ間隔の上限（走り出しの数歩は毎歩）
    redirectTurn: 0.25, // この角度(rad)以上曲がる歩はボールの向きを変えるタッチを入れる
    loseDist: 3.6,     // これ以上離れたら保持を失う
  },
};

/**
 * 能力値（将来 32 項目）→ 歩容プロファイル。
 * 今は主要項目だけ使用。値は 1〜99、未指定は 70 扱い。
 * @param {{speed?:number, acceleration?:number, agility?:number, dribbling?:number, balance?:number}} ab
 */
export function makeGaitProfile(ab = {}) {
  const d = GAIT.profileDefaults;
  const n = (k) => ((ab[k] ?? 70) - 70) / 30; // 70 を基準に -2.3..+0.97
  return {
    baseStride: d.baseStride * (1 + 0.06 * n('speed')),
    baseCadence: d.baseCadence * (1 + 0.04 * n('speed') + 0.03 * n('agility')),
    strideGrowPerStep: d.strideGrowPerStep * (1 + 0.35 * n('acceleration')),
    turnPerStep: d.turnPerStep * (1 + 0.25 * n('agility') + 0.1 * n('balance')),
    touchControl: d.touchControl * (1 + 0.3 * n('dribbling')),
  };
}

/** 選手 1 人ぶんの歩容状態 */
export class GaitController {
  constructor(profile = makeGaitProfile()) {
    this.profile = profile;
    this.stride = 0;        // 現在のストライド (m)
    this.cadence = profile.baseCadence; // 現在のピッチ (歩/秒)
    this.strideCmd = 0;     // この歩の目標ストライド
    this.cadenceCmd = profile.baseCadence;
    this.state = 'jog';
    this.stepsSinceStart = 99; // 走り出しから何歩目か
    this.stepCount = 0;
    this.headingTarget = null; // 接地で決まった向き
    this.turnRateCmd = 0;
    this.crouch = 0;           // 0..1 重心の低さ
    this.lastContact = '-';
    this.duty = 0.36;
    this.moving = false;
  }

  /** 状態と入力から、この歩の目標値（倍率反映済み）を返す */
  _targets(ctx) {
    const st = GAIT.states[this.state];
    const P = this.profile, G = GAIT.global;
    let sm = st.stride, cm = st.cadence;
    if (this.state === 'jog' || this.state === 'run') {
      const j = GAIT.states.jog, r = GAIT.states.run;
      const t = smooth01((ctx.mag - GAIT.jogToRun.from) / (GAIT.jogToRun.to - GAIT.jogToRun.from));
      sm = lerp(j.stride, r.stride, t); cm = lerp(j.cadence, r.cadence, t);
    }
    // 守備の寄せは倒し量（AI が出す接近速度）でストライドを詰める
    if (this.state === 'pressFar' || this.state === 'pressNear') sm *= Math.max(0.25, ctx.mag);
    else if (ctx.mag < GAIT.walk.walkBelow) {
      const t = ctx.mag / GAIT.walk.walkBelow;
      sm *= lerp(GAIT.walk.strideMin, 1, t); cm *= lerp(GAIT.walk.cadenceMin, 1, t);
    }
    let S = P.baseStride * sm * G.strideMul;
    let C = P.baseCadence * cm * G.cadenceMul;
    const k = this.stepsSinceStart;
    const su = GAIT.startup;
    if (k < su.strideCurve.length) {
      S = Math.min(S, P.baseStride * su.strideCurve[k] * G.strideMul);
      C *= su.cadenceCurve[k];
    }
    return [S, C];
  }

  /** 状態のトップ速度（倍率反映・走り出し補正なし） */
  fullSpeed(state) {
    const st = GAIT.states[state];
    return this.profile.baseStride * st.stride * GAIT.global.strideMul * this.profile.baseCadence * st.cadence * GAIT.global.cadenceMul;
  }

  /**
   * 状態の決定
   * @param ctx {mag, hasBall, dash, control, press: null|'far'|'near'}
   */
  _pickState(ctx) {
    if (ctx.press) return ctx.press === 'near' ? 'pressNear' : 'pressFar';
    if (ctx.control) return 'control';
    if (ctx.dash) return ctx.hasBall ? 'dashDribble' : 'dash';
    if (ctx.hasBall) return 'dribble';
    return ctx.mag < (GAIT.jogToRun.from + GAIT.jogToRun.to) / 2 ? 'jog' : 'run';
  }

  /** 毎ステップ: 連続的な追従（ストライド・ピッチ・向き） */
  update(p, ctx, dt) {
    this.state = this._pickState(ctx);
    this.duty = GAIT.states[this.state].duty;
    const want = ctx.mag > 0.05 ? Math.atan2(ctx.iy, ctx.ix) : null;
    const speed = this.stride * this.cadence;

    // 停止中・極低速はその場で向きを変える（ピボット）
    if (speed < GAIT.turn.pivotSpeed) {
      const face = want ?? ctx.face;
      if (face != null) {
        const d = angDiff(p.heading, face);
        p.heading += clamp(d, -GAIT.turn.pivotRate * dt, GAIT.turn.pivotRate * dt);
      }
      this.headingTarget = null;
    } else if (this.headingTarget != null) {
      // 接地で決めた向きへ、その歩の前半で向き直る
      const d = angDiff(p.heading, this.headingTarget);
      const stepT = 1 / Math.max(this.cadence, 0.5);
      const rate = Math.max(Math.abs(d) / (stepT * 0.5), 0.5);
      p.heading += clamp(d, -rate * dt, rate * dt);
    }
    p.heading = Math.atan2(Math.sin(p.heading), Math.cos(p.heading));

    // 目標値
    if (ctx.mag > 0.05) {
      const [S, C] = this._targets(ctx);
      // 接地間でも、目標が今の歩の目標より小さい（減速）ならすぐ反映
      this.strideCmd = Math.min(this.strideCmd || S, S);
      this.cadenceCmd = C;
      if (!this.moving) {
        // 1 歩目の踏み出し
        this.moving = true;
        if (this.stepsSinceStart >= GAIT.startup.strideCurve.length && speed < GAIT.startup.resetSpeed) this.stepsSinceStart = 0;
        const [S0, C0] = this._targets(ctx);
        this.strideCmd = S0; this.cadenceCmd = C0;
        if (this.stride < 0.3) { this.stride = 0.3; this.cadence = C0; }
      }
    } else {
      this.strideCmd = 0;
      this.cadenceCmd = this.profile.baseCadence * 0.75;
    }

    // ストライド: 伸ばすのは 1 歩あたり上限、縮めるのは速い
    const ds = this.strideCmd - this.stride;
    if (ds > 0) {
      const grow = this.stepsSinceStart < GAIT.startup.strideCurve.length ? GAIT.startup.growPerStep : this.profile.strideGrowPerStep;
      this.stride += Math.min(ds, grow * this.cadence * dt);
    } else {
      this.stride += Math.max(ds, -GAIT.brake.shrinkPerSec * dt);
      if (ctx.mag > 0.05 && ds < -0.05) this.crouch = Math.min(1, this.crouch + GAIT.brake.crouchBrake * 4 * dt);
    }
    this.cadence += (this.cadenceCmd - this.cadence) * (1 - Math.exp(-dt / 0.12));

    if (ctx.mag <= 0.05 && this.stride < GAIT.brake.stopStride) {
      this.stride = 0;
      this.moving = false;
    }
    if (this.stride * this.cadence < GAIT.startup.resetSpeed && ctx.mag <= 0.05) this.stepsSinceStart = 99;
    this.crouch = Math.max(0, this.crouch - GAIT.brake.crouchRecover * dt * 0.5);
    this._want = want;
    this._ctx = ctx;
    return this.stride * this.cadence;
  }

  /** 接地イベント: 向き・次の歩の目標を決める */
  onContact(p, side) {
    this.lastContact = side < 0 ? 'L' : 'R';
    this.stepCount++;
    if (this.moving) this.stepsSinceStart = Math.min(this.stepsSinceStart + 1, 99);
    const ctx = this._ctx;
    if (!ctx || ctx.mag <= 0.05) return;
    const [S, C] = this._targets(ctx);
    this.strideCmd = S;
    this.cadenceCmd = C;
    const want = this._want;
    if (want == null) return;
    // 1 歩で曲がれる角度（ストライドが大きいほど小さい）
    const T = GAIT.turn;
    const maxTurn = clamp(this.profile.turnPerStep * Math.pow(T.refStride / Math.max(this.stride, 0.3), T.exp), T.min, T.max);
    const diff = angDiff(p.heading, want);
    const turn = clamp(diff, -maxTurn, maxTurn);
    this.headingTarget = p.heading + turn;
    // 曲がり切れない（急な切り返し）ほど次の歩を詰めて重心を下げる
    const sev = clamp((Math.abs(diff) - maxTurn * 0.6) / (Math.PI * 0.65), 0, 1);
    if (sev > 0) {
      this.strideCmd *= 1 - GAIT.brake.turnShrink * sev;
      this.crouch = Math.min(1, this.crouch + GAIT.brake.crouchTurn * sev);
    }
  }
}
