// 上課練習頁（practice.html）：一關一塊固定的田，學生用積木寫程式完成目標。
// 跟農場完全獨立：不扣 Token、不賺錢、不讀寫農場存檔；進度與每關的積木存在這台瀏覽器。
// 進度依班級座號（classpass.js 讓學生輸入）分開存：換了班級座號就是另一位同學，要從頭玩，
// 免得拿別人玩出來的星星用自己的座號出示給老師掃。
// 關卡內容在 lessons.js；動作規則、直譯器、積木、田的特寫與農場共用。

import { ACTION_LIMIT, CONTROL_LIMIT } from './config.js';
import { cellKey } from './plots.js';
import { planAction, applyAction, senseLeaf, CRASH_REASONS } from './sim.js';
import { createRun, step, evaluate, describeCondition, usesPlotSense } from './interpreter.js';
import { loadAssets, createPlotView } from './render.js';
import { defineBlocks, createTheme, DEFAULT_WORKSPACES, compile, countBlocks, CompileError } from './blocks.js';
import { GOALS } from './editor.js';
import { LESSONS, lessonPlot, lessonCells } from './lessons.js';

const Blockly = window.Blockly;
const $ = s => document.querySelector(s);
const SAVE_KEY = 'robot-farm-practice';
const ACTION_NAMES = { move: '前進一格', turnLeft: '左轉', turnRight: '右轉', sow: '播種', water: '澆水', harvest: '採收' };
const NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const SPEEDS = [[0.5, '慢'], [1, '中'], [2.5, '快']];
const THINK_MS = 650, RESULT_MS = 750, PAUSE_MS = 450;
const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
const lessonName = i => `關卡${NUMBERS[i] || i + 1}`;

// ---------- 進度 ----------

// 存檔：{ version: 2, students: { "班級|座號": { levels: { 關卡id: { stars, time, workspace } } } } }
// 第 1 版沒有分學生，不知道是誰玩的，所以不沿用。
function loadAll() {
  try { const p = JSON.parse(localStorage.getItem(SAVE_KEY)); if (p?.version === 2) return p; } catch (e) { /* 讀不到就從頭開始 */ }
  return { version: 2, students: {} };
}
let all = loadAll();
let who = null, progress = null;   // 目前的學生（{ cls, no }）與他的進度；還沒輸入班級座號時是 null
const record = id => progress.levels[id] || (progress.levels[id] = { stars: 0, workspace: null });
function saveProgress() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(all)); } catch (e) { /* 私密視窗存不了，照常練習 */ }
}

// 班級座號可能在 classpass 的對話框裡被改掉，所以定時對一下；換人就切換進度並回到關卡列表。
const keyOf = s => s ? s.cls + '|' + s.no : null;
function syncStudent() {
  const s = window.ClassPass.getStudent();
  if (keyOf(s) === keyOf(who)) return;
  who = s;
  progress = s ? (all.students[keyOf(s)] ||= { levels: {} }) : null;
  if (lesson) close();
  renderWho();
  renderList();
}
const askStudent = () => window.ClassPass.editStudent().then(syncStudent);

function renderWho() {
  $('#student').innerHTML = who
    ? `目前是 <b>${escapeHtml(who.cls)} 班 ${escapeHtml(who.no)} 號</b>`
    : '<b>請先輸入班級和座號，才能開始練習。</b>';
  $('#change-student').textContent = who ? '換人／修改班級座號' : '輸入班級座號';
  $('#change-student').className = who ? '' : 'primary';
}
const escapeHtml = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- 關卡列表 ----------

function renderList() {
  $('#lesson-list').innerHTML = LESSONS.map((lesson, i) => {
    const got = progress?.levels[lesson.id]?.stars || 0;
    return `<li><button class="lesson-card${got ? ' cleared' : ''}" data-index="${i}">
      <span class="lesson-number">${lessonName(i)}</span>
      <span class="lesson-title">${lesson.title}</span>
      ${miniMap(lesson)}
      <span class="lesson-stars" aria-label="${got} 顆星">${stars(got)}</span>
    </button></li>`;
  }).join('');
}

// 卡片上的小地圖：一格一個方塊，乾裂、濕潤、空地顏色不同。
function miniMap(lesson) {
  const width = Math.max(...lesson.map.map(r => r.length));
  const cells = lesson.map.flatMap(row => [...row.padEnd(width, '.')].map(ch => `<i class="mini-${ch === '.' ? 'none' : ch}"></i>`));
  return `<span class="mini-map" style="--cols:${width}" aria-hidden="true">${cells.join('')}</span>`;
}

