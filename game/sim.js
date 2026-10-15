// 遊戲模擬：狀態、時間推進、機器人排程、動作效果、經濟。純邏輯，不碰 DOM 與畫面。
// 同樣的狀態加上同樣的時間一定得到同樣的結果（docs/BACKLOG.md：排程必須是確定性的）。
// 畫面層只讀 state 與 drainEvents()，格式見 docs/GAME_EVENTS.md。

import {
  START, SAVE_VERSION, TOKENS_PER_MONEY, ACTION_COST, ACTION_MS, TRAVEL_MS, IDLE_MS, ACTION_LIMIT, CALL_DEPTH,
  CAPACITY, capacityCost, MOISTURE_DECAY_MS, GROWTH_RATE_BY_MOISTURE, CROPS,
} from './config.js';
import { PLOTS, plotById, cellKey, stagesOf } from './plots.js';
import { createRun, nextAction, evaluate, programBody } from './interpreter.js';

// 朝向順序與左右轉方向和 manifest.movement 一致：右轉 +1、左轉 -1。
export const HEADINGS = ['south', 'west', 'north', 'east'];
export const VECTORS = { south: [0, 1], west: [-1, 0], north: [0, -1], east: [1, 0] };
const turned = (heading, delta) => HEADINGS[(HEADINGS.indexOf(heading) + delta + 4) % 4];

export const CRASH_REASONS = {
  token: 'Token 不足，腳本執行到一半停住了',
  runaway: '迴圈裡沒有任何動作，機器人原地打轉',
  tooLong: `一次執行超過 ${ACTION_LIMIT} 個動作，腳本可能停不下來`,
  deep: `函式一層叫一層超過 ${CALL_DEPTH} 層，可能是函式呼叫了自己`,
  missing: '腳本呼叫了不存在的函式',
};

// 事件佇列跟著各自的 state，不進存檔。
const queues = new WeakMap();
const queue = state => queues.get(state) || queues.set(state, []).get(state);
const emit = (state, type, data) => queue(state).push({ type, time: state.time, ...data });
export const drainEvents = state => queue(state).splice(0);

// ---------- 建立與讀取 ----------

function newPlotState(plot) {
  const cells = {};
  for (const [x, y] of plot.cells) cells[cellKey(x, y)] = { crop: null, growth: 0, moisture: 1, dryMs: 0 };
  return {
    crop: plot.defaultCrop, crashed: null, cells, capacityLevel: 0, lastRun: null,
    // 自動選腳本的類型分播種／採收（／澆水）多份，否則只有 main 一份（plots.js stagesOf）。
    // programs 是編譯後的指令樹，workspaces 是 Blockly 存檔。
    programs: Object.fromEntries(stagesOf(plot).map(s => [s, []])),
    workspaces: Object.fromEntries(stagesOf(plot).map(s => [s, null])),
  };
}

function newRobot(id, plot) {
  return { id, plot: plot.id, x: plot.entry.x, y: plot.entry.y, heading: plot.entry.heading, phase: 'idle', act: null, run: null, freeAt: 0, lastPlot: -1 };
}

export function createState() {
  const plots = {};
  for (const p of PLOTS) plots[p.id] = newPlotState(p);
  return { version: SAVE_VERSION, tokens: START.tokens, money: START.money, time: 0, plots, robots: [newRobot(1, PLOTS[0])] };
}

// 存檔不保存執行中的腳本進度：讀檔後機器人回到待命，下次從頭跑（與「中斷就從頭」一致）。
// 當機狀態保留，仍然要手動重置。
export function serialize(state) {
  return JSON.stringify({ ...state, robots: state.robots.map(r => ({ ...r, run: null, act: null })) });
}

export function restore(json) {
  const saved = JSON.parse(json);
  if (saved.version !== SAVE_VERSION) return null;
  const state = createState();
  Object.assign(state, { tokens: saved.tokens, money: saved.money, time: saved.time });
  for (const p of PLOTS) if (saved.plots[p.id]) Object.assign(state.plots[p.id], saved.plots[p.id]);
  state.robots = saved.robots.map(r => ({ ...r, act: null, run: null, freeAt: saved.time, phase: r.phase === 'stuck' ? 'stuck' : 'idle' }));
  return state;
}

// ---------- 時間推進 ----------

export function update(state, ms) {
  while (ms > 0) {
    const step = Math.min(ms, 100);
    grow(state, step);
    state.time += step;
    ms -= step;
    for (const robot of state.robots) advanceRobot(state, robot);
  }
}

function grow(state, ms) {
  for (const plot of PLOTS) {
    for (const cell of Object.values(state.plots[plot.id].cells)) {
      if (!plot.rules.noDrying) {
        cell.dryMs += ms;
        while (cell.dryMs >= MOISTURE_DECAY_MS) {
          cell.dryMs -= MOISTURE_DECAY_MS;
          if (cell.moisture > 0) cell.moisture--;
        }
      }
      if (cell.crop && cell.growth < 1) {
        const rate = plot.rules.noDrying ? 1 : GROWTH_RATE_BY_MOISTURE[cell.moisture];
        cell.growth = Math.min(1, cell.growth + ms * rate / CROPS[cell.crop].growMs);
      }
    }
  }
}

