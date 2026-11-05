// ゲーム全体の定数。単位は特記なき限り メートル / 秒 / ラジアン。

export const VIEW_W = 1280;
export const VIEW_H = 720;

export const SIM_HZ = 60;
export const DT = 1 / SIM_HZ;
export const MAX_STEPS_PER_FRAME = 5;

// FIFA 標準ピッチ 105 x 68
export const PITCH = {
  length: 105,
  width: 68,
  halfL: 52.5,
  halfW: 34,
  lineW: 0.12,
  centerCircleR: 9.15,
  penaltyDepth: 16.5,
  penaltyHalfW: 20.16,
  goalAreaDepth: 5.5,
  goalAreaHalfW: 9.16,
  penaltySpot: 11,
  goalHalfW: 3.66,
  goalH: 2.44,
  goalDepth: 2.0,
};

export const MATCH = {
  playersPerSide: 11,
  halfMinutes: 3, // 仮
};

// 選手の移動性能
export const MOVE = {
  jogSpeed: 5.6,      // 通常走 (m/s) ≒ 20 km/h
  dashSpeed: 8.4,     // R1 ダッシュ ≒ 30 km/h
  controlSpeed: 3.3,  // R2 コントロールドリブル
  accel: 7.0,         // 加速の強さ（速度が上がるほど減衰）
  accelTopRef: 10.5,  // a = accel * (1 - v / accelTopRef)
  brake: 9.0,         // 減速（制動）
  coast: 6.0,         // 入力を離したときの減速
  stickDeadZone: 0.15,
};

// カメラ（斜め俯瞰・ボール追従）
export const CAMERA = {
  pitchDeg: 31,      // 見下ろし角
  dist: 64,          // 注視点までの距離（望遠気味＝中継カメラ風のゆるいパース）
  distSpeedGain: 0.5, // 速度に応じて少し引く
  viewWidthAtTarget: 27, // 注視点での画面横幅 (m)。STEP 1 はモーション確認のため寄り気味
  screenCx: VIEW_W / 2,
  screenCy: VIEW_H * 0.52,
  follow: 3.2,       // 追従の速さ (1/s)
  lookAhead: 0.55,   // 速度方向の先読み (s)
  clampX: 40,
  clampYMin: -21,
  clampYMax: 22,
};

// 開発用: URL パラメータで一部を上書き（例 ?vw=12 で寄り）
if (typeof location !== 'undefined') {
  const q = new URLSearchParams(location.search);
  if (q.has('vw')) CAMERA.viewWidthAtTarget = +q.get('vw');
  if (q.has('pitch')) CAMERA.pitchDeg = +q.get('pitch');
  if (q.has('la')) { CAMERA.lookAhead = +q.get('la'); CAMERA.follow = 30; }
}