// 過關 QR code（class-pass 協定，vendor/classpass）：一張 QR 裝所有已過關的關卡，老師用 class-pass app 掃描。
// 分數是星等（滿分 3）；完成時間是拿到最好星等的那一次，舊進度沒記時間的用現在。
const PASS_GAME = 'robot-farm-practice';
$('#show-pass').onclick = () => {
  if (!progress) return askStudent();
  const now = Math.floor(Date.now() / 1000);
  const levels = LESSONS.filter(l => progress.levels[l.id]?.stars > 0)
    .map(l => ({ level: l.id, title: l.title, score: progress.levels[l.id].stars, max: 3, time: progress.levels[l.id].time || now }));
  if (levels.length) window.ClassPass.show({ game: PASS_GAME, levels }).catch(() => {});
  else window.ClassPass.showPassed(PASS_GAME);
};

$('#lesson-list').onclick = e => {
  const b = e.target.closest('[data-index]');
  if (!b) return;
  if (progress) open(+b.dataset.index);
  else askStudent().then(() => progress && open(+b.dataset.index));
};
$('#change-student').onclick = () => {
  if (who && !confirm('換了班級座號就是另一位同學，要從第一關重新玩。確定要換嗎？')) return;
  askStudent();
};
$('#reset-progress').onclick = () => {
  if (!confirm('確定要清除這台電腦上所有同學的星星與積木嗎？清除後不能復原。')) return;
  all = { version: 2, students: {} };
  saveProgress();
  who = undefined;   // 強制重新同步
  syncStudent();
};

// ---------- 練習畫面 ----------

let assets = null, workspace = null, current = -1, lesson = null, plot = null, view = null;
let sandbox = null, mode = 'paused', speed = 1, last = 0, raf = 0;

function ensureWorkspace() {
  if (workspace) return;
  workspace = Blockly.inject('blockly', {
    toolbox: { kind: 'flyoutToolbox', contents: [] }, theme: createTheme(), renderer: 'zelos', media: 'vendor/blockly/media/',
    trashcan: true, sounds: false, maxInstances: { rf_start: 1 },
    zoom: { controls: true, wheel: false, startScale: 1 }, move: { scrollbars: true, drag: true, wheel: true },
  });
  workspace.addChangeListener(Blockly.Events.disableOrphans);
  workspace.addChangeListener(e => {
    if (e.isUiEvent || !lesson) return;
    record(lesson.id).workspace = Blockly.serialization.workspaces.save(workspace);   // 隨時存，下課關掉也不會不見
    saveProgress();
    updateCount();
    resetSandbox('積木改過了，試跑從頭開始。');
  });
}

function open(index) {
  current = index;
  lesson = LESSONS[index];
  plot = lessonPlot(lesson);
  $('#home').hidden = true;
  $('#lesson').hidden = false;
  ensureWorkspace();
  workspace.updateToolbox({ kind: 'flyoutToolbox', contents: lesson.tools.map(type => ({ kind: 'block', type })) });
  Blockly.Events.disable();   // 載入存好的積木不算「改過」
  try {
    workspace.clear();
    Blockly.serialization.workspaces.load(record(lesson.id).workspace || DEFAULT_WORKSPACES.main, workspace);
  } finally { Blockly.Events.enable(); }
  $('#lesson-title').textContent = `${lessonName(index)}｜${lesson.title}`;
  $('#lesson-who').textContent = `${who.cls} 班 ${who.no} 號`;
  $('#lesson-goal').textContent = lesson.goal;
  $('#lesson-hint').hidden = true;
  $('#lesson-hint').textContent = '💡 ' + lesson.hint;
  $('#lesson-stars-rule').textContent = `★ 完成目標　★★ 用 ${lesson.stars[0]} 塊積木以內　★★★ 用 ${lesson.stars[1]} 塊以內，而且沒撞牆、沒白做`;
  $('#prev-lesson').disabled = index === 0;
  $('#next-lesson').disabled = index === LESSONS.length - 1;
  updateCount();
  view = createPlotView($('#runner-view'), plot, assets, 0);
  resetSandbox();
  Blockly.svgResize(workspace);
  workspace.scrollCenter();
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
  location.hash = 'lesson=' + (index + 1);
}

