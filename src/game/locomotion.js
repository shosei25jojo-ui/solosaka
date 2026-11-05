import { J, JOINT_COUNT, BODY } from './skeleton.js';

/**
 * 手続き型の走行モーション（3D 骨格を毎ステップ解く）
 *
 * - 位相ベースの歩行/走行サイクル。速度からケイデンス・デューティ比（接地率）・
 *   遊脚の高さを連続的に決め、歩き→ジョグ→スプリントを滑らかにブレンド。
 * - 接地中の足はワールドに固定（足滑りなし）。遊脚は離地点から「着地予測点」へ
 *   遅れ気味に追従させることで、走りのヒールキック → ニードライブ → 振り戻しが自然に出る。
 * - 膝は 2 ボーン IK、骨盤高さは届く範囲にクランプ。
 * - 骨盤の上下動・左右揺れ・回旋、胴の逆回旋、加速前傾、旋回時の内傾、腕振り（肘角の変化）。
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, v) => smooth(clamp((v - a) / (b - a), 0, 1));
const frac = (v) => v - Math.floor(v);
const angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};

function makeLeg(side) {
  return {
    side,               // -1 = 左, +1 = 右
    stance: true,
    pos: [0, 0, BODY.ankleH], // 足首のワールド位置
    dir: 0,             // 足の向き
    lift: [0, 0, BODY.ankleH],
    liftRel: [0, 0],
    liftDir: 0,
    liftDuty: 0.5,
    prevPi: 0,
    s: 0,               // 遊脚の進行度 0..1
    pitch: 0.2,         // つま先の下向き角
    heelRise: 0,
  };
}

export class Locomotion {
  constructor() {
    this.phase = 0;
    this.legs = [makeLeg(-1), makeLeg(1)];
    this.lean = 0;
    this.sideLean = 0;
    this.activity = 0;  // 0: 静止 1: 移動中
    this.time = 0;
    this.joints = new Float32Array(JOINT_COUNT * 3);
    this.prevJoints = new Float32Array(JOINT_COUNT * 3);
    this.gait = { r: 0, s: 0, freq: 0, duty: 0.6 };
  }

  reset(p) {
    const fx = Math.cos(p.heading), fy = Math.sin(p.heading);
    const rx = -fy, ry = fx;
    for (const leg of this.legs) {
      leg.stance = true;
      leg.pos[0] = p.x + rx * leg.side * 0.11;
      leg.pos[1] = p.y + ry * leg.side * 0.11;
      leg.pos[2] = BODY.ankleH;
      leg.dir = p.heading;
    }
    this.update(p, 1 / 60);
    this.prevJoints.set(this.joints);
  }

  update(p, dt) {
    this.prevJoints.set(this.joints);
    this.time += dt;
    const v = p.speed;
    const th = p.heading;
    const fx = Math.cos(th), fy = Math.sin(th);
    const rx = -fy, ry = fx;
    const ctrl = p.mode === 'control' ? 1 : 0;

    // ---- 歩容パラメータ ----
    const r = smoothstep(1.7, 3.1, v);        // 歩き→走り
    const s = smoothstep(5.4, 8.4, v);        // ジョグ→スプリント
    const fWalk = 0.55 + 0.27 * Math.max(v, 0.9);
    const fRun = 1.02 + 0.122 * v;
    const freq = lerp(fWalk, fRun, r) * (1 + 0.14 * ctrl);
    const duty = lerp(0.62, lerp(0.38, 0.26, s), r);
    const swingH = lerp(0.07 + 0.03 * Math.min(v, 1.5), 0.27 + 0.27 * s, r) * (1 - 0.35 * ctrl);
    const width = lerp(0.105, lerp(0.06, 0.045, s), r);
    this.gait.r = r; this.gait.s = s; this.gait.freq = freq; this.gait.duty = duty;

    // 足の休止位置からのズレ（その場旋回・停止時の足踏みに使う）
    let restErr = 0;
    for (const leg of this.legs) {
      if (!leg.stance) continue;
      const tx = p.x + rx * leg.side * 0.11, ty = p.y + ry * leg.side * 0.11;
      const e = Math.hypot(leg.pos[0] - tx, leg.pos[1] - ty) + Math.abs(angDiff(leg.dir, th)) * 0.12;
      if (e > restErr) restErr = e;
    }
    const anySwing = !this.legs[0].stance || !this.legs[1].stance;
    const moving = v > 0.22;
    if (moving || anySwing || restErr > 0.13) this.phase = frac(this.phase + freq * dt);
    const act = smoothstep(0.15, 1.2, v);
    this.activity += (act - this.activity) * (1 - Math.exp(-dt * 8));
    const g = this.activity;

    // ---- 脚：接地/遊脚の状態遷移と足首位置 ----
    const tStance = duty / freq;
    for (const leg of this.legs) {
      const pi = frac(this.phase + (leg.side > 0 ? 0.5 : 0));
      const wrapped = pi < leg.prevPi - 0.5;
      if (leg.stance && pi >= duty && !wrapped) {
        leg.stance = false;
        leg.lift[0] = leg.pos[0]; leg.lift[1] = leg.pos[1]; leg.lift[2] = leg.pos[2];
        leg.liftDir = leg.dir;
        leg.liftDuty = duty;
        leg.liftRel[0] = leg.pos[0] - p.x;
        leg.liftRel[1] = leg.pos[1] - p.y;
        leg.liftPitch = leg.pitch;
      } else if (!leg.stance && wrapped) {
        leg.stance = true;
        leg.pos[2] = BODY.ankleH;
        leg.heelRise = 0;
      }
      leg.prevPi = pi;

      if (leg.stance) {
        // 接地：位置固定。後半でかかとが上がり（蹴り出し）、つま先を支点に回る
        const t = clamp(pi / Math.max(duty, 0.01), 0, 1);
        const hr = smoothstep(0.5, 1.0, t) * lerp(0.035, 0.13, r) * g;
        leg.heelRise = hr;
        leg.pos[2] = BODY.ankleH + hr;
        leg.pitch = Math.asin(clamp((leg.pos[2] - 0.028) / BODY.foot, -0.5, 0.99));
        // 歩きの接地直後はつま先が少し上がる（ヒールストライク）
        if (r < 0.5) leg.pitch -= (1 - r * 2) * 0.28 * (1 - smoothstep(0, 0.25, t)) * g;
        leg.s = 0;
      } else {
        const sw = clamp((pi - leg.liftDuty) / Math.max(1 - leg.liftDuty, 0.05), 0, 1);
        leg.s = sw;
        // 遊脚は「骨盤の真下」を基準にした相対軌道で動かす：
        //   離地(後方) → かかとを尻へ引き上げ(ヒールキック) → 膝を前へ(ニードライブ)
        //   → 下腿を前へ振り出し → 着地直前に少し引き戻す(パウイング)
        const lead = 0.36 * tStance;
        // 着地時の相対位置（進行方向へ lead 秒ぶん前 + 横幅）
        const landX = p.vx * lead + rx * leg.side * width;
        const landY = p.vy * lead + ry * leg.side * width;
        const e = lerp(smooth(sw), 0.55 * sw + 0.45 * smooth(sw), r);
        let relX = leg.liftRel[0] + (landX - leg.liftRel[0]) * e;
        let relY = leg.liftRel[1] + (landY - leg.liftRel[1]) * e;
        // パウイング：最後の 30% で前へ出し過ぎた足を後ろへ引く
        const paw = r * 0.09 * (0.5 + 0.5 * s) * Math.sin(Math.PI * clamp((sw - 0.55) / 0.45, 0, 1));
        relX += fx * paw; relY += fy * paw;
        leg.pos[0] = p.x + relX;
        leg.pos[1] = p.y + relY;
        const k = lerp(1.0, 0.62, r);
        const bump = Math.sin(Math.PI * Math.pow(sw, k));
        leg.pos[2] = lerp(leg.lift[2], BODY.ankleH, smooth(sw)) + swingH * bump;
        leg.dir = leg.liftDir + angDiff(leg.liftDir, th + leg.side * 0.07) * smooth(sw);
        // つま先：離地直後は下向き → 着地前に戻す（歩きはつま先を上げる）
        const endPitch = lerp(-0.12, 0.18, r);
        const midPitch = lerp(0.35, 0.95 + 0.15 * s, r);
        leg.pitch = sw < 0.25
          ? lerp(leg.liftPitch ?? 0.4, midPitch, smooth(sw / 0.25))
          : lerp(midPitch, endPitch, smoothstep(0.25, 0.95, sw));
      }
    }

    // ---- 骨盤 ----
    const lf = Math.cos(TAU * (this.phase - (duty / 2 - 0.25))); // 左脚の前後量 (+1 = 最前)
    const bobPh = Math.cos(2 * TAU * (this.phase - duty / 2));     // 接地中盤で +1
    const bob = lerp(0.016, -0.034 - 0.012 * s, r) * bobPh * g;
    const baseZ = lerp(BODY.standHipZ, lerp(0.905, 0.885, s), r) - 0.035 * ctrl
      + Math.sin(this.time * 1.7) * 0.003 * (1 - g); // 呼吸
    const sway = lerp(0.022, 0.008, r) * Math.cos(TAU * (this.phase - duty / 2)) * g; // 支持脚側へ
    let cx = p.x - rx * sway;
    let cy = p.y - ry * sway;
    let cz = baseZ + bob;

    // 前傾・内傾（スプリング）
    const leanT = g * (0.035 + 0.05 * r + 0.11 * s) + clamp(p.accelFwd * 0.032, -0.2, 0.26) + 0.1 * ctrl;
    this.lean += (leanT - this.lean) * (1 - Math.exp(-dt / 0.14));
    const sideT = clamp(Math.atan((v * p.turnRate) / 9.81) * 0.9, -0.38, 0.38);
    this.sideLean += (sideT - this.sideLean) * (1 - Math.exp(-dt / 0.1));
    // 内傾時は体の重心が内側へ
    cx += rx * Math.sin(this.sideLean) * 0.12;
    cy += ry * Math.sin(this.sideLean) * 0.12;

    const hipYaw = g * lerp(0.022, 0.034, r);  // 遊脚側の骨盤が前へ
    const L = this.legs;
    const hips = [
      [cx - rx * BODY.hipHalf + fx * hipYaw * lf, cy - ry * BODY.hipHalf + fy * hipYaw * lf],
      [cx + rx * BODY.hipHalf - fx * hipYaw * lf, cy + ry * BODY.hipHalf - fy * hipYaw * lf],
    ];
    // 接地脚に届く高さまで骨盤を下げる
    const reach = (BODY.thigh + BODY.shin) * 0.992;
    for (let i = 0; i < 2; i++) {
      if (!L[i].stance) continue;
      const dh = Math.hypot(L[i].pos[0] - hips[i][0], L[i].pos[1] - hips[i][1]);
      const maxZ = L[i].pos[2] + Math.sqrt(Math.max(0.01, reach * reach - dh * dh));
      if (cz > maxZ) cz = maxZ;
    }
    // 側傾に合わせて左右の股関節の高さも変える
    const hipTilt = Math.sin(this.sideLean) * BODY.hipHalf * 0.8;

    const jt = this.joints;
    const set = (j, x, y, z) => { jt[j * 3] = x; jt[j * 3 + 1] = y; jt[j * 3 + 2] = z; };
    set(J.PELVIS, cx, cy, cz);
    set(J.L_HIP, hips[0][0], hips[0][1], cz + hipTilt);
    set(J.R_HIP, hips[1][0], hips[1][1], cz - hipTilt);

    // ---- 脚 IK ----
    for (let i = 0; i < 2; i++) {
      const leg = L[i];
      const hj = i === 0 ? J.L_HIP : J.R_HIP;
      const hx = jt[hj * 3], hy = jt[hj * 3 + 1], hz = jt[hj * 3 + 2];
      let ax = leg.pos[0], ay = leg.pos[1], az = leg.pos[2];
      let dx = ax - hx, dy = ay - hy, dz = az - hz;
      let d = Math.hypot(dx, dy, dz);
      const maxD = (BODY.thigh + BODY.shin) * 0.999;
      if (d > maxD) { // 届かなければ足首を股関節側へ寄せる
        const k = maxD / d;
        dx *= k; dy *= k; dz *= k; d = maxD;
        ax = hx + dx; ay = hy + dy; az = hz + dz;
      }
      d = Math.max(d, 0.12);
      const ux = dx / d, uy = dy / d, uz = dz / d;
      const a = (BODY.thigh * BODY.thigh - BODY.shin * BODY.shin + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, BODY.thigh * BODY.thigh - a * a));
      // 膝の向き：体の前方（わずかに外向き）
      let px = fx + rx * leg.side * 0.12, py = fy + ry * leg.side * 0.12, pz = 0;
      const dp = px * ux + py * uy + pz * uz;
      px -= ux * dp; py -= uy * dp; pz -= uz * dp;
      const pl = Math.hypot(px, py, pz) || 1;
      px /= pl; py /= pl; pz /= pl;
      const kj = i === 0 ? J.L_KN : J.R_KN;
      set(kj, hx + ux * a + px * h, hy + uy * a + py * h, hz + uz * a + pz * h);
      const aj = i === 0 ? J.L_AN : J.R_AN;
      set(aj, ax, ay, az);
      // つま先・かかと
      const dfx = Math.cos(leg.dir), dfy = Math.sin(leg.dir);
      const cp = Math.cos(leg.pitch), sp = Math.sin(leg.pitch);
      const tj = i === 0 ? J.L_TO : J.R_TO;
      set(tj, ax + dfx * cp * BODY.foot, ay + dfy * cp * BODY.foot, Math.max(0.02, az - sp * BODY.foot));
      const hej = i === 0 ? J.L_HE : J.R_HE;
      set(hej, ax - dfx * cp * BODY.heel, ay - dfy * cp * BODY.heel, Math.max(0.02, az - 0.045 + sp * BODY.heel));
    }

    // ---- 胴体 ----
    const cl = Math.cos(this.lean), sl = Math.sin(this.lean);
    const cs = Math.cos(this.sideLean), ss = Math.sin(this.sideLean);
    // 胴の上方向ベクトル
    let ux = fx * sl + rx * ss, uy = fy * sl + ry * ss, uz = cl * cs;
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    // 胴の前方向（上方向に直交化）
    let tfx = fx, tfy = fy, tfz = 0;
    let dp = tfx * ux + tfy * uy + tfz * uz;
    tfx -= ux * dp; tfy -= uy * dp; tfz -= uz * dp;
    let tl = Math.hypot(tfx, tfy, tfz); tfx /= tl; tfy /= tl; tfz /= tl;
    // 胴の右方向
    let trx = rx, try_ = ry, trz = 0;
    dp = trx * ux + try_ * uy; trx -= ux * dp; try_ -= uy * dp; trz -= uz * dp;
    dp = trx * tfx + try_ * tfy + trz * tfz; trx -= tfx * dp; try_ -= tfy * dp; trz -= tfz * dp;
    tl = Math.hypot(trx, try_, trz); trx /= tl; try_ /= tl; trz /= tl;

    const breath = Math.sin(this.time * 1.7) * 0.004 * (1 - g);
    const spine = BODY.spine - 0.015 * r + breath;
    const chx = cx + ux * spine, chy = cy + uy * spine, chz = cz + uz * spine;
    set(J.CHEST, chx, chy, chz);
    // 肩：骨盤と逆回旋
    const shYaw = g * lerp(0.026, 0.045 + 0.02 * s, r);
    for (const sd of [-1, 1]) {
      const fo = -sd * -shYaw * lf; // 左肩(sd=-1)は左脚が前のとき後ろへ
      const j = sd < 0 ? J.L_SH : J.R_SH;
      set(j,
        chx + trx * sd * BODY.shoulderHalf + tfx * fo - ux * 0.02,
        chy + try_ * sd * BODY.shoulderHalf + tfy * fo - uy * 0.02,
        chz + trz * sd * BODY.shoulderHalf + tfz * fo - uz * 0.02);
      const w = sd < 0 ? J.L_WA : J.R_WA;
      set(w,
        cx + ux * 0.16 + trx * sd * BODY.waistHalf,
        cy + uy * 0.16 + try_ * sd * BODY.waistHalf,
        cz + uz * 0.16 + trz * sd * BODY.waistHalf);
    }
    // 首・頭（頭は胴ほど傾けず視線を水平に保つ）
    const hl = this.lean * 0.35, hs = this.sideLean * 0.4;
    let hux = fx * Math.sin(hl) + rx * Math.sin(hs), huy = fy * Math.sin(hl) + ry * Math.sin(hs), huz = Math.cos(hl) * Math.cos(hs);
    const hul = Math.hypot(hux, huy, huz); hux /= hul; huy /= hul; huz /= hul;
    const nx = chx + ux * 0.03, ny = chy + uy * 0.03, nz = chz + uz * 0.03;
    set(J.NECK, nx + hux * BODY.neck, ny + huy * BODY.neck, nz + huz * BODY.neck);
    const hr = BODY.neck + BODY.headR * 0.95;
    set(J.HEAD, nx + hux * hr + fx * 0.025, ny + huy * hr + fy * 0.025, nz + huz * hr);

    // ---- 腕 ----
    const swingAmp = g * lerp(0.32, lerp(0.55, 0.85, s), r) * (1 - 0.45 * ctrl);
    const flexBase = lerp(0.22 + 0.12 * g, lerp(1.32, 1.5, s), r);
    for (const sd of [-1, 1]) {
      const legF = sd < 0 ? lf : -lf;              // 同側の脚の前後
      const swing = -legF;                          // 腕は反対
      const alpha = 0.06 + 0.06 * r + swingAmp * swing;
      const flex = clamp(flexBase + r * (0.3 * s + 0.12) * swing, 0.1, 2.0);
      const sh = sd < 0 ? J.L_SH : J.R_SH;
      const sx = jt[sh * 3], sy = jt[sh * 3 + 1], sz = jt[sh * 3 + 2];
      const abd = 0.13 + 0.06 * r;
      // 上腕方向 = 下向きを前方へ alpha 回転 + 外転
      let ax = -ux * Math.cos(alpha) + tfx * Math.sin(alpha) + trx * sd * Math.sin(abd);
      let ay = -uy * Math.cos(alpha) + tfy * Math.sin(alpha) + try_ * sd * Math.sin(abd);
      let az = -uz * Math.cos(alpha) + tfz * Math.sin(alpha) + trz * sd * Math.sin(abd);
      let al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
      const ex = sx + ax * BODY.upperArm, ey = sy + ay * BODY.upperArm, ez = sz + az * BODY.upperArm;
      set(sd < 0 ? J.L_EL : J.R_EL, ex, ey, ez);
      const beta = Math.min(alpha + flex, 2.35);
      const inward = 0.1 + 0.22 * r;
      let bx = -ux * Math.cos(beta) + tfx * Math.sin(beta) - trx * sd * inward;
      let by = -uy * Math.cos(beta) + tfy * Math.sin(beta) - try_ * sd * inward;
      let bz = -uz * Math.cos(beta) + tfz * Math.sin(beta) - trz * sd * inward;
      al = Math.hypot(bx, by, bz); bx /= al; by /= al; bz /= al;
      set(sd < 0 ? J.L_HA : J.R_HA, ex + bx * BODY.foreArm, ey + by * BODY.foreArm, ez + bz * BODY.foreArm);
    }
  }
}