function advanceRobot(state, robot) {
  // 一個時間片內可能連續結束動作、開始下一個；上限防止零耗時的狀態互相彈跳。
  for (let guard = 0; guard < 20; guard++) {
    if (robot.act) {
      if (state.time < robot.act.end) return;
      const act = robot.act;
      robot.act = null;
      complete(state, robot, act);
      continue;
    }
    if (robot.phase === 'stuck') return;
    if (robot.phase === 'run') stepRun(state, robot);
    else pickNext(state, robot);
  }
}

// 動作從上一個動作結束的時間點接續，不受畫面更新頻率影響。
function startAct(state, robot, act) {
  const start = Math.max(robot.freeAt, state.time - 100);
  robot.act = { ...act, start, end: start + act.ms };
  robot.freeAt = robot.act.end;
}

// ---------- 排程 ----------

// 系統自動選腳本時，各份腳本在什麼情況下會被派出去。
const NEEDS = {
  harvest: c => c.crop && c.growth >= 1,
  sow: c => !c.crop,
  water: c => c.moisture === 0,
};

function chooseProgram(plot, ps) {
  const ready = stage => programBody(ps.programs[stage]).length ? { program: ps.programs[stage], stage } : null;
  if (!plot.rules.autoScript) return ready('main');
  // 優先順序：有成熟就採收，否則有空地就播種，否則有乾裂就澆水，都沒有就跳過。
  const cells = Object.values(ps.cells);
  for (const stage of ['harvest', 'sow', 'water']) {
    if (stage in ps.programs && cells.some(NEEDS[stage])) { const choice = ready(stage); if (choice) return choice; }
  }
  return null;
}

function pickNext(state, robot) {
  for (let k = 1; k <= PLOTS.length; k++) {
    const index = (robot.lastPlot + k) % PLOTS.length;
    const plot = PLOTS[index], ps = state.plots[plot.id];
    if (ps.crashed) continue;
    if (state.robots.some(o => o !== robot && o.plot === plot.id && o.phase !== 'idle')) continue;
    const choice = chooseProgram(plot, ps);
    if (!choice) continue;
    robot.lastPlot = index;
    const ms = robot.plot === plot.id ? TRAVEL_MS / 3 : TRAVEL_MS;
    startAct(state, robot, { kind: 'travel', ms, fromPlot: robot.plot, from: { x: robot.x, y: robot.y, heading: robot.heading }, toPlot: plot.id, ...choice });
    return;
  }
  startAct(state, robot, { kind: 'wait', ms: IDLE_MS });
}

function stepRun(state, robot) {
  const plot = plotById.get(robot.plot), ps = state.plots[robot.plot];
  const result = nextAction(robot.run, cond => evaluate(cond, leaf => senseLeaf(state.tokens, robot, ps, leaf)));
  if (result.error) return crash(state, robot, result.error);
  if (result.done) return endRun(state, robot, result.left ? 'left' : 'done');
  if (robot.run.actions >= ACTION_LIMIT) return crash(state, robot, 'tooLong');

  const action = result.action;
  const cost = plot.rules.tokenFree ? 0 : ACTION_COST[action];
  if (state.tokens < cost) return crash(state, robot, 'token');
  state.tokens -= cost;
  robot.run.tokens += cost;
  robot.run.actions++;

  const act = planAction(ps, robot, action);
  act.cost = cost;
  startAct(state, robot, act);
  emit(state, 'actionStart', { robot: robot.id, plot: robot.plot, action, result: act.result, cost, from: act.from, to: act.to });
}

// ---------- 動作規則（主遊戲與編輯畫面的沙盒共用） ----------

// 結果在開始時就決定，畫面才知道要播撞牆還是正常動作；效果在動作結束時由 applyAction 套用。
export function planAction(ps, robot, action) {
  const from = { x: robot.x, y: robot.y, heading: robot.heading };
  const cell = ps.cells[cellKey(robot.x, robot.y)];
  const act = { kind: action, ms: ACTION_MS[action], from, to: from, result: 'ok', cell: cellKey(robot.x, robot.y) };
  if (action === 'move') {
    const [dx, dy] = VECTORS[robot.heading];
    const to = { x: robot.x + dx, y: robot.y + dy, heading: robot.heading };
    if (ps.cells[cellKey(to.x, to.y)]) act.to = to; else act.result = 'bump';
  } else if (action === 'turnLeft' || action === 'turnRight') {
    act.to = { ...from, heading: turned(robot.heading, action === 'turnLeft' ? -1 : 1) };
  } else if (action === 'sow') {
    if (cell.crop) act.result = 'noop';
  } else if (action === 'water') {
    if (cell.moisture >= 3) act.result = 'noop';
  } else if (action === 'harvest') {
    if (!(cell.crop && cell.growth >= 1)) act.result = 'noop';
    else act.crop = cell.crop;
  }
  return act;
}