function close() {
  cancelAnimationFrame(raf);
  if (workspace) workspace.highlightBlock(null);
  lesson = null;
  $('#lesson').hidden = true;
  $('#home').hidden = false;
  renderList();
  history.replaceState(null, '', location.pathname);
}

function updateCount() {
  const n = countBlocks(workspace);
  $('#block-count').textContent = `已用 ${n} 塊積木`;
}

// ---------- 試跑 ----------

const highlight = id => workspace.highlightBlock(id || null);

function resetSandbox(message) {
  sandbox = {
    ps: { crop: 'lettuce', cells: lessonCells(lesson) },
    robot: { plot: plot.id, x: plot.entry.x, y: plot.entry.y, heading: plot.entry.heading },
    actions: 0, steps: 0, controls: 0, bumps: 0, wasted: 0, marks: [],
    run: null, act: null, clock: sandbox?.clock || 0, status: 'ready', pending: false,
  };
  mode = 'paused';
  showCheck(null);
  highlight(null);
  say(message || '從左邊拖積木接到「開始」下面，再按「執行」看看機器人怎麼做。');
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
    renderControls();
    return false;
  }
}

function crash(reason) {
  sandbox.status = 'crashed';
  Object.assign(sandbox.robot, { phase: 'stuck', stuckAt: sandbox.clock });
  mode = 'paused';
  say('當機：' + CRASH_REASONS[reason], 'error');
  showCheck({ title: '沒有完成：程式當機了', items: [CRASH_REASONS[reason]], ok: false });
}

function finishCheck() {
  const sb = sandbox, problems = [], marks = [];
  for (const goal of lesson.goals) {
    const bad = plot.cells.filter(([x, y]) => GOALS[goal].test(sb.ps.cells[cellKey(x, y)]));
    if (!bad.length) continue;
    problems.push(GOALS[goal].text(bad.length));
    for (const [x, y] of bad) marks.push({ x, y });
  }
  sb.marks = marks;
  const tips = [];
  if (sb.bumps) tips.push(`撞到邊界 ${sb.bumps} 次`);
  if (sb.wasted) tips.push(`白做 ${sb.wasted} 次（那一格不需要）`);
  if (problems.length) {
    say(`程式跑完了，但還沒完成目標。`, 'warn');
    showCheck({ title: '還沒完成', items: problems, tips, ok: false });
    return;
  }
  const [two, three] = lesson.stars, n = sb.blocks;
  const got = n <= three && !sb.bumps && !sb.wasted ? 3 : n <= two ? 2 : 1;
  const how = [`這次用了 ${n} 塊積木`];
  if (got === 1) how.push(`想要 ★★：試著用「重複」把積木減到 ${two} 塊以內`);
  if (got === 2) how.push(n <= three ? '想要 ★★★：不要撞牆、不要白做' : `想要 ★★★：再減到 ${three} 塊以內，而且不撞牆、不白做`);
  const best = record(lesson.id).stars;
  if (got > best) { Object.assign(record(lesson.id), { stars: got, time: Math.floor(Date.now() / 1000) }); saveProgress(); }
  say(`完成了！跑了 ${sb.actions} 個動作。`, 'done');
  showCheck({ title: `完成！${stars(got)}` + (got > best && best ? '（新紀錄）' : ''), items: [], tips: [...how, ...tips], ok: true, next: current < LESSONS.length - 1 });
}

function showCheck(result) {
  const el = $('#runner-check');
  el.hidden = !result;
  if (!result) return;
  el.className = 'runner-check ' + (result.ok ? 'ok' : 'bad');
  const list = (items, cls) => items.length ? `<ul class="${cls}">${items.map(t => `<li>${t}</li>`).join('')}</ul>` : '';
  el.innerHTML = `<p class="check-title">${result.ok ? '✔' : '✘'} ${result.title}</p>`
    + list(result.items, 'check-problems')
    + (result.tips?.length ? list(result.tips, 'check-tips') : '')
    + (result.next ? '<button id="check-next" class="primary">下一關 →</button>' : '');
  if (result.next) $('#check-next').onclick = () => open(current + 1);
}

