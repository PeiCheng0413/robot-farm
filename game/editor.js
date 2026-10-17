// 腳本編輯畫面：左邊 Blockly 積木，右邊這塊田的特寫與試跑控制。
// 試跑是沙盒：複製田的狀態來跑，不扣真的 Token、不改真的作物。動作規則與主遊戲共用 sim.js。
// 逐步執行每個積木都停（含「如果」「重複」），並亮起正在執行的積木。

import { ACTION_COST, ACTION_LIMIT, CONTROL_LIMIT, starTarget } from './config.js';
import { plotById, cellKey } from './plots.js';
import { planAction, applyAction, senseLeaf, capacityOf, levelOf, plotsOfLevel, levelKey, CRASH_REASONS } from './sim.js';
import { createRun, step, evaluate, describeCondition, usesPlotSense } from './interpreter.js';
import { createPlotView } from './render.js';
import { TOOLBOX, createTheme, registerFunctionCategory, DEFAULT_WORKSPACES, compile, countBlocks, CompileError } from './blocks.js';

const Blockly = window.Blockly;
const $ = s => document.querySelector(s);

export const STAGE_LABEL = { main: '腳本', sow: '播種腳本', harvest: '採收腳本', water: '澆水腳本' };
const ACTION_NAMES = { move: '前進一格', turnLeft: '左轉', turnRight: '右轉', sow: '播種', water: '澆水', harvest: '採收' };
const SPEEDS = [[0.5, '慢'], [1, '中'], [2.5, '快']];
const THINK_MS = 650, RESULT_MS = 750, PAUSE_MS = 450;

// 試跑情境：讓學生把每條分支都測一遍。
const SCENARIOS = {
  current: '目前田的樣子',
  empty: '全部空地',
  mature: '全部成熟',
  dry: '生長中、土壤乾裂',
  mixed: '混合（空地／乾裂／成熟）',
};
const DEFAULT_SCENARIO = { main: 'mixed', sow: 'empty', harvest: 'mature', water: 'dry' };

// 過關檢查：跑完後整塊田應該達成什麼。每種腳本只檢查自己負責的事；專家田的一份腳本全部都要顧。
const GOALS = {
  empty:  { test: c => !c.crop,                                   text: n => `還有 ${n} 格空地沒種到` },
  mature: { test: c => c.crop && c.growth >= 1,                   text: n => `還有 ${n} 格成熟作物沒採收` },
  dry:    { test: c => c.crop && c.growth < 1 && c.moisture === 0, text: n => `還有 ${n} 格乾裂沒澆到` },
  soaked: { test: c => c.moisture >= 3,                           text: n => `${n} 格澆到積水了（積水不會長）` },
};
const GOALS_BY_STAGE = { sow: ['empty'], harvest: ['mature'], water: ['dry', 'soaked'], main: ['mature', 'empty', 'dry', 'soaked'] };

function checkGoals(plot, ps, stage) {
  const problems = [], marks = [];
  for (const goal of GOALS_BY_STAGE[stage]) {
    if (goal === 'dry' && plot.rules.noDrying) continue;
    const bad = plot.cells.filter(([x, y]) => GOALS[goal].test(ps.cells[cellKey(x, y)]));
    if (!bad.length) continue;
    problems.push(GOALS[goal].text(bad.length));
    for (const [x, y] of bad) marks.push({ x, y });
  }
  return { problems, marks };
}

function scenarioCells(plot, real, kind) {
  const cells = {};
  plot.cells.forEach(([x, y], i) => {
    const key = cellKey(x, y), c = { ...real.cells[key] };
    const set = (crop, growth, moisture) => Object.assign(c, { crop, growth, moisture, dryMs: 0 });
    if (kind === 'empty') set(null, 0, 1);
    else if (kind === 'mature') set(real.crop, 1, 1);
    else if (kind === 'dry') set(real.crop, 0.5, plot.rules.noDrying ? 1 : 0);
    else if (kind === 'mixed') [() => set(null, 0, 1), () => set(real.crop, 0.5, plot.rules.noDrying ? 1 : 0), () => set(real.crop, 1, 1)][i % 3]();
    cells[key] = c;
  });
  return cells;
}

