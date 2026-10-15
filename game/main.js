// 遊戲入口：串起模擬（sim.js）、畫面（render.js）、積木編輯器（blocks.js）與介面。

import { SAVE_KEY, EXCHANGE_OPTIONS, TOKENS_PER_MONEY, CROPS, TUTORIAL_CROPS, ACTION_COST } from './config.js';
import { PLOTS, plotById } from './plots.js';
import {
  createState, serialize, restore, update, drainEvents, resetPlot, exchange, upgradeCapacity, setCrop, setProgram,
  capacityOf, nextCapacityCost, CRASH_REASONS,
} from './sim.js';
import { createRenderer } from './render.js';
import { defineBlocks, TOOLBOX, createTheme, DEFAULT_WORKSPACES, compile, countBlocks, CompileError } from './blocks.js';

const Blockly = window.Blockly;
const $ = s => document.querySelector(s);
const STAGE_LABEL = { main: '腳本', sow: '播種腳本', harvest: '採收腳本' };
const CROP_NAMES = {};

let state, renderer, selected = PLOTS[0].id, speed = 1;

// ---------- 存檔 ----------

function compileJson(json) {
  const ws = new Blockly.Workspace();
  try { Blockly.serialization.workspaces.load(json, ws); return compile(ws); } finally { ws.dispose(); }
}

function newGame() {
  const s = createState();
  for (const plot of PLOTS) {
    const stages = plot.tutorial ? ['sow', 'harvest'] : ['main'];
    for (const stage of stages) setProgram(s, plot.id, stage, compileJson(DEFAULT_WORKSPACES[stage]), DEFAULT_WORKSPACES[stage]);
  }
  return s;
}

function load() {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (json) { const s = restore(json); if (s) return s; }
  } catch (e) { console.warn('讀檔失敗，改開新遊戲', e); }
  return newGame();
}