// 套用動作效果，回傳這個動作賺到的金錢。
export function applyAction(ps, robot, act) {
  switch (act.kind) {
    case 'move': case 'turnLeft': case 'turnRight':
      Object.assign(robot, act.to);
      return 0;
    case 'sow':
      if (act.result === 'ok') Object.assign(ps.cells[act.cell], { crop: ps.crop, growth: 0 });
      return 0;
    case 'water': {
      const cell = ps.cells[act.cell];
      cell.moisture = Math.min(3, cell.moisture + 1);
      cell.dryMs = 0;
      return 0;
    }
    case 'harvest':
      if (act.result !== 'ok') return 0;
      Object.assign(ps.cells[act.cell], { crop: null, growth: 0 });
      return CROPS[act.crop].price;
  }
  return 0;
}

function complete(state, robot, act) {
  const ps = state.plots[robot.plot];
  switch (act.kind) {
    case 'travel': {
      const plot = plotById.get(act.toPlot);
      Object.assign(robot, { plot: plot.id, x: plot.entry.x, y: plot.entry.y, heading: plot.entry.heading, phase: 'run' });
      robot.run = { ...createRun(act.program), stage: act.stage, tokens: 0, money: 0, actions: 0, start: act.end };
      emit(state, 'runStart', { robot: robot.id, plot: plot.id, stage: act.stage });
      return;
    }
    case 'wait':
      return;
    default: {
      const price = applyAction(ps, robot, act);
      if (price) {
        state.money += price;
        if (robot.run) robot.run.money += price;
        emit(state, 'harvest', { robot: robot.id, plot: robot.plot, cell: act.cell, crop: act.crop, money: price });
      }
    }
  }
}

function endRun(state, robot, endedBy) {
  const run = robot.run;
  state.plots[robot.plot].lastRun = { stage: run.stage, tokens: run.tokens, money: run.money, actions: run.actions, ms: robot.freeAt - run.start, endedBy };
  emit(state, 'runEnd', { robot: robot.id, plot: robot.plot, ...state.plots[robot.plot].lastRun });
  robot.run = null;
  robot.phase = 'idle';
  // 一個動作都沒做就離開（例如防呆判斷直接離開），先待命一下，免得在同一塊田進進出出。
  if (!run.actions) startAct(state, robot, { kind: 'wait', ms: IDLE_MS });
}

function crash(state, robot, reason) {
  state.plots[robot.plot].crashed = { reason, time: state.time };
  robot.run = null;
  robot.phase = 'stuck';
  emit(state, 'crash', { robot: robot.id, plot: robot.plot, reason });
}

// ---------- 感測 ----------

export function senseLeaf(tokens, robot, ps, leaf) {
  const here = ps.cells[cellKey(robot.x, robot.y)];
  const test = (cell, what) => what === 'mature' ? !!cell.crop && cell.growth >= 1 : what === 'empty' ? !cell.crop : cell.moisture === 0;
  switch (leaf.sense) {
    case 'cell': return test(here, leaf.what);
    case 'plot': return Object.values(ps.cells).some(c => test(c, leaf.what));
    case 'front': {
      const [dx, dy] = VECTORS[robot.heading];
      return !!ps.cells[cellKey(robot.x + dx, robot.y + dy)];
    }
    case 'tokenLess': return tokens < leaf.value;
    default: return false;
  }
}

// ---------- 玩家操作 ----------

export const capacityOf = (plotId, ps) => plotById.get(plotId).rules.capacity + CAPACITY.step * ps.capacityLevel;
export const nextCapacityCost = ps => capacityCost(ps.capacityLevel);

export function resetPlot(state, plotId) {
  const ps = state.plots[plotId];
  if (!ps.crashed) return;
  ps.crashed = null;
  for (const robot of state.robots) {
    if (robot.plot === plotId && robot.phase === 'stuck') Object.assign(robot, { phase: 'idle', freeAt: state.time });
  }
  emit(state, 'reset', { plot: plotId });
}

export function exchange(state, money) {
  if (state.money < money) return false;
  state.money -= money;
  state.tokens += money * TOKENS_PER_MONEY;
  return true;
}

export function upgradeCapacity(state, plotId) {
  const ps = state.plots[plotId], cost = nextCapacityCost(ps);
  if (state.money < cost) return false;
  state.money -= cost;
  ps.capacityLevel++;
  return true;
}

export function setCrop(state, plotId, crop) {
  if (!canGrow(plotById.get(plotId), crop)) return false;
  state.plots[plotId].crop = crop;
  return true;
}

export const canGrow = (plot, crop) => CROPS[crop].tier <= plot.rules.maxTier;

// 新腳本從下一次執行開始生效；正在跑的那一輪不受影響。
export function setProgram(state, plotId, stage, program, workspace) {
  const ps = state.plots[plotId];
  ps.programs[stage] = program;
  ps.workspaces[stage] = workspace;
}