// 編輯畫面的 HTML 由這裡掛上去，主畫面與測試畫面不必各寫一份。
const MARKUP = `
<div id="editor" class="editor" hidden>
  <div class="editor-bar">
    <h2 id="editor-title"></h2>
    <span id="block-count" class="count"></span>
    <button id="editor-save" class="primary">儲存腳本</button>
    <button id="editor-close">返回農場</button>
  </div>
  <p id="editor-msg" role="status"></p>
  <div class="editor-body">
    <div id="blockly"></div>
    <section class="runner" aria-label="試跑">
      <div class="runner-head">
        <h3>試跑</h3>
        <span class="runner-note">沙盒：不扣真的 Token、不改真的田</span>
      </div>
      <p id="editor-rule" class="runner-rule"></p>
      <canvas id="runner-view" aria-label="這塊田的特寫，機器人照腳本動作"></canvas>
      <p id="runner-status" class="runner-status" aria-live="polite"></p>
      <div id="runner-check" class="runner-check" aria-live="polite" hidden></div>
      <div class="runner-controls">
        <button id="run-toggle" class="primary">▶ 執行</button>
        <button id="run-step">下一步 ⏭</button>
        <button id="run-reset">⟲ 重來</button>
      </div>
      <div class="runner-options">
        <span class="option-label">速度</span><div id="run-speed" class="buttons"></div>
        <label for="run-scenario" class="option-label">田的情境</label>
        <select id="run-scenario"></select>
      </div>
      <p id="runner-stats" class="runner-stats"></p>
    </section>
  </div>
</div>`;

