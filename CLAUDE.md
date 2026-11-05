# SOLOSAKA — 試合エンジン開発ガイド

新作サッカーゲーム「SOLOSAKA」の試合エンジン。このファイルは仕様と開発ルールの正本。
仕様を変えたら必ずここも更新すること。

## 技術スタック

- **PixiJS v8** + **Vite** + **JavaScript (ES Modules)**（TypeScript は使わない）
- 依存は最小限。物理・AI・モーションは自前実装。
- `npm run dev` … 開発サーバー（`--host` 付きなので同一 LAN のスマホからも確認可）
- `npm run build` … `dist/` に本番ビルド（`base: './'` の相対パス）
- `npm run preview` … ビルド結果の確認

## 画面・カメラ

- **16:9 / 論理解像度 1280×720 / 横画面**。実画面へはレターボックスでフィット（`src/main.js` の `fit()`）。
- **斜め俯瞰カメラ（ボール追従）**: 手前タッチライン側の高所から見下ろす透視カメラ。
  望遠気味（距離 64m・見下ろし 31°）で中継カメラ風のゆるいパース。
  STEP 1 ではボールが無いので操作選手を追従。STEP B 以降は追従対象をボールに切り替える。
- 縦画面のスマホでは「横向きにしてください」を表示。開始タップで全画面＋横画面ロックを試みる。

## ゲームループ

- **60Hz 固定ステップ**（`DT = 1/60`）。描画は可変フレームで、前ステップとの線形補間（alpha）。
- 1 フレームの最大ステップ数は 5（スパイラル防止）。
- シミュレーション（`step`）と描画（`render`）を分離。ゲームロジックは描画に依存しないこと。

## 座標系・単位

- 単位は **メートル / 秒 / ラジアン**。
- ワールド座標: `x` = ピッチ長手方向（画面右が +）、`y` = 幅方向（**画面手前が +**）、`z` = 高さ（上が +）。
- ピッチ中心が原点。ピッチ 105×68（`halfL = 52.5`, `halfW = 34`）。
- 向き `heading` は `atan2(y, x)`。選手の右方向ベクトルは `(-sin, cos)`。
- スティック入力はそのままワールド方向（スティック上 = 奥 = `-y`）。

## 選手モデル

- **7〜7.5 頭身の 2D 骨格モデル**（身長 1.80m・頭部 0.25m ≒ 7.2 頭身）。
- 3D の関節位置（22 関節: `src/game/skeleton.js`）を毎ステップ手続き的に解き、
  カメラで投影してテーパー付きカプセルで描画（`src/render/playerRenderer.js`）。
  左右の手足は奥行きで前後関係を決めるので、どの方向に走っても破綻しない。
- **モーションはリアルなサッカー選手らしさを最優先**（`src/game/locomotion.js`）:
  - **位相は時間ではなく移動距離で進める**（位相の増分 = 移動距離 ÷ (2 × ストライド)、1 サイクル = 2 歩）。
    足が接地した瞬間に `onContact(side, footPos)` を発火する。
  - 接地率・遊脚高さ・歩隔は状態とストライドで変化。接地足はワールド固定（足滑りなし）。遊脚は骨盤基準の相対軌道で
    ヒールキック → ニードライブ → 振り出し → パウイング（着地前の引き戻し）。
  - 膝は 2 ボーン IK、骨盤高さは接地足に届く範囲にクランプ。
  - 骨盤の上下動・左右揺れ・回旋、肩の逆回旋、加速時の前傾、旋回時の内傾、
    頭部の安定化、肘角が変化する腕振り、停止時の足踏み（向き直し）と呼吸。
  - R2 コントロール・寄せの近距離は歩幅を詰め、重心を下げ、前傾を強める。
  - ダッシュ時は大股で前傾を強め、腕は小さく鋭く振り抜く。

## 移動: ストライド × ピッチ（`src/game/gait.js`）

- **移動速度 = ストライド（1 歩の距離 m）× ピッチ（歩/秒）**。60Hz 固定ステップ内で計算。
- 選手ごとに `baseStride` / `baseCadence`（+ 加速 `strideGrowPerStep`・敏捷 `turnPerStep`）を持つ。
  `makeGaitProfile(abilities)` が能力値（将来 32 項目）から算出する。**調整値はすべて `GAIT` の 1 か所**。
- 状態ごとの倍率（`GAIT.states`）: ジョグ（小・低）/ 通常走行 / R1 ダッシュ（ストライド大きく伸ばす・ピッチ少し上げ）/
  R2 コントロール（短く・高く）/ 通常ドリブル（通常走行より少し短め）/ ダッシュドリブル / 寄せ（遠：大股、近：小刻み）。
- 走り出し: 最初の 4 歩は短い歩幅・高いピッチ（`GAIT.startup`）→ 1 歩ごとにストライドを伸ばしてトップスピードへ。
- 減速・切り返し: ストライドを詰めて重心を下げる（`crouch`）。曲がり切れない角度が大きいほど次の 1 歩を大きく詰める。
- **方向転換は接地の瞬間にだけ決まる**。1 歩で曲がれる角度 = `turnPerStep × (refStride / stride)^exp`
  → 大股ほど次の接地まで遅れ、旋回半径も大きい。小刻みほど切り返しが鋭い。
- 守備の寄せ（`src/game/defender.js`）: 保持者から `closeDist`(3m) 外は大股、内側は小刻み。残り距離で止まれる速度に絞って寄せる。

