import { Application, Container } from 'pixi.js';
import { VIEW_W, VIEW_H, DT, MAX_STEPS_PER_FRAME } from './config.js';
import { Camera } from './render/camera.js';
import { Stadium, Goal, PitchLines } from './render/stadium.js';
import { PlayerRenderer } from './render/playerRenderer.js';
import { Player } from './game/player.js';
import { Input } from './core/input.js';
import { TouchControls } from './core/touch.js';
import { Hud } from './ui/hud.js';
import { TunePanel } from './ui/tunePanel.js';
import { Ball } from './game/ball.js';
import { Dribble } from './game/dribble.js';
import { PressAI } from './game/defender.js';
import { BallRenderer } from './render/ballRenderer.js';
import { GAIT } from './game/gait.js';

const KIT_HOME = {
  shirt: 0xd62839, trim: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0xd62839,
  boots: 0x15171c, bootAccent: 0xf2c14e, skin: 0xd9a47c, hair: 0x2a1b12,
};
const KIT_AWAY = {
  shirt: 0x1d3f8f, trim: 0xf2c14e, shorts: 0x10224d, socks: 0x1d3f8f,
  boots: 0xf4f4f4, bootAccent: 0x1d3f8f, skin: 0xa8734f, hair: 0x15100c,
};

async function boot() {
  const stageEl = document.getElementById('stage');
  const app = new Application();
  await app.init({
    width: VIEW_W,
    height: VIEW_H,
    background: 0x070b12,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    powerPreference: 'high-performance',
  });
  stageEl.appendChild(app.canvas);

  // 1280x720 の論理座標を 16:9 で画面にフィット（レターボックス）
  const root = new Container();
  app.stage.addChild(root);
  const fit = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const scale = Math.min(w / VIEW_W, h / VIEW_H);
    const cw = Math.floor(VIEW_W * scale), ch = Math.floor(VIEW_H * scale);
    app.renderer.resize(cw, ch);
    root.scale.set(cw / VIEW_W);
  };
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 200));

  // ---- シーン ----
  const camera = new Camera();
  const world = new Container();
  const stadium = new Stadium();
  const lines = new PitchLines();
  const shadowLayer = new Container();
  const entities = new Container();
  entities.sortableChildren = true;
  stadium.container.addChildAt(lines.g, 1); // 地面の直後
  world.addChild(stadium.container, shadowLayer, entities);
  root.addChild(world);

  const goals = [new Goal(-1), new Goal(1)];
  for (const g of goals) entities.addChild(g.g);

  // 操作選手（能力値は将来 32 項目。今は主要項目のみ反映）
  const player = new Player({ x: -6, y: 4, heading: 0, kit: KIT_HOME, name: 'P1',
    abilities: { speed: 80, acceleration: 78, agility: 82, dribbling: 80, balance: 75 } });
  player.canDribble = true;
  const pr = new PlayerRenderer(player, shadowLayer);
  entities.addChild(pr.view);
  camera.snap(player.x, player.y);

  // ボール + ドリブル（タッチは接地イベント）
  const ball = new Ball(-4.5, 4);
  const dribble = new Dribble(ball);
  dribble.attach(player);
  const br = new BallRenderer(ball, shadowLayer);
  entities.addChild(br.view);

  // 守備役（寄せのテスト用）
  const defender = new Player({ x: 8, y: -3, heading: Math.PI, kit: KIT_AWAY, name: 'DF',
    abilities: { speed: 72, acceleration: 70, agility: 75 } });
  const dr = new PlayerRenderer(defender, shadowLayer);
  entities.addChild(dr.view);
  const ai = new PressAI(defender);
  const opts = { ball: true, defender: true };

  const hud = new Hud();
  root.addChild(hud.view);

  const input = new Input();
  new TouchControls(input);

  const tune = new TunePanel({
    onToggle(key, on) {
      if (key === 'debug') { hud.debug = on; btnDbg.classList.toggle('on', on); }
      if (key === 'ball') {
        opts.ball = on; br.view.visible = br.shadow.visible = on;
        if (!on && ball.owner) { ball.owner.hasBall = false; ball.owner = null; }
        if (on) { ball.x = ball.px = player.x + Math.cos(player.heading) * 1.2; ball.y = ball.py = player.y + Math.sin(player.heading) * 1.2; ball.vx = ball.vy = 0; }
      }
      if (key === 'defender') { opts.defender = on; dr.view.visible = dr.shadow.visible = on; }
    },
  });
  const btnDbg = document.getElementById('btn-dbg');
  btnDbg.addEventListener('click', () => {
    hud.debug = !hud.debug;
    btnDbg.classList.toggle('on', hud.debug);
    document.getElementById('tb-dbg').classList.toggle('on', hud.debug);
  });
  const btnTune = document.getElementById('btn-tune');
  btnTune.addEventListener('click', () => btnTune.classList.toggle('on', tune.toggle()));

  // ---- UI ボタン ----
  let timeScale = 1;
  const btnSlow = document.getElementById('btn-slow');
  btnSlow.addEventListener('click', () => {
    timeScale = timeScale === 1 ? 0.25 : 1;
    btnSlow.classList.toggle('on', timeScale < 1);
  });
  const goFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape');
    } catch { /* 非対応端末は無視 */ }
  };
  document.getElementById('btn-full').addEventListener('click', goFullscreen);
  const start = document.getElementById('start');
  const begin = () => {
    if (start.classList.contains('hidden')) return;
    start.classList.add('hidden');
    if (matchMedia('(pointer: coarse)').matches) goFullscreen();
  };
  start.addEventListener('pointerup', begin);
  window.addEventListener('keydown', begin, { once: true });
  window.addEventListener('gamepadconnected', () => setTimeout(begin, 0));

  // ---- 60Hz 固定ステップ ----
  let acc = 0;
  const step = () => {
    const s = input.poll();
    player.step(s, DT);
    if (opts.defender) {
      const tgt = opts.ball ? (ball.owner ?? ball) : player;
      defender.step(ai.think(tgt.x, tgt.y), DT);
    }
    if (opts.ball) {
      ball.step(DT);
      dribble.update([player]);
    }
    camera.step(player.x, player.y, player.vx, player.vy, player.speed, DT);
  };

  const dbg = { paused: false };
  app.ticker.add((ticker) => {
    const dtReal = Math.min(ticker.deltaMS / 1000, 0.1);
    if (!dbg.paused) acc += dtReal * timeScale;
    let n = 0;
    while (acc >= DT && n < MAX_STEPS_PER_FRAME) { step(); acc -= DT; n++; }
    if (n === MAX_STEPS_PER_FRAME) acc = 0;
    const alpha = acc / DT;

    camera.interpolate(alpha);
    stadium.update(camera);
    lines.update(camera);
    for (const g of goals) g.update(camera);
    pr.draw(camera, alpha);
    if (opts.defender) dr.draw(camera, alpha);
    if (opts.ball) br.draw(camera, alpha);
    const extra = [];
    if (opts.ball) extra.push(`BALL    ${ball.owner ? '保持' : 'フリー'}  タッチ ${dribble.touches}回 (${GAIT.dribble.touchEvery[dribble._key(player.mode)]}歩毎)`);
    if (opts.defender) extra.push(`DF      ${GAIT.states[defender.mode]?.label}  ${defender.gait.stride.toFixed(2)}m × ${defender.gait.cadence.toFixed(2)}`);
    hud.update(dtReal, player, input, timeScale, { lines: extra });
  });

  // デバッグ用
  window.__solosaka = {
    app, player, camera, input, ball, dribble, defender, GAIT, opts,
    pause(v = true) { dbg.paused = v; acc = 0; },
    step(n = 1) { for (let i = 0; i < n; i++) step(); },
    teleport(x, y) { player.teleport(x, y); camera.snap(x, y); },
  };
}

boot();