export function createEditor({ assets, getState, onSave, onStars }) {
  if (!$('#editor')) document.body.insertAdjacentHTML('beforeend', MARKUP);
  let workspace = null, editing = null, dirty = false, view = null;
  let sandbox = null, mode = 'paused', speed = 1, scenario = 'current', last = 0, raf = 0;

  // ---------- Blockly ----------

  function ensureWorkspace() {
    if (workspace) return;
    workspace = Blockly.inject('blockly', {
      toolbox: TOOLBOX, theme: createTheme(), renderer: 'zelos', media: 'vendor/blockly/media/',
      trashcan: true, sounds: false, maxInstances: { rf_start: 1 },
      zoom: { controls: true, wheel: false, startScale: 0.9 }, move: { scrollbars: true, drag: true, wheel: true },
    });
    registerFunctionCategory(workspace);
    workspace.addChangeListener(Blockly.Events.disableOrphans);
    workspace.addChangeListener(e => {
      if (e.isUiEvent || !editing) return;
      dirty = true;
      updateCount();
      resetSandbox('積木改過了，試跑從頭開始。');
    });
  }

  function updateCount() {
    const cap = capacityOf(getState(), editing.plot), n = countBlocks(workspace);
    $('#block-count').textContent = `已用 ${n} / ${cap} 積木`;
    $('#block-count').classList.toggle('over', n > cap);
  }

  const highlight = id => workspace.highlightBlock(id || null);

  // ---------- 沙盒 ----------

  function resetSandbox(message) {
    const plot = plotById.get(editing.plot), real = getState().plots[editing.plot];
    sandbox = {
      plot, ps: { crop: real.crop, cells: scenarioCells(plot, real, scenario) },
      robot: { plot: plot.id, x: plot.entry.x, y: plot.entry.y, heading: plot.entry.heading },
      tokens: getState().tokens, spent: 0, money: 0, actions: 0, steps: 0, controls: 0, bumps: 0, wasted: 0, marks: [],
      run: null, act: null, clock: sandbox?.clock || 0, status: 'ready', pending: false,
    };
    mode = 'paused';
    showCheck(null);
    if (workspace) highlight(null);
    say(message || '按「執行」連續跑，或按「下一步」一次走一個積木。試跑不會扣真的 Token。');
    renderControls();
  }

  function ensureRun() {
    if (sandbox.run) return true;
    try {
      sandbox.run = createRun(compile(workspace));
      sandbox.blocks = countBlocks(workspace);
      return true;
    } catch (e) {
      if (!(e instanceof CompileError)) throw e;
      say('沒辦法執行：' + e.message, 'error');
      mode = 'paused';
      return false;
    }
  }

  function crash(reason) {
    sandbox.status = 'crashed';
    Object.assign(sandbox.robot, { phase: 'stuck', stuckAt: sandbox.clock });   // 播當機動畫，重置沙盒就恢復
    mode = 'paused';
    say('當機：' + CRASH_REASONS[reason], 'error');
    showCheck({ title: '沒有過關：腳本當機了', items: [CRASH_REASONS[reason]], ok: false });
  }

  // 跑完後檢查整塊田，列出沒做到的事，並在田上標出有問題的格子。
  function finishCheck(left) {
    const sb = sandbox, { problems, marks } = checkGoals(sb.plot, sb.ps, editing.stage);
    sb.marks = marks;
    const tips = [];
    if (sb.bumps) tips.push(`撞到邊界 ${sb.bumps} 次，每次白扣 Token`);
    if (sb.wasted) tips.push(`白做 ${sb.wasted} 次（腳下那格不需要），可以加「如果」判斷`);
    const summary = `${left ? '離開這塊田' : '腳本跑完了'}：${sb.actions} 個動作，花 ${sb.spent} Token，賺 ${sb.money} 金錢。`;
    if (problems.length) {
      say(summary, 'warn');
      showCheck({ title: '還沒過關', items: problems, tips, ok: false });
      return;
    }
    // 星等：一星過關；二星積木數在目標內；三星再加上沒有白做、沒有撞牆。只在預設情境下記錄，避免挑簡單情境刷星。
    const plot = sb.plot, target = starTarget(plot.shape, plot.type, editing.stage);
    const stars = 1 + (sb.blocks <= target ? 1 + (!sb.bumps && !sb.wasted ? 1 : 0) : 0);
    const graded = scenario === DEFAULT_SCENARIO[editing.stage];
    const starText = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const how = [`用了 ${sb.blocks} 塊積木，目標 ${target === Infinity ? '—' : target} 塊`];
    if (stars === 2) how.push('三星條件：不能白做、不能撞牆');
    if (!graded) how.push(`這個情境不記分；要記星等，請用「${SCENARIOS[DEFAULT_SCENARIO[editing.stage]]}」情境試跑`);
    say(summary, 'done');
    showCheck({ title: `過關！${starText}`, items: [], tips: [...how, ...tips], ok: true });
    if (graded) onStars?.(editing.plot, editing.stage, stars);
  }

  function showCheck(result) {
    const el = $('#runner-check');
    el.hidden = !result;
    if (!result) return;
    el.className = 'runner-check ' + (result.ok ? 'ok' : 'bad');
    const list = (items, cls) => items.length ? `<ul class="${cls}">${items.map(t => `<li>${t}</li>`).join('')}</ul>` : '';
    el.innerHTML = `<p class="check-title">${result.ok ? '✔' : '✘'} ${result.title}</p>`
      + list(result.items, 'check-problems')
      + (result.tips?.length ? `<p class="check-tip-title">可以更好</p>${list(result.tips, 'check-tips')}` : '');
  }

  // 執行一個積木，並排好對應的動畫。
  function advance() {
    const sb = sandbox;
    if (!ensureRun()) return;
    const sense = cond => evaluate(cond, leaf => senseLeaf(sb.tokens, sb.robot, sb.ps, leaf));
    const e = step(sb.run, sense);
    sb.steps++;
    if (e.id) highlight(e.id);
    const start = sb.clock;
    switch (e.type) {
      case 'action': {
        if (sb.actions >= ACTION_LIMIT) return crash('tooLong');
        const cost = sb.plot.rules.tokenFree ? 0 : ACTION_COST[e.op];
        if (sb.tokens < cost) return crash('token');
        sb.tokens -= cost; sb.spent += cost; sb.actions++; sb.controls = 0;
        const act = planAction(sb.ps, sb.robot, e.op);
        sb.act = { ...act, start, end: start + act.ms, cost };
        if (act.result === 'bump') sb.bumps++;
        if (act.result === 'noop') sb.wasted++;
        const note = act.result === 'bump' ? '：前面不是田，撞到了' : act.result === 'noop' ? '：這格不需要，白做了' : '';
        say(`第 ${sb.steps} 步｜${ACTION_NAMES[e.op]}${cost ? `（−${cost} Token）` : ''}${note}`, act.result === 'ok' ? '' : 'warn');
        if (cost) view.floatAt(sb.robot.x, sb.robot.y, `−${cost}`, '#35665b');
        return;
      }
      case 'cond': {
        if (++sb.controls > CONTROL_LIMIT) return crash('runaway');
        const scan = usesPlotSense(e.cond);
        const think = scan ? view.painter.clipLength('scan') : THINK_MS;
        const kind = workspace.getBlockById(e.id)?.type === 'rf_while' ? '當' : '如果';
        sb.act = { kind: 'decide', scan, value: e.value, start, mid: start + think, end: start + think + RESULT_MS, text: `${kind}「${describeCondition(e.cond)}」` };
        say(`第 ${sb.steps} 步｜判斷 ${sb.act.text}${scan ? '：掃描整塊田…' : '…'}`);
        return;
      }
      case 'loop':
        if (++sb.controls > CONTROL_LIMIT) return crash('runaway');
        sb.act = { kind: 'pause', start, end: start + PAUSE_MS };
        say(`第 ${sb.steps} 步｜重複：第 ${e.iteration} / ${e.times} 圈`);
        return;
      case 'call':
        if (++sb.controls > CONTROL_LIMIT) return crash('runaway');
        sb.act = { kind: 'pause', start, end: start + PAUSE_MS };
        say(`第 ${sb.steps} 步｜執行函式「${e.name}」`);
        return;
      case 'done':
        sb.status = 'done';
        mode = 'paused';
        if (!e.left) highlight(null);
        finishCheck(e.left);
        return;
      case 'error':
        return crash(e.error);
    }
  }

  function finishAct() {
    const sb = sandbox, act = sb.act;
    sb.act = null;
    if (act.kind === 'decide' || act.kind === 'pause') return;
    const money = applyAction(sb.ps, sb.robot, act);
    if (money) { sb.money += money; view.floatAt(sb.robot.x, sb.robot.y, '+' + money, '#8a5a12'); }
    if (act.result === 'bump') view.floatAt(act.from.x, act.from.y, '撞到了', '#c65f48');
    if (act.result === 'noop') view.floatAt(act.from.x, act.from.y, '白做了', '#6b5a3a');
  }

  function tick(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    const sb = sandbox;
    sb.clock += dt * (sb.act ? speed : 1);
    if (sb.act?.kind === 'decide' && !sb.act.revealed && sb.clock >= sb.act.mid) {
      sb.act.revealed = true;
      say(`第 ${sb.steps} 步｜判斷 ${sb.act.text} → ${sb.act.value ? '成立 ✔' : '不成立 ✘'}`, sb.act.value ? 'yes' : 'no');
    }
    if (sb.act && sb.clock >= sb.act.end) finishAct();
    if (!sb.act && sb.status === 'ready' && (mode === 'running' || sb.pending)) { sb.pending = false; advance(); }
    view.draw({ ps: sb.ps, robot: sb.robot, act: sb.act, time: sb.clock, marks: sb.marks });
    renderStats();
    raf = requestAnimationFrame(tick);
  }

  // ---------- 介面 ----------

  function say(text, kind = '') {
    const el = $('#runner-status');
    el.textContent = text;
    el.className = 'runner-status ' + kind;
  }

  function renderControls() {
    const finished = sandbox && sandbox.status !== 'ready';
    $('#run-toggle').textContent = mode === 'running' ? '⏸ 暫停' : '▶ 執行';
    $('#run-toggle').disabled = finished;
    $('#run-step').disabled = finished || mode === 'running';
    $('#run-speed').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === speed)));
  }

  let lastStats = '';
  function renderStats() {
    const sb = sandbox;
    const html = `<span>第 <b>${sb.steps}</b> 步</span><span>動作 <b>${sb.actions}</b></span>`
      + `<span>花 <b>${sb.spent}</b> Token</span><span>賺 <b>${sb.money}</b> 金錢</span>`;
    if (html !== lastStats) { $('#runner-stats').innerHTML = html; lastStats = html; }
    if ((sb.status !== 'ready') !== $('#run-toggle').disabled) renderControls();
  }

  $('#run-toggle').onclick = () => {
    mode = mode === 'running' ? 'paused' : 'running';
    renderControls();
  };
  $('#run-step').onclick = () => { if (sandbox.status === 'ready') sandbox.pending = true; };
  $('#run-reset').onclick = () => resetSandbox();
  $('#run-speed').innerHTML = SPEEDS.map(([v, t]) => `<button data-speed="${v}">${t}</button>`).join('');
  $('#run-speed').onclick = e => { const b = e.target.closest('button'); if (b) { speed = +b.dataset.speed; renderControls(); } };
  $('#run-scenario').innerHTML = Object.entries(SCENARIOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('#run-scenario').onchange = e => { scenario = e.target.value; resetSandbox(); };

  // ---------- 開關 ----------

  function open(plotId, stage) {
    const plot = plotById.get(plotId), ps = getState().plots[plotId];
    $('#editor').hidden = false;
    document.body.classList.add('editing');
    ensureWorkspace();
    editing = null;
    workspace.clear();
    Blockly.serialization.workspaces.load(levelOf(getState(), plotId).workspaces[stage] || DEFAULT_WORKSPACES.main, workspace);
    editing = { plot: plotId, stage };
    dirty = false;
    const shared = plotsOfLevel(getState(), levelKey(plot.shape, plot.type)).length;
    $('#editor-title').textContent = `${plot.name.replace(/ \d+$/, '')}・${STAGE_LABEL[stage]}` + (shared > 1 ? `（${shared} 塊田共用）` : '');
    $('#editor-rule').textContent = plot.rules.rule;
    $('#editor-msg').textContent = '從左邊拖積木接到「開始」下面。沒接上的積木會變灰、不會執行。儲存後從下一輪開始生效。';
    $('#editor-msg').className = '';
    updateCount();
    const canvas = $('#runner-view');
    view = createPlotView(canvas, plot, assets, getState().layout[plotId]?.rot || 0);
    scenario = DEFAULT_SCENARIO[stage];
    $('#run-scenario').value = scenario;
    resetSandbox();
    Blockly.svgResize(workspace);
    workspace.scrollCenter();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function close(force) {
    if (!force && dirty && !confirm('腳本還沒儲存，確定要放棄修改嗎？')) return false;
    cancelAnimationFrame(raf);
    highlight(null);
    editing = null;
    $('#editor').hidden = true;
    document.body.classList.remove('editing');
    return true;
  }

  function save() {
    const { plot, stage } = editing, cap = capacityOf(getState(), plot), n = countBlocks(workspace);
    const fail = text => { $('#editor-msg').textContent = text; $('#editor-msg').className = 'error'; };
    if (n > cap) return fail(`用了 ${n} 個積木，超過這塊田的上限 ${cap}。試著用「重複」或函式縮短，或擴充上限。`);
    let program;
    try { program = compile(workspace); } catch (e) { if (e instanceof CompileError) return fail(e.message); throw e; }
    onSave(plot, stage, program, Blockly.serialization.workspaces.save(workspace));
    close(true);
  }

  $('#editor-save').onclick = save;
  $('#editor-close').onclick = () => close(false);
  window.addEventListener('resize', () => workspace && editing && Blockly.svgResize(workspace));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing) close(false); });

  return { open, isOpen: () => !!editing };
}
