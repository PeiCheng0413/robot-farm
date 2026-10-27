// 逐步直譯器：只認編譯後的指令樹（見 blocks.js 的 compile），完全不碰 Blockly。
//
// 指令：{op:'move'|'turnLeft'|'turnRight'|'sow'|'water'|'harvest'|'leave'}  {op:'call', name}
//       {op:'repeat', times, body}  {op:'until', cond, body}（重複直到）  {op:'if', cond, then, else}
//       舊存檔裡的 {op:'while'} 由 migrateProgram 換成 until。
// 條件：{sense:'cell', what:'mature'|'empty'|'dry'}  {sense:'front'}
//       {sense:'plot', what:'mature'|'empty'|'dry'}  {sense:'tokenLess', value}
//       {not:條件}  {all:[條件, 條件]}（且）  {any:[條件, 條件]}（或）
// 每個節點可帶 id（Blockly 積木 id），編輯畫面逐步執行時用來亮起對應積木。
//
// step() 一次執行一個積木並回報發生了什麼；nextAction() 建立在 step() 上，
// 一路執行控制積木直到遇到下一個動作積木，所以控制積木不花時間也不扣 Token。

import { CONTROL_LIMIT, CALL_DEPTH } from './config.js';

// 程式可以是指令陣列（舊格式），或 { body, functions }（含函式）。
export const programBody = program => Array.isArray(program) ? program : program.body;

// 舊存檔的編譯結果：「當 X 就重複」（op 'while'）換成「重複直到（X 不成立）」。回傳新的程式，不改動原本那份。
export function migrateProgram(program) {
  const fix = list => list.map(s => {
    const n = { ...s };
    if (n.op === 'while') Object.assign(n, { op: 'until', cond: { not: n.cond, id: n.cond.id } });
    for (const k of ['body', 'then', 'else']) if (n[k]) n[k] = fix(n[k]);
    return n;
  });
  if (Array.isArray(program)) return fix(program);
  return { ...program, body: fix(program.body), functions: Object.fromEntries(Object.entries(program.functions || {}).map(([k, v]) => [k, fix(v)])) };
}

export function createRun(program) {
  return { stack: [{ body: programBody(program), i: 0 }], functions: Array.isArray(program) ? {} : program.functions, depth: 0 };
}

// 回傳其中一種：
//   {type:'action', op, id}                     動作積木，由呼叫端執行並扣 Token
//   {type:'cond', id, cond, value}              如果／當…重複 判斷了一次條件
//   {type:'loop', id, iteration, times}         重複 N 次 進入第幾圈
//   {type:'call', id, name}                     呼叫函式
//   {type:'done', left?, id?}                   腳本結束；left 表示是「離開這塊田」
//   {type:'error', error:'missing'|'deep'}
export function step(run, sense) {
  while (run.stack.length) {
    const frame = run.stack[run.stack.length - 1];
    if (frame.i >= frame.body.length) {
      if (frame.loop === 'repeat' && --frame.left > 0) {
        frame.i = 0;
        return { type: 'loop', id: frame.id, iteration: frame.times - frame.left + 1, times: frame.times };
      }
      if (frame.loop === 'until') {
        const value = sense(frame.cond);
        if (!value) frame.i = 0; else run.stack.pop();
        return { type: 'cond', id: frame.id, cond: frame.cond, value };
      }
      if (frame.call) run.depth--;
      run.stack.pop();
      continue;
    }
    const s = frame.body[frame.i++];
    switch (s.op) {
      case 'call': {
        // 呼叫函式不扣 Token；層數過深（通常是函式呼叫自己停不下來）就當機。
        const fn = run.functions[s.name];
        if (!fn) return { type: 'error', error: 'missing' };
        if (run.depth >= CALL_DEPTH) return { type: 'error', error: 'deep' };
        if (fn.length) { run.depth++; run.stack.push({ body: fn, i: 0, call: true }); }
        return { type: 'call', id: s.id, name: s.name };
      }
      case 'repeat':
        if (s.times > 0 && s.body.length) run.stack.push({ body: s.body, i: 0, loop: 'repeat', id: s.id, times: s.times, left: s.times });
        return { type: 'loop', id: s.id, iteration: 1, times: s.times };
      case 'until': {
        // 「重複直到」：先看條件，成立就不做；不成立就做一輪再看。空的迴圈一樣交給 CONTROL_LIMIT。
        const value = sense(s.cond);
        if (!value) run.stack.push({ body: s.body, i: 0, loop: 'until', id: s.id, cond: s.cond });
        return { type: 'cond', id: s.id, cond: s.cond, value };
      }
      case 'if': {
        const value = sense(s.cond), branch = value ? s.then : s.else;
        if (branch.length) run.stack.push({ body: branch, i: 0 });
        return { type: 'cond', id: s.id, cond: s.cond, value };
      }
      case 'leave':
        run.stack.length = 0;
        return { type: 'done', left: true, id: s.id };
      default:
        return { type: 'action', op: s.op, id: s.id };
    }
  }
  return { type: 'done' };
}

// 回傳 {action, id}、{done:true, left?} 或 {error}。連續 CONTROL_LIMIT 個控制積木都沒遇到動作就判定 runaway。
export function nextAction(run, sense) {
  for (let control = 0; control < CONTROL_LIMIT; control++) {
    const e = step(run, sense);
    if (e.type === 'error') return { error: e.error };
    if (e.type === 'done') return { done: true, left: e.left };
    if (e.type === 'action') return { action: e.op, id: e.id };
  }
  return { error: 'runaway' };
}

// 包一層，讓 sense 支援「不成立」「且」「或」。
export function evaluate(cond, senseLeaf) {
  if (cond.not) return !evaluate(cond.not, senseLeaf);
  if (cond.all) return cond.all.every(c => evaluate(c, senseLeaf));
  if (cond.any) return cond.any.some(c => evaluate(c, senseLeaf));
  return senseLeaf(cond);
}

// 條件寫成人看得懂的句子，給逐步執行的狀態列用。
const WHAT = { mature: '已成熟', empty: '是空地', dry: '土壤乾裂' };
const PLOT_WHAT = { mature: '有成熟作物', empty: '有空地', dry: '有乾裂土壤' };
export function describeCondition(cond) {
  if (cond.not) return cond.not.sense ? describeCondition(cond.not) + ' 不成立' : '（' + describeCondition(cond.not) + '）不成立';
  if (cond.all) return cond.all.map(describeCondition).join(' 且 ');
  if (cond.any) return cond.any.map(describeCondition).join(' 或 ');
  switch (cond.sense) {
    case 'cell': return '腳下' + WHAT[cond.what];
    case 'plot': return '這塊田' + PLOT_WHAT[cond.what];
    case 'front': return '前方可以走';
    case 'tokenLess': return 'Token 少於 ' + cond.value;
    default: return '？';
  }
}
// 條件裡有沒有「這塊田…」：有的話機器人要先播放範圍掃描。
export const usesPlotSense = cond => cond.not ? usesPlotSense(cond.not)
  : cond.all || cond.any ? (cond.all || cond.any).some(usesPlotSense) : cond.sense === 'plot';
