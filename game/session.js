// 存檔與開新遊戲：主畫面（play.html）與機制測試畫面（game.html）共用同一份存檔，是同一座農場。

import { SAVE_KEY } from './config.js';
import { PLOTS, stagesOf } from './plots.js';
import { createState, serialize, restore, setProgram } from './sim.js';
import { DEFAULT_WORKSPACES, compile } from './blocks.js';

const Blockly = window.Blockly;

function compileJson(json) {
  const ws = new Blockly.Workspace();
  try { Blockly.serialization.workspaces.load(json, ws); return compile(ws); } finally { ws.dispose(); }
}

export function newGame() {
  const s = createState();
  for (const plot of PLOTS) {
    // 只有第一塊直線新手田附範例腳本，讓經濟一開始就轉得起來；其他田從空白開始練。
    for (const stage of stagesOf(plot)) {
      const json = plot.id === PLOTS[0].id && DEFAULT_WORKSPACES[stage] || DEFAULT_WORKSPACES.main;
      setProgram(s, plot.id, stage, compileJson(json), json);
    }
  }
  return s;
}

export function loadGame() {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (json) { const s = restore(json); if (s) return s; }
  } catch (e) { console.warn('讀檔失敗，改開新遊戲', e); }
  return newGame();
}

export function saveGame(state) {
  try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch (e) { /* 私密視窗等情況存不了，遊戲照常進行 */ }
}

// 定時與離開頁面時自動存檔。getState 每次取最新的 state（重新開始後會換一份）。
export function autosave(getState) {
  const save = () => saveGame(getState());
  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  return save;
}
