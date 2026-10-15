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

// 這類田有哪幾份腳本。系統自動選擇時的優先順序：採收 > 播種 > 澆水。
export const stagesOf = plot => !plot.rules.autoScript ? ['main'] : plot.rules.noDrying ? ['sow', 'harvest'] : ['sow', 'harvest', 'water'];
