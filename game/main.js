// 遊戲機制測試畫面：串起模擬（sim.js）、盤面（render.js）、腳本編輯畫面（editor.js）與介面。

import { EXCHANGE_OPTIONS, TOKENS_PER_MONEY, CROPS, ACTION_COST } from './config.js';
import { PLOTS, plotById, stagesOf } from './plots.js';
import { newGame, loadGame, saveGame, autosave } from './session.js';
import {
  update, drainEvents, resetPlot, exchange, upgradeCapacity, setCrop, setProgram,
  capacityOf, nextCapacityCost, canGrow, CRASH_REASONS,
} from './sim.js';
import { loadAssets, createBoardRenderer } from './render.js';
import { defineBlocks } from './blocks.js';
import { createEditor, STAGE_LABEL } from './editor.js';

const $ = s => document.querySelector(s);
const CROP_NAMES = {};

let state, renderer, selected = PLOTS[0].id, speed = 1;

// ---------- 存檔 ----------

const save = () => saveGame(state);

// ---------- 主迴圈 ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 250);
  last = now;
  if (speed > 0) update(state, dt * speed);
  handleEvents();
  renderer.draw(state, { selected });
  renderHud();
  requestAnimationFrame(frame);
}

function handleEvents() {
  for (const e of drainEvents(state)) {
    const plot = plotById.get(e.plot);
    if (e.type === 'harvest') {
      const [x, y] = e.cell.split(',').map(Number);
      renderer.floatAt(e.plot, x, y, '+' + e.money, '#8a5a12');
    } else if (e.type === 'actionStart' && e.result === 'bump') {
      renderer.floatAt(e.plot, e.from.x, e.from.y, '撞到了', '#c65f48');
    } else if (e.type === 'actionStart' && e.result === 'noop') {
      renderer.floatAt(e.plot, e.from.x, e.from.y, '白做了', '#6b5a3a');
    } else if (e.type === 'runEnd') {
      if (!e.actions) continue;   // 防呆直接離開的空跑不記
      const how = e.endedBy === 'left' ? '（提早離開）' : '';
      log(`${plot.name}${e.stage === 'main' ? '' : STAGE_LABEL[e.stage]}跑完一輪${how}：花 ${e.tokens} Token、賺 ${e.money} 金錢、${(e.ms / 1000).toFixed(1)} 秒`);
      panelDirty = true;
    } else if (e.type === 'crash') {
      log(`⚠ ${plot.name} 當機：${CRASH_REASONS[e.reason]}`, 'crash');
      panelDirty = true;
    } else if (e.type === 'reset') {
      log(`${plot.name} 已重置`);
      panelDirty = true;
    }
  }
}

function log(text, kind) {
  const li = document.createElement('li');
  li.textContent = text;
  if (kind) li.className = kind;
  $('#log').prepend(li);
  while ($('#log').children.length > 40) $('#log').lastElementChild.remove();
}

// ---------- 介面 ----------

let panelDirty = true, lastPanel = 0;
function renderHud() {
  setText('#tokens', Math.floor(state.tokens));
  setText('#money', Math.floor(state.money));
  document.querySelectorAll('#exchange button').forEach(b => { b.disabled = state.money < +b.dataset.money; });
  const now = performance.now();
  if (panelDirty || now - lastPanel > 500) { renderPanel(); panelDirty = false; lastPanel = now; }
}
const setText = (sel, v) => { const el = $(sel); if (el.textContent !== String(v)) el.textContent = v; };

function robotStatus(plotId) {
  const robot = state.robots.find(r => r.plot === plotId && r.phase !== 'idle');
  if (state.plots[plotId].crashed) return '當機，等待重置';
  if (!robot) return '沒有機器人在這裡';
  if (robot.act?.kind === 'travel') return '機器人正在前往';
  return robot.run ? `機器人執行中（第 ${robot.run.actions} 個動作）` : '機器人在這裡';
}

