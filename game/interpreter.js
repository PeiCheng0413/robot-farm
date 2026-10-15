// 逐步直譯器：只認編譯後的指令樹（見 blocks.js 的 compile），完全不碰 Blockly。
//
// 指令：{op:'move'|'turnLeft'|'turnRight'|'sow'|'water'|'harvest'|'leave'}  {op:'call', name}
//       {op:'repeat', times, body}  {op:'while', cond, body}  {op:'if', cond, then, else}
// 條件：{sense:'cell', what:'mature'|'empty'|'dry'}  {sense:'front'}
//       {sense:'plot', what:'mature'|'empty'|'dry'}  {sense:'tokenLess', value}
//       {not:條件}  {all:[條件, 條件]}（且）  {any:[條件, 條件]}（或）
//
// nextAction 一路執行控制積木，直到遇到下一個動作積木才回傳，所以控制積木不花時間也不扣 Token。

import { CONTROL_LIMIT, CALL_DEPTH } from './config.js';

// 程式可以是指令陣列（舊格式），或 { body, functions }（含函式）。
export const programBody = program => Array.isArray(program) ? program : program.body;

export function createRun(program) {
  return { stack: [{ body: programBody(program), i: 0 }], functions: Array.isArray(program) ? {} : program.functions, depth: 0 };
}

// sense(cond) 由模擬層提供，回傳 true/false。
// 回傳 {action:'move'} 之類、{done:true}、{done:true, left:true}（離開這塊田）或 {error:'runaway'}。
export function nextAction(run, sense) {
  let control = 0;
  while (run.stack.length) {
    if (++control > CONTROL_LIMIT) return { error: 'runaway' };
    const frame = run.stack[run.stack.length - 1];
    if (frame.i >= frame.body.length) {
      if (frame.loop === 'repeat' && --frame.left > 0) { frame.i = 0; continue; }
      if (frame.loop === 'while' && sense(frame.cond)) { frame.i = 0; continue; }
      if (frame.call) run.depth--;
      run.stack.pop();
      continue;
    }
    const s = frame.body[frame.i++];
    switch (s.op) {
      case 'call': {
        // 呼叫函式不扣 Token；層數過深（通常是函式呼叫自己停不下來）就當機。
        const fn = run.functions[s.name];
        if (!fn) return { error: 'missing' };
        if (run.depth >= CALL_DEPTH) return { error: 'deep' };
        if (fn.length) { run.depth++; run.stack.push({ body: fn, i: 0, call: true }); }
        break;
      }
      case 'repeat':
        if (s.times > 0 && s.body.length) run.stack.push({ body: s.body, i: 0, loop: 'repeat', left: s.times });
        break;
      case 'while':
        // 空的「當…重複」不會前進，交給 CONTROL_LIMIT 判定當機。
        if (sense(s.cond)) run.stack.push({ body: s.body, i: 0, loop: 'while', cond: s.cond });
        break;
      case 'if': {
        const branch = sense(s.cond) ? s.then : s.else;
        if (branch.length) run.stack.push({ body: branch, i: 0 });
        break;
      }
      case 'leave':
        run.stack.length = 0;
        return { done: true, left: true };
      default:
        return { action: s.op };
    }
  }
  return { done: true };
}

// 包一層，讓 sense 支援「不是」「且」「或」。
export function evaluate(cond, senseLeaf) {
  if (cond.not) return !evaluate(cond.not, senseLeaf);
  if (cond.all) return cond.all.every(c => evaluate(c, senseLeaf));
  if (cond.any) return cond.any.some(c => evaluate(c, senseLeaf));
  return senseLeaf(cond);
}