// 執行一個積木，並排好對應的動畫（與腳本編輯畫面相同，只是不扣 Token）。
function advance() {
  const sb = sandbox;
  if (!ensureRun()) return;
  const sense = cond => evaluate(cond, leaf => senseLeaf(Infinity, sb.robot, sb.ps, leaf));
  const e = step(sb.run, sense);
  sb.steps++;
  if (e.id) highlight(e.id);
  const start = sb.clock;
  switch (e.type) {
    case 'action': {
      if (sb.actions >= ACTION_LIMIT) return crash('tooLong');
      sb.actions++; sb.controls = 0;
      const act = planAction(sb.ps, sb.robot, e.op);
      sb.act = { ...act, start, end: start + act.ms };
      if (act.result === 'bump') sb.bumps++;
      if (act.result === 'noop') sb.wasted++;
      const note = act.result === 'bump' ? '：前面不是田，撞到了' : act.result === 'noop' ? '：這格不需要，白做了' : '';
      say(`第 ${sb.steps} 步｜${ACTION_NAMES[e.op]}${note}`, act.result === 'ok' ? '' : 'warn');
      return;
    }
    case 'cond': {
      if (++sb.controls > CONTROL_LIMIT) return crash('runaway');
      const scan = usesPlotSense(e.cond);
      const think = scan ? view.painter.clipLength('scan') : THINK_MS;
      const kind = workspace.getBlockById(e.id)?.type === 'rf_while' ? '當' : '如果';
      sb.act = { kind: 'decide', scan, value: e.value, start, mid: start + think, end: start + think + RESULT_MS, text: `${kind}「${describeCondition(e.cond)}」` };
      say(`第 ${sb.steps} 步｜判斷 ${sb.act.text}…`);
      return;
    }
    case 'loop':
      if (++sb.controls > CONTROL_LIMIT) return crash('runaway');
      sb.act = { kind: 'pause', start, end: start + PAUSE_MS };
      say(`第 ${sb.steps} 步｜重複：第 ${e.iteration} / ${e.times} 次`);
      return;
    case 'call':
      if (++sb.controls > CONTROL_LIMIT) return crash('runaway');
      sb.act = { kind: 'pause', start, end: start + PAUSE_MS };
      say(`第 ${sb.steps} 步｜執行函式「${e.name}」`);
      return;
    case 'done':
      sb.status = 'done';
      mode = 'paused';
      highlight(null);
      finishCheck();
      return;
    case 'error':
      return crash(e.error);
  }
}

function finishAct() {
  const sb = sandbox, act = sb.act;
  sb.act = null;
  if (act.kind === 'decide' || act.kind === 'pause') return;
  applyAction(sb.ps, sb.robot, act);
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
  if ((sb.status !== 'ready') !== $('#run-toggle').disabled) renderControls();
  raf = requestAnimationFrame(tick);
}

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

$('#run-toggle').onclick = () => { mode = mode === 'running' ? 'paused' : 'running'; renderControls(); };
$('#run-step').onclick = () => { if (sandbox.status === 'ready') sandbox.pending = true; };
$('#run-reset').onclick = () => resetSandbox();
$('#run-speed').innerHTML = SPEEDS.map(([v, t]) => `<button data-speed="${v}">${t}</button>`).join('');
$('#run-speed').onclick = e => { const b = e.target.closest('button'); if (b) { speed = +b.dataset.speed; renderControls(); } };
$('#show-hint').onclick = () => { $('#lesson-hint').hidden = false; };
$('#clear-blocks').onclick = () => {
  if (!confirm('確定要清空這一關的積木，從頭開始寫嗎？')) return;
  workspace.clear();
  Blockly.serialization.workspaces.load(DEFAULT_WORKSPACES.main, workspace);
};
$('#back-home').onclick = close;
$('#prev-lesson').onclick = () => open(current - 1);
$('#next-lesson').onclick = () => open(current + 1);
window.addEventListener('resize', () => workspace && lesson && Blockly.svgResize(workspace));

// ---------- 啟動 ----------

async function start() {
  defineBlocks();
  try {
    assets = await loadAssets((done, total) => { $('#loading-text').textContent = `正在載入素材 ${done} / ${total}`; }, { signs: false });
  } catch (e) {
    $('#loading-text').textContent = '素材載入失敗，請重新整理頁面。（' + e.message + '）';
    return;
  }
  $('#loading').hidden = true;
  syncStudent();
  setInterval(syncStudent, 1000);
  // 網址 #lesson=3 直接打開第三關，方便老師把連結貼給全班。
  const n = +(/lesson=(\d+)/.exec(location.hash)?.[1] || 0);
  $('#home').hidden = false;
  if (!progress) askStudent().then(() => progress && n >= 1 && n <= LESSONS.length && open(n - 1));
  else if (n >= 1 && n <= LESSONS.length) open(n - 1);
}

start();
