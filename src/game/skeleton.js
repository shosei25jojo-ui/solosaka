// 選手の骨格定義（身長 1.80m / 頭部 0.25m ≒ 7.2 頭身）

export const J = {
  PELVIS: 0, CHEST: 1, NECK: 2, HEAD: 3,
  L_SH: 4, L_EL: 5, L_HA: 6,
  R_SH: 7, R_EL: 8, R_HA: 9,
  L_HIP: 10, L_KN: 11, L_AN: 12, L_TO: 13,
  R_HIP: 14, R_KN: 15, R_AN: 16, R_TO: 17,
  L_WA: 18, R_WA: 19, // 腰（胴体シルエット用）
  L_HE: 20, R_HE: 21, // かかと
};
export const JOINT_COUNT = 22;

export const BODY = {
  height: 1.80,
  headLen: 0.25,
  thigh: 0.45,
  shin: 0.435,
  ankleH: 0.075,
  foot: 0.215,
  heel: 0.055,
  upperArm: 0.295,
  foreArm: 0.27,
  shoulderHalf: 0.165,
  hipHalf: 0.092,
  waistHalf: 0.125,
  spine: 0.50,   // 股関節中心 → 肩ライン
  neck: 0.085,
  headR: 0.112,
  standHipZ: 0.935,
};
