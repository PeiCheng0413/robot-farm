// 主畫面：溫室農場。點田地滑出田地卡片，從卡片進入腳本編輯畫面。
// 模擬、存檔、編輯畫面都與機制測試畫面（game.html）共用。

import { EXCHANGE_OPTIONS, TOKENS_PER_MONEY, CROPS, PLOT_TYPES } from './config.js';
import { plotById, stagesOf, canPlace } from './plots.js';
import {
  update, drainEvents, resetPlot, exchange, upgradeCapacity, setCrop, setProgram, placePlot,
  capacityOf, nextCapacityCost, canGrow, CRASH_REASONS,
} from './sim.js';
import { loadAssets, createBoardRenderer, createPainter, screenAsset, spriteURL } from './render.js';
import { defineBlocks } from './blocks.js';
import { createEditor, STAGE_LABEL } from './editor.js';
import { loadGame, saveGame, autosave } from './session.js';

const $ = s => document.querySelector(s);
const escape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TIER_TYPE = Object.fromEntries([1, 2, 3, 4].map(t => [t, Object.values(PLOT_TYPES).find(r => r.maxTier >= t).name]));

let state, renderer, painter, editor, selected = null, cropNames = {};
let arranging = false, drag = null;

// ---------- 主迴圈 ----------

let last = performance.now(), lastCard = 0;
function frame(now) {
  const dt = Math.min(now - last, 250);
  last = now;
  update(state, dt);
  handleEvents();
  renderer.draw(state, { selected: arranging ? null : selected, ghost: drag?.moved ? drag : null });
  setText('#tokens', Math.floor(state.tokens));
  setText('#money', Math.floor(state.money));
  if (selected && now - lastCard > 400) { refreshCard(); lastCard = now; }
  requestAnimationFrame(frame);
}
const setText = (sel, v) => { const el = $(sel); if (el.textContent !== String(v)) el.textContent = v; };

function handleEvents() {
  for (const e of drainEvents(state)) {
    const plot = plotById.get(e.plot);
    if (e.type === 'harvest') {
      const [x, y] = e.cell.split(',').map(Number);
      renderer.floatAt(e.plot, x, y, '+' + e.money, '#8a5a12');
    } else if (e.type === 'actionStart' && e.result === 'bump') {
      renderer.floatAt(e.plot, e.from.x, e.from.y, '撞到了', '#c65f48');
    } else if (e.type === 'crash') {
      toast(`${plot.name}當機了：${CRASH_REASONS[e.reason]}`, '查看', () => select(e.plot));
    }
  }
}

// ---------- 提示 ----------