function renderPanel() {
  const plot = plotById.get(selected), ps = state.plots[selected];
  const stages = stagesOf(plot), cap = capacityOf(selected, ps);
  const crops = Object.keys(CROPS).filter(id => canGrow(plot, id));
  const cells = Object.values(ps.cells);
  const mature = cells.filter(c => c.crop && c.growth >= 1).length, growing = cells.filter(c => c.crop && c.growth < 1).length;
  const lastRun = ps.lastRun;
  const html = `
    <p class="eyebrow">${plot.rules.name}田・可種到第 ${plot.rules.maxTier} 級作物</p>
    <h2>${plot.name}</h2>
    <p class="plot-rule">${plot.rules.rule}${plot.rules.tokenFree ? '' : ' Token 不夠時這塊田會當機，要手動重置。'}</p>
    <dl class="facts">
      <dt>狀態</dt><dd class="${ps.crashed ? 'bad' : ''}">${robotStatus(selected)}</dd>
      ${ps.crashed ? `<dt>當機原因</dt><dd class="bad">${CRASH_REASONS[ps.crashed.reason]}</dd>` : ''}
      <dt>田格</dt><dd>${cells.length} 格：成熟 ${mature}、生長中 ${growing}、空地 ${cells.length - mature - growing}</dd>
      <dt>上一輪</dt><dd>${lastRun ? `花 ${lastRun.tokens} Token、賺 ${lastRun.money} 金錢、${(lastRun.ms / 1000).toFixed(1)} 秒` : '還沒跑過'}</dd>
    </dl>
    ${ps.crashed ? '<button id="reset" class="primary danger">重置這塊田（免費）</button>' : ''}
    <label for="crop">種植作物</label>
    <select id="crop">${crops.map(id => `<option value="${id}" ${ps.crop === id ? 'selected' : ''}>${CROPS[id].tier} 級 ${CROP_NAMES[id] || id}・${CROPS[id].price} 金錢・${Math.round(CROPS[id].growMs / 1000)} 秒</option>`).join('')}</select>
    <div class="scripts">
      ${stages.map(stage => `<button class="primary" data-edit="${stage}">編輯${STAGE_LABEL[stage]}（${blockCountOf(stage)} / ${cap} 積木）</button>`).join('')}
    </div>
    <button id="upgrade" ${state.money < nextCapacityCost(ps) ? 'disabled' : ''}>擴充積木上限 +4（${nextCapacityCost(ps)} 金錢）</button>`;
  const panel = $('#panel');
  if (panel.dataset.html === html) return;
  // 下拉選單打開時不要重畫，否則會被關掉。
  if (panel.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
  panel.dataset.html = html;
  panel.innerHTML = html;
}

function blockCountOf(stage) {
  const ps = state.plots[selected];
  const json = ps.workspaces[stage];
  const count = blocks => blocks.reduce((n, b) => n + 1 + Object.values(b.inputs || {}).reduce((m, i) => m + (i.block ? count([i.block]) : 0), 0) + (b.next ? count([b.next.block]) : 0), 0);
  // 與 blocks.js 的 countBlocks 相同：開始下面的積木＋每個函式定義。
  const tops = json?.blocks?.blocks || [];
  const start = tops.find(b => b.type === 'rf_start');
  return (start ? count([start]) - 1 : 0) + count(tops.filter(b => b.type === 'procedures_defnoreturn'));
}

$('#panel').addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.id === 'reset') resetPlot(state, selected);
  else if (t.id === 'upgrade') upgradeCapacity(state, selected);
  else if (t.dataset.edit) openEditor(selected, t.dataset.edit);
  panelDirty = true;
});
$('#panel').addEventListener('change', e => {
  if (e.target.id === 'crop') { setCrop(state, selected, e.target.value); panelDirty = true; }
});

function buildControls() {
  $('#exchange').innerHTML = EXCHANGE_OPTIONS.map(m => `<button data-money="${m}">${m} 金錢 → ${m * TOKENS_PER_MONEY} Token</button>`).join('');
  $('#exchange').onclick = e => { const b = e.target.closest('button'); if (b) exchange(state, +b.dataset.money); };
  const speeds = [[0, '暫停'], [1, '1×'], [2, '2×'], [4, '4×'], [10, '10×']];
  $('#speed').innerHTML = speeds.map(([v, t]) => `<button data-speed="${v}" aria-pressed="${v === speed}">${t}</button>`).join('');
  $('#speed').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    speed = +b.dataset.speed;
    $('#speed').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.speed === speed)));
  };
  const costs = Object.entries({ 前進: 'move', 轉彎: 'turnLeft', 播種: 'sow', 澆水: 'water', 採收: 'harvest' });
  $('#costs').textContent = '動作 Token：' + costs.filter(([, key]) => ACTION_COST[key]).map(([name, key]) => `${name} ${ACTION_COST[key]}`).join('、')
    + '。' + costs.filter(([, key]) => !ACTION_COST[key]).map(([name]) => name).concat(['重複', '如果', '感測']).join('、') + '不扣 Token。';
  $('#new-game').onclick = () => {
    if (!confirm('確定要清除進度、重新開始嗎？這個動作無法復原。')) return;
    state = newGame(); save(); panelDirty = true; $('#log').innerHTML = '';
  };
  $('#board').addEventListener('click', e => {
    const id = renderer.plotAt(e.clientX, e.clientY);
    if (id) { selected = id; panelDirty = true; }
  });
}

// ---------- 積木編輯器 ----------

let editor = null;
function openEditor(plotId, stage) { editor.open(plotId, stage); }

// ---------- 啟動 ----------

async function start() {
  defineBlocks();
  let assets;
  try {
    assets = await loadAssets();
  } catch (e) {
    $('#hint').textContent = '素材載入失敗：' + e.message + '。請用 http 伺服器開啟（見 README）。';
    throw e;
  }
  renderer = createBoardRenderer($('#board'), assets);
  for (const c of assets.manifest.crops) CROP_NAMES[c.id] = c.name;
  state = loadGame();
  editor = createEditor({
    assets, getState: () => state,
    onSave(plot, stage, program, workspace) {
      setProgram(state, plot, stage, program, workspace);
      save();
      panelDirty = true;
      log(`${plotById.get(plot).name}的${STAGE_LABEL[stage]}已更新，下一輪生效`);
    },
  });
  buildControls();
  autosave(() => state);
  requestAnimationFrame(frame);
}

start();