## ドリブル（`src/game/dribble.js`・仮のボール `src/game/ball.js`）

- ボールタッチは接地イベントで行う。`GAIT.dribble.touchEvery`（R2 = 毎歩、通常 = 2 歩、ダッシュ = 4 歩）。
- 押し出す量 = 速度 × (タッチ間隔 ÷ ピッチ) + `lead`。転がり抵抗を考慮して初速を決める。
- 走り出し・加速中は細かく触る。切り返した歩では向きを変えるタッチを入れる。
- ボール物理は最小限（STEP B で本格化）。

## 試合ルール（予定）

- **11 人制**、**前後半各 3 分（仮）**。数値は `src/config.js` の `MATCH`。

## 操作

| 入力 | 動作 |
| --- | --- |
| 左スティック | 移動 |
| R1 | ダッシュ |
| R2 | コントロールドリブル |
| × | ショートパス |
| △ | スルーパス |
| □ | シュート |
| ○ | ロングパス |
| L1 | カーソルチェンジ |
| 右スティック | 手動カーソル切替 |

- **DualSense 対応**: Gamepad API の standard mapping
  （0 ×, 1 ○, 2 □, 3 △, 4 L1, 5 R1, 6 L2, 7 R2, axes 0/1 左, 2/3 右）。十字キーでも移動可。
- **スマホ**: 画面左半分にフローティング仮想スティック、右下に DASH ボタン（`src/core/touch.js`）。
  確認用に R2 ボタンも置いている。
- キーボード（開発用）: WASD/矢印 移動、Shift ダッシュ、E コントロール、J × / I △ / K □ / L ○ / Q L1。
- 入力はすべて `src/core/input.js` の `Input` に集約し、アクション名（`shortPass`, `throughPass`,
  `shoot`, `longPass`, `switchCursor`, `dash`, `control`）で参照する。`justPressed` でエッジ検出可。

## 制作順

- [x] **STEP A**（= STEP 1）: フィールド・選手 1 人の移動・カメラ
- [ ] **STEP B**: ボール物理・パス・シュート（カメラ追従をボールへ）
- [ ] **STEP C**: カーソル切替・AI・守備
- [ ] **STEP D**: 11 対 11・試合進行（キックオフ、前後半、得点、アウトオブプレー）
- [ ] **STEP E**: UI・端末対応

## ディレクトリ構成

```
index.html            エントリ（開始画面・縦画面警告・トップバー）
src/main.js           起動・シーン構築・固定ステップループ
src/config.js         定数（画面・ピッチ・移動・カメラ）。URL ?vw= ?pitch= ?la= で開発時に上書き
src/style.css
src/core/input.js     入力統合（キーボード / ゲームパッド / タッチ）
src/core/touch.js     仮想スティック + DASH ボタン
src/game/player.js    選手（入力 → 歩容 → 移動 → モーション、接地イベントの配信）
src/game/gait.js      ストライド × ピッチ（調整値 GAIT と能力値→プロファイル）
src/game/dribble.js   接地同期のドリブルタッチ
src/game/ball.js      仮のボール
src/game/defender.js  寄せの簡易 AI（テスト用）
src/game/locomotion.js 走行モーション（3D 骨格の手続き生成）
src/game/skeleton.js  関節インデックスと体格
src/render/camera.js  斜め俯瞰透視カメラ（project / depth）
src/render/textures.js 芝・観客・広告ボードのテクスチャ生成（Canvas）
src/render/stadium.js ピッチ（PerspectiveMesh）・ライン（ベクター）・スタンド・ゴール
src/render/playerRenderer.js 選手の描画
src/render/ballRenderer.js ボール描画
src/ui/hud.js         HUD（DEBUG でストライド・ピッチ・速度・位相・状態）
src/ui/tunePanel.js   スマホ用調整パネル（ストライド/ピッチ倍率スライダー等）
tools/build-standalone.mjs 単体 HTML（PixiJS は CDN）を standalone/ に生成
```

## 公開（GitHub Pages）

- `.github/workflows/deploy.yml` が `main` と `ccr-*` ブランチへの push でビルドし、
  `dist/` を **`gh-pages` ブランチ** に公開する。
- 初回のみリポジトリの Settings → Pages → Source を「Deploy from a branch」/ `gh-pages` / `/(root)` にする。
- URL: `https://shosei25jojo-ui.github.io/solosaka/`（単体確認用 HTML は `.../solosaka/solosaka-gait.html`）
- `npm run build` は単体 HTML（`standalone/solosaka-gait.html`、PixiJS は jsDelivr CDN）も生成する。
- オーナーは **Android の Chrome でのみ確認**する。変更は必ずスマホ（タッチ操作・横画面・全画面）で
  動くことを前提にし、重い処理（毎フレームのテクスチャ再生成など）は避ける。

## 開発メモ

- デバッグ用に `window.__solosaka` を公開（`pause()`, `step(n)`, `teleport(x, y)`, `input.override`）。
  ヘッドレスでコマ送りしてモーションを確認できる。
- 画面右上 `SLOW` で 0.25 倍速（モーション確認用）、`DBG` でデバッグ表示、`TUNE` で倍率スライダー。
- 描画は Graphics を毎フレーム作り直している。選手が 22 人になったら負荷を計測し、必要ならキャッシュ化する。