function save() {
  try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch (e) { /* 私密視窗等情況存不了，遊戲照常進行 */ }
}

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
  const stages = plot.tutorial ? ['sow', 'harvest'] : ['main'];
  const crops = Object.keys(CROPS).filter(id => !plot.tutorial || TUTORIAL_CROPS.includes(id));
  const cells = Object.values(ps.cells);
  const mature = cells.filter(c => c.crop && c.growth >= 1).length, growing = cells.filter(c => c.crop && c.growth < 1).length;
  const lastRun = ps.lastRun;
  const html = `
    <p class="eyebrow">${plot.tutorial ? '新手田・教學關' : '正式田'}</p>
    <h2>${plot.name}</h2>
    <p class="plot-rule">${plot.tutorial
      ? '不扣 Token，只能種收益低的作物。系統依作物狀態自動選擇跑「播種腳本」或「採收腳本」。'
      : '每執行一個動作積木就扣 Token。Token 不夠時這塊田會當機，要手動重置。'}</p>
    <dl class="facts">
      <dt>狀態</dt><dd class="${ps.crashed ? 'bad' : ''}">${robotStatus(selected)}</dd>
      ${ps.crashed ? `<dt>當機原因</dt><dd class="bad">${CRASH_REASONS[ps.crashed.reason]}</dd>` : ''}
      <dt>田格</dt><dd>${cells.length} 格：成熟 ${mature}、生長中 ${growing}、空地 ${cells.length - mature - growing}</dd>
      <dt>上一輪</dt><dd>${lastRun ? `花 ${lastRun.tokens} Token、賺 ${lastRun.money} 金錢、${(lastRun.ms / 1000).toFixed(1)} 秒` : '還沒跑過'}</dd>
    </dl>
    ${ps.crashed ? '<button id="reset" class="primary danger">重置這塊田（免費）</button>' : ''}
    <label for="crop">種植作物</label>
    <select id="crop">${crops.map(id => `<option value="${id}" ${ps.crop === id ? 'selected' : ''}>${CROP_NAMES[id] || id}・${CROPS[id].price} 金錢・${Math.round(CROPS[id].growMs / 1000)} 秒</option>`).join('')}</select>
    <div class="scripts">
      ${stages.map(stage => `<button class="primary" data-edit="${stage}">編輯${STAGE_LABEL[stage]}（${blockCountOf(stage)} / ${capacityOf(ps)} 積木）</button>`).join('')}
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
  const json = stage === 'main' ? ps.workspace : ps.workspaces[stage];
  const count = blocks => blocks.reduce((n, b) => n + 1 + Object.values(b.inputs || {}).reduce((m, i) => m + (i.block ? count([i.block]) : 0), 0) + (b.next ? count([b.next.block]) : 0), 0);
  const start = json?.blocks?.blocks?.find(b => b.type === 'rf_start');
  return start ? count([start]) - 1 : 0;
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
  $('#costs').textContent = '動作 Token：' + Object.entries({ 前進: 'move', 轉彎: 'turnLeft', 播種: 'sow', 澆水: 'water', 採收: 'harvest' })
    .map(([name, key]) => `${name} ${ACTION_COST[key]}`).join('、') + '。重複、如果、感測不扣 Token。';
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

let workspace = null, editing = null, dirty = false;

function ensureWorkspace() {
  if (workspace) return;
  workspace = Blockly.inject('blockly', {
    toolbox: TOOLBOX, theme: createTheme(), renderer: 'zelos', media: 'vendor/blockly/media/',
    trashcan: true, sounds: false, maxInstances: { rf_start: 1 },
    zoom: { controls: true, wheel: false, startScale: 0.95 }, move: { scrollbars: true, drag: true, wheel: true },
  });
  workspace.addChangeListener(Blockly.Events.disableOrphans);
  workspace.addChangeListener(e => {
    if (e.isUiEvent || !editing) return;
    dirty = true;
    updateCount();
  });
}

function updateCount() {
  const cap = capacityOf(state.plots[editing.plot]), n = countBlocks(workspace);
  const el = $('#block-count');
  el.textContent = `已用 ${n} / ${cap} 積木`;
  el.classList.toggle('over', n > cap);
}

function openEditor(plotId, stage) {
  const plot = plotById.get(plotId), ps = state.plots[plotId];
  $('#editor').hidden = false;
  ensureWorkspace();
  editing = null;
  workspace.clear();
  Blockly.serialization.workspaces.load((stage === 'main' ? ps.workspace : ps.workspaces[stage]) || DEFAULT_WORKSPACES[stage], workspace);
  editing = { plot: plotId, stage };
  dirty = false;
  $('#editor-title').textContent = `${plot.name}・${STAGE_LABEL[stage]}`;
  $('#editor-msg').textContent = '從左邊拖積木接到「開始」下面。沒接上的積木會變灰、不會執行。儲存後從下一輪開始生效。';
  $('#editor-msg').className = '';
  updateCount();
  Blockly.svgResize(workspace);
  workspace.scrollCenter();
}

function closeEditor(force) {
  if (!force && dirty && !confirm('腳本還沒儲存，確定要放棄修改嗎？')) return;
  editing = null;
  $('#editor').hidden = true;
  panelDirty = true;
}

function saveEditor() {
  const { plot, stage } = editing, cap = capacityOf(state.plots[plot]), n = countBlocks(workspace);
  const fail = text => { $('#editor-msg').textContent = text; $('#editor-msg').className = 'error'; };
  if (n > cap) return fail(`用了 ${n} 個積木，超過這塊田的上限 ${cap}。試著用「重複」縮短，或擴充上限。`);
  let program;
  try { program = compile(workspace); } catch (e) { if (e instanceof CompileError) return fail(e.message); throw e; }
  setProgram(state, plot, stage, program, Blockly.serialization.workspaces.save(workspace));
  save();
  closeEditor(true);
  log(`${plotById.get(plot).name}的${STAGE_LABEL[stage]}已更新，下一輪生效`);
}

$('#editor-save').onclick = saveEditor;
$('#editor-close').onclick = () => closeEditor(false);
window.addEventListener('resize', () => workspace && !$('#editor').hidden && Blockly.svgResize(workspace));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#editor').hidden) closeEditor(false); });

// ---------- 啟動 ----------

async function start() {
  defineBlocks();
  try {
    renderer = await createRenderer($('#board'));
  } catch (e) {
    $('#hint').textContent = '素材載入失敗：' + e.message + '。請用 http 伺服器開啟（見 README）。';
    throw e;
  }
  for (const c of renderer.manifest.crops) CROP_NAMES[c.id] = c.name;
  state = load();
  buildControls();
  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  requestAnimationFrame(frame);
}

start();