function toast(text, actionText, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<p>${escape(text)}</p>`;
  if (actionText) {
    const b = document.createElement('button');
    b.textContent = actionText;
    b.onclick = () => { action(); el.remove(); };
    el.append(b);
  }
  const close = document.createElement('button');
  close.className = 'toast-close';
  close.setAttribute('aria-label', '關閉提示');
  close.textContent = '×';
  close.onclick = () => el.remove();
  el.append(close);
  $('#toasts').append(el);
  while ($('#toasts').children.length > 3) $('#toasts').firstElementChild.remove();
}

// ---------- 田地卡片 ----------

function select(plotId) {
  selected = plotId;
  buildCard();
  $('#card').hidden = false;
  requestAnimationFrame(() => $('#card').classList.add('open'));
  $('#farm-hint').hidden = true;
}

function closeCard() {
  selected = null;
  $('#card').classList.remove('open');
  $('#card').hidden = true;
  $('#farm-hint').hidden = false;
}

// 卡片結構在選田時建一次；之後只更新會變的文字，避免重畫打斷操作。
function buildCard() {
  const plot = plotById.get(selected), rules = plot.rules;
  const crops = Object.keys(CROPS);
  $('#card').style.setProperty('--type', rules.colour);
  $('#card').innerHTML = `
    <header class="card-head">
      <p class="card-type">${rules.name}田</p>
      <h2 id="card-title">${escape(plot.name)}</h2>
      <button class="card-close" aria-label="關閉田地卡片">×</button>
    </header>
    <div class="card-body">
      <p class="card-rule">${escape(rules.rule)}</p>
      <p id="card-status" class="card-status"></p>
      <div id="card-reset"></div>

      <h3>機器人的腳本</h3>
      <div class="script-list">
        ${stagesOf(plot).map(stage => `
          <button class="script-button" data-edit="${stage}">
            <span class="script-name">編輯${STAGE_LABEL[stage]}</span>
            <span class="script-count" data-count="${stage}"></span>
          </button>`).join('')}
      </div>
      <p id="card-last" class="card-last"></p>

      <h3>種什麼</h3>
      <div class="crop-grid" role="radiogroup" aria-label="選擇作物">
        ${crops.map(id => {
          const ok = canGrow(plot, id), c = CROPS[id];
          return `<button class="crop-tile" role="radio" data-crop="${id}" ${ok ? '' : 'disabled'} aria-checked="false">
            <canvas width="96" height="96" data-icon="${id}" aria-hidden="true"></canvas>
            <span class="crop-name">${escape(cropNames[id] || id)}</span>
            <span class="crop-meta">${ok ? `${c.price} 金錢・${formatTime(c.growMs)}` : `要${TIER_TYPE[c.tier]}田以上`}</span>
          </button>`;
        }).join('')}
      </div>

      <h3>積木上限</h3>
      <div class="capacity">
        <p id="card-capacity"></p>
        <button id="card-upgrade" class="console-button"></button>
      </div>
    </div>`;
  for (const canvas of $('#card').querySelectorAll('canvas[data-icon]')) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    painter.produce(ctx, canvas.dataset.icon, 48, 96, 96);
  }
  refreshCard();
}

function refreshCard() {
  const plot = plotById.get(selected), ps = state.plots[selected], cap = capacityOf(selected, ps);
  const status = $('#card-status');
  if (!status) return;
  const text = ps.crashed ? `當機了：${CRASH_REASONS[ps.crashed.reason]}` : robotStatus(selected);
  if (status.textContent !== text) status.textContent = text;
  status.classList.toggle('bad', !!ps.crashed);
  const reset = $('#card-reset');
  if (!!ps.crashed !== !!reset.firstElementChild) {
    reset.innerHTML = ps.crashed ? '<button id="card-reset-button" class="primary danger">重置這塊田（免費）</button>' : '';
  }
  for (const el of $('#card').querySelectorAll('[data-count]')) {
    const n = blockCount(ps.workspaces[el.dataset.count]);
    setEl(el, `${n} / ${cap} 積木${n ? '' : '・還沒寫'}`);
  }
  const lr = ps.lastRun;
  setEl($('#card-last'), lr ? `上一輪${lr.stage === 'main' ? '' : `（${STAGE_LABEL[lr.stage]}）`}：花 ${lr.tokens} Token、賺 ${lr.money} 金錢、${(lr.ms / 1000).toFixed(1)} 秒` : '機器人還沒來這塊田工作過。');
  for (const tile of $('#card').querySelectorAll('.crop-tile')) tile.setAttribute('aria-checked', String(tile.dataset.crop === ps.crop));
  setEl($('#card-capacity'), `每份腳本最多 ${cap} 塊積木。`);
  const cost = nextCapacityCost(ps), up = $('#card-upgrade');
  setEl(up, `擴充 +4 塊（${cost} 金錢）`);
  up.disabled = state.money < cost;
}
const setEl = (el, text) => { if (el.textContent !== text) el.textContent = text; };

function robotStatus(plotId) {
  const robot = state.robots.find(r => r.plot === plotId && r.phase !== 'idle');
  if (!robot) return '機器人在別的地方，輪到這塊田時會過來。';
  if (robot.act?.kind === 'travel') return '機器人正在過來。';
  return robot.run ? `機器人正在這裡工作（第 ${robot.run.actions} 個動作）。` : '機器人在這裡。';
}

// 只算接在「開始」下面的積木與函式定義，與 blocks.js 的 countBlocks 相同。
function blockCount(json) {
  const count = blocks => blocks.reduce((n, b) => n + 1 + Object.values(b.inputs || {}).reduce((m, i) => m + (i.block ? count([i.block]) : 0), 0) + (b.next ? count([b.next.block]) : 0), 0);
  const tops = json?.blocks?.blocks || [];
  const start = tops.find(b => b.type === 'rf_start');
  return (start ? count([start]) - 1 : 0) + count(tops.filter(b => b.type === 'procedures_defnoreturn'));
}

const formatTime = ms => ms < 60000 ? `${Math.round(ms / 1000)} 秒` : ms < 3600000 ? `${Math.round(ms / 60000)} 分` : `${(ms / 3600000).toFixed(1)} 小時`;

$('#card').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.classList.contains('card-close')) return closeCard();
  if (b.id === 'card-reset-button') resetPlot(state, selected);
  else if (b.id === 'card-upgrade') upgradeCapacity(state, selected);
  else if (b.dataset.crop) setCrop(state, selected, b.dataset.crop);
  else if (b.dataset.edit) editor.open(selected, b.dataset.edit);
  refreshCard();
});

// ---------- 排列模式 ----------
// 拖曳田塊：預覽位置吸附在游標所在的格子上（像棋盤），放開時能放就放、放不下就回原位。
// 點一下（沒有拖動）轉 90°；拖曳中按 R 也能轉。機器人照常工作，田的局部座標不變。

function setArranging(on) {
  arranging = on;
  drag = null;
  if (on) closeCard();
  document.body.classList.toggle('arranging', on);
  $('#arrange-toggle').setAttribute('aria-pressed', String(on));
  $('#arrange-banner').hidden = !on;
  $('#farm-hint').hidden = on || !!selected;
  if (!on) saveGame(state);
}

const DRAG_START = 6;   // 移動超過幾個像素才算拖曳，否則算點一下

function onPointerDown(e) {
  if (!arranging) return;
  const plotId = renderer.plotAt(e.clientX, e.clientY);
  if (!plotId) return;
  const cell = renderer.cellAt(e.clientX, e.clientY), place = state.layout[plotId];
  drag = { plotId, grab: [cell.x - place.x, cell.y - place.y], start: [e.clientX, e.clientY], moved: false, place: { ...place }, valid: true };
  $('#farm').setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e) {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < DRAG_START) return;
  drag.moved = true;
  const cell = renderer.cellAt(e.clientX, e.clientY);
  drag.place = { x: cell.x - drag.grab[0], y: cell.y - drag.grab[1], rot: drag.place.rot };
  drag.valid = canPlace(state.layout, drag.plotId, drag.place);
}

function onPointerUp() {
  if (!drag) return;
  const { plotId, moved, place, valid } = drag;
  drag = null;
  if (!moved) return rotatePlot(plotId);
  if (valid) placePlot(state, plotId, place);
  else toast('這裡放不下：田不能重疊，也不能超出溫室。');
}

// 原地轉 90°；轉了放不下，就試著往四周挪一格。
function rotatePlot(plotId) {
  const now = state.layout[plotId], rot = (now.rot + 1) % 4;
  for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    if (placePlot(state, plotId, { x: now.x + dx, y: now.y + dy, rot })) return;
  }
  toast('轉不過去：旁邊空間不夠，先把田拖到空一點的地方再轉。');
}

function rotateDrag() {
  if (!drag) return;
  drag.place = { ...drag.place, rot: (drag.place.rot + 1) % 4 };
  drag.valid = canPlace(state.layout, drag.plotId, drag.place);
}

// ---------- 兌換 ----------

function buildExchange() {
  $('#exchange-menu').innerHTML = EXCHANGE_OPTIONS.map(m => `<button data-money="${m}">${m} 金錢 換 ${m * TOKENS_PER_MONEY} Token</button>`).join('');
  const toggle = open => {
    $('#exchange-menu').hidden = !open;
    $('#exchange-open').setAttribute('aria-expanded', String(open));
    if (open) $('#exchange-menu').querySelectorAll('button').forEach(b => { b.disabled = state.money < +b.dataset.money; });
  };
  $('#exchange-open').onclick = () => toggle($('#exchange-menu').hidden);
  $('#exchange-menu').onclick = e => {
    const b = e.target.closest('button');
    if (b && exchange(state, +b.dataset.money)) toggle(false);
  };
  document.addEventListener('click', e => { if (!e.target.closest('.exchange')) toggle(false); });
}

// ---------- 主畫面素材 ----------

// 依 manifest.mainScreenAssets 把窗框、地磚、資源圖示套上去；素材缺少時保留 CSS 畫的替代外觀。
function applyScreenAssets(assets) {
  const tile = (id, el, repeat) => {
    const item = screenAsset(assets, id), [w, h] = item?.recommendedDisplaySize || [];
    const url = item && spriteURL(assets, item, w * 2, h * 2);   // 2 倍解析度，高密度螢幕也清楚
    if (!url) return;
    el.style.backgroundImage = `url(${url})`;
    el.style.backgroundRepeat = repeat;
    el.style.backgroundSize = repeat === 'repeat-x' ? 'auto 100%' : `${w}px ${h}px`;
    el.classList.add('has-art');
  };
  tile('greenhouseWindow', $('.glass'), 'repeat-x');
  tile('stoneFloor', $('.floor'), 'repeat');
  const grout = assets.manifest.mainScreenAssets?.lab?.groutColor;
  if (grout && $('.floor').classList.contains('has-art')) $('.floor').style.backgroundColor = grout;
  for (const [id, gauge] of [['token', '#tokens'], ['money', '#money']]) {
    const item = screenAsset(assets, id), url = item && spriteURL(assets, item, 96, 96);
    if (!url) continue;
    const img = new Image();
    img.src = url; img.alt = ''; img.className = 'gauge-icon';
    $(gauge).closest('.gauge').prepend(img);
  }
}

// ---------- 啟動 ----------

async function start() {
  defineBlocks();
  let assets;
  try {
    assets = await loadAssets();
  } catch (e) {
    $('#farm-hint').textContent = '素材載入失敗：' + e.message + '。請重新整理頁面。';
    throw e;
  }
  cropNames = Object.fromEntries(assets.manifest.crops.map(c => [c.id, c.name]));
  applyScreenAssets(assets);
  renderer = createBoardRenderer($('#farm'), assets, { background: false });
  painter = createPainter(assets);
  state = loadGame();
  editor = createEditor({
    assets, getState: () => state,
    onSave(plot, stage, program, workspace) {
      setProgram(state, plot, stage, program, workspace);
      saveGame(state);
      toast(`${plotById.get(plot).name}的${STAGE_LABEL[stage]}已儲存，機器人下一輪開始照新腳本做。`);
      if (selected) refreshCard();
    },
  });
  buildExchange();
  $('#farm').addEventListener('click', e => {
    if (arranging) return;
    const id = renderer.plotAt(e.clientX, e.clientY);
    if (id) select(id); else closeCard();
  });
  $('#farm').addEventListener('pointerdown', onPointerDown);
  $('#farm').addEventListener('pointermove', onPointerMove);
  $('#farm').addEventListener('pointerup', onPointerUp);
  $('#farm').addEventListener('pointercancel', () => { drag = null; });
  $('#arrange-toggle').onclick = () => setArranging(!arranging);
  $('#arrange-done').onclick = () => setArranging(false);
  document.addEventListener('keydown', e => {
    if (editor.isOpen()) return;
    if (arranging && (e.key === 'r' || e.key === 'R')) rotateDrag();
    else if (e.key === 'Escape' && arranging) setArranging(false);
    else if (e.key === 'Escape' && selected) closeCard();
  });
  // 卡片從面板下緣開始：面板高度會因螢幕寬度換行而變，跟著量。
  const fitCard = () => document.documentElement.style.setProperty('--console-h', $('.console').offsetHeight + 'px');
  window.addEventListener('resize', fitCard);
  fitCard();
  // 盤面等比縮放到放得進地板（CSS 的 max-height 對 canvas 在這個版面裡不生效）。
  const floor = $('.floor'), farm = $('#farm');
  new ResizeObserver(() => {
    const pad = parseFloat(getComputedStyle(floor).paddingLeft) * 2;
    const k = Math.min((floor.clientWidth - pad) / farm.width, (floor.clientHeight - pad) / farm.height);
    farm.style.width = Math.floor(farm.width * k) + 'px';
    farm.style.height = Math.floor(farm.height * k) + 'px';
    // 地磚大小與位置對齊盤面格子：每塊石板就是一個格位
    if (floor.classList.contains('has-art')) {
      const cell = renderer.cell * k, left = (floor.clientWidth - farm.width * k) / 2, top = (floor.clientHeight - farm.height * k) / 2 + renderer.top * k;
      floor.style.backgroundSize = `${cell}px ${cell}px`;
      floor.style.backgroundPosition = `${left}px ${top}px`;
    }
  }).observe(floor);
  autosave(() => state);
  // play.html#plot=T-high 直接打開該塊田的卡片
  const linked = new URLSearchParams(location.hash.slice(1)).get('plot');
  if (plotById.has(linked)) select(linked);
  requestAnimationFrame(frame);
}

start();
