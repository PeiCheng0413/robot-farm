// 逐步直譯器：只認編譯後的指令樹（見 blocks.js 的 compile），完全不碰 Blockly。
//
// 指令：{op:'move'|'turnLeft'|'turnRight'|'sow'|'water'|'harvest'|'leave'}
//       {op:'repeat', times, body}  {op:'while', cond, body}  {op:'if', cond, then, else}
// 條件：{sense:'cell', what:'mature'|'empty'|'dry'}  {sense:'front'}
//       {sense:'plot', what:'mature'|'empty'|'dry'}  {sense:'tokenLess', value}  {not:條件}
//
// nextAction 一路執行控制積木，直到遇到下一個動作積木才回傳，所以控制積木不花時間也不扣 Token。

import { CONTROL_LIMIT } from './config.js';

export function createRun(program) {
  return { stack: [{ body: program, i: 0 }] };
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
      run.stack.pop();
      continue;
    }
    const s = frame.body[frame.i++];
    switch (s.op) {
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

// 包一層，讓 sense 支援「不是」。
export function evaluate(cond, senseLeaf) {
  if (cond.not) return !evaluate(cond.not, senseLeaf);
  return senseLeaf(cond);
}
