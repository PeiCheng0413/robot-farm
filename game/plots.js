// 田＝形狀 × 類型。形狀只管格子與入口（走位題目），類型只管輔助規則（config.js 的 PLOT_TYPES）。
// cells 是形狀內的局部座標；entry 是機器人每次開始執行腳本的位置與朝向（朝向 id 對應 manifest.movement.headingOrder）。
// board 是田塊左上角在盤面上的位置；v0.4 排列模式上線後改由玩家擺放。

import { PLOT_TYPES } from './config.js';

export const BOARD = { columns: 12, rows: 7 };

export const SHAPES = {
  line3: { name: '直線', entry: { x: 0, y: 0, heading: 'east' },  cells: [[0, 0], [1, 0], [2, 0]] },
  L:     { name: 'L 形', entry: { x: 0, y: 0, heading: 'south' }, cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  T:     { name: 'T 形', entry: { x: 0, y: 0, heading: 'east' },  cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  U:     { name: 'U 形', entry: { x: 0, y: 0, heading: 'south' }, cells: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0]] },
};

// v0.3 固定配置：三種新手田練走位，再各放一塊進階、高級、專家田。
const LAYOUT = [
  { id: 'line3-novice', shape: 'line3', type: 'novice',   board: [0, 0], crop: 'lettuce' },
  { id: 'L-novice',     shape: 'L',     type: 'novice',   board: [4, 0], crop: 'lettuce' },
  { id: 'T-novice',     shape: 'T',     type: 'novice',   board: [7, 0], crop: 'lettuce' },
  { id: 'L-advanced',   shape: 'L',     type: 'advanced', board: [0, 4], crop: 'carrot' },
  { id: 'T-high',       shape: 'T',     type: 'high',     board: [3, 4], crop: 'strawberry' },
  { id: 'U-expert',     shape: 'U',     type: 'expert',   board: [8, 4], crop: 'watermelon' },
];

export const PLOTS = LAYOUT.map(p => {
  const shape = SHAPES[p.shape], rules = PLOT_TYPES[p.type];
  return { ...p, name: `${shape.name}・${rules.name}田`, cells: shape.cells, entry: shape.entry, rules, defaultCrop: p.crop };
});

export const plotById = new Map(PLOTS.map(p => [p.id, p]));
export const cellKey = (x, y) => x + ',' + y;

// ---------- 排列：旋轉與擺放 ----------
// 田塊可以順時針旋轉 rot 次 90°（0～3），不能翻面：腳本用的是相對方向的左右轉，
// 旋轉後整塊田連入口朝向一起轉，腳本照樣能用；翻面會讓左右對調，所以不做。
// 模擬層一律用田塊自己的局部座標，旋轉與位置只影響畫在盤面的哪裡（state.layout）。

const HEADING_ORDER = ['south', 'west', 'north', 'east'];   // 與 sim.js 的 HEADINGS 相同，+1 是順時針
export const rotateHeading = (heading, rot) => HEADING_ORDER[(HEADING_ORDER.indexOf(heading) + rot) % 4];

const rotations = new Map();
// 回傳 { map(x, y) → 旋轉後座標（左上角平移到 0,0）, cells, width, height }
export function rotation(plot, rot) {
  const key = plot.id + '|' + rot;
  if (rotations.has(key)) return rotations.get(key);
  const turn = (x, y, n) => { for (let i = 0; i < n; i++) [x, y] = [-y, x]; return [x, y]; };   // 螢幕座標 y 向下，(-y, x) 是順時針
  const turned = plot.cells.map(([x, y]) => turn(x, y, rot));
  const minX = Math.min(...turned.map(c => c[0])), minY = Math.min(...turned.map(c => c[1]));
  const map = (x, y) => { const [rx, ry] = turn(x, y, rot); return [rx - minX, ry - minY]; };
  const cells = plot.cells.map(([x, y]) => map(x, y));
  const r = { map, cells, width: Math.max(...cells.map(c => c[0])) + 1, height: Math.max(...cells.map(c => c[1])) + 1 };
  rotations.set(key, r);
  return r;
}

// place：{ x, y, rot }，x／y 是旋轉後外框左上角在盤面上的位置。
export const placedCells = (plot, place) => rotation(plot, place.rot).cells.map(([x, y]) => [place.x + x, place.y + y]);
export function toBoard(plot, place, x, y) {
  const [rx, ry] = rotation(plot, place.rot).map(x, y);
  return [place.x + rx, place.y + ry];
}
export const defaultLayout = () => Object.fromEntries(PLOTS.map(p => [p.id, { x: p.board[0], y: p.board[1], rot: 0 }]));

// 放得下嗎：整塊在盤面內，而且不和其他田重疊。
export function canPlace(layout, plotId, place) {
  const cells = placedCells(plotById.get(plotId), place);
  if (cells.some(([x, y]) => x < 0 || y < 0 || x >= BOARD.columns || y >= BOARD.rows)) return false;
  const taken = new Set();
  for (const p of PLOTS) if (p.id !== plotId && layout[p.id]) for (const [x, y] of placedCells(p, layout[p.id])) taken.add(cellKey(x, y));
  return !cells.some(([x, y]) => taken.has(cellKey(x, y)));
}

// 這類田有哪幾份腳本。系統自動選擇時的優先順序：採收 > 播種 > 澆水。
export const stagesOf = plot => !plot.rules.autoScript ? ['main'] : plot.rules.noDrying ? ['sow', 'harvest'] : ['sow', 'harvest', 'water'];
