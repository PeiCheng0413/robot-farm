// v0.3 的固定田塊。cells 是田塊內的局部座標，board 是田塊左上角在盤面上的位置。
// entry 是機器人每次開始執行腳本的位置與朝向（朝向 id 對應 manifest.movement.headingOrder）。
// v0.4 排列模式上線後，board 改由玩家擺放，形狀仍固定。

export const BOARD = { columns: 12, rows: 7 };

export const PLOTS = [
  {
    id: 'tutorial', name: '新手田', tutorial: true, defaultCrop: 'lettuce',
    board: [1, 1], entry: { x: 0, y: 0, heading: 'east' },
    cells: [[0, 0], [1, 0], [2, 0]],
  },
  {
    id: 'plot-l', name: 'L 形田', defaultCrop: 'carrot',
    board: [6, 0], entry: { x: 0, y: 0, heading: 'south' },
    cells: [[0, 0], [0, 1], [0, 2], [1, 2]],
  },
  {
    id: 'plot-t', name: 'T 形田', defaultCrop: 'carrot',
    board: [1, 4], entry: { x: 0, y: 0, heading: 'east' },
    cells: [[0, 0], [1, 0], [2, 0], [1, 1]],
  },
  {
    id: 'plot-u', name: 'U 形田', defaultCrop: 'tomato',
    board: [8, 3], entry: { x: 0, y: 0, heading: 'south' },
    cells: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0]],
  },
];

export const plotById = new Map(PLOTS.map(p => [p.id, p]));
export const cellKey = (x, y) => x + ',' + y;
