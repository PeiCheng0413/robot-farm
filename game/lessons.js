// 上課練習的關卡（practice.html）。改關卡只要改這張表。
//
// map：田的樣子，一個字一格，每一列一個字串。
//   d 乾裂的幼苗（要澆水）  w 濕潤的幼苗（再澆會積水）  o 乾裂的空地（要播種）  r 成熟作物（要採收）  . 不是田
// entry：機器人出發的格子與面向（east 右、west 左、south 下、north 上）。
// goals：跑完要達成什麼。empty 不能留空地、dry 不能留乾裂、soaked 不能澆到積水、mature 不能留成熟作物。
// tools：這關的積木箱（只放需要的，學生才不會被一大堆積木分心）。
// stars：[二星的積木數上限, 三星的積木數上限]。三星還要沒撞牆、沒白做。
// solution：老師參考用的最少積木寫法（不會顯示給學生）。

export const LESSONS = [
  {
    id: 'water-line',
    title: '一排幼苗',
    goal: '五格幼苗的土都乾裂了，幫每一格澆一次水。',
    hint: '你是不是一直在做「前進、澆水」？把一樣的積木放進「重複」裡，只要寫一次。',
    map: ['ddddd'],
    entry: { x: 0, y: 0, heading: 'east' },
    goals: ['dry', 'soaked'],
    tools: ['rf_move', 'rf_water', 'rf_repeat'],
    stars: [5, 4],
    solution: '澆水；重複 4 次〔前進、澆水〕',
  },
  {
    id: 'sow-water',
    title: '先播種再澆水',
    goal: '六格空地，每一格都要先播種、再澆水。',
    hint: '每一格要做的事有好幾件：「重複」裡面可以放不只兩塊積木。',
    map: ['oooooo'],
    entry: { x: 0, y: 0, heading: 'east' },
    goals: ['empty', 'dry', 'soaked'],
    tools: ['rf_move', 'rf_sow', 'rf_water', 'rf_repeat'],
    stars: [7, 6],
    solution: '播種、澆水；重複 5 次〔前進、播種、澆水〕',
  },
  {
    id: 'every-other',
    title: '隔一格澆水',
    goal: '只有乾裂的幼苗要澆水。濕潤的那幾格再澆就會積水，不要澆！',
    hint: '找出規律：澆一格、跳過一格……每一次重複要走幾步？',
    map: ['dwdwdwd'],
    entry: { x: 0, y: 0, heading: 'east' },
    goals: ['dry', 'soaked'],
    tools: ['rf_move', 'rf_water', 'rf_repeat'],
    stars: [6, 5],
    solution: '澆水；重複 3 次〔前進、前進、澆水〕',
  },
  {
    id: 'corner',
    title: '轉個彎',
    goal: 'L 形的田，每一格都澆一次水。走到底要轉彎。',
    hint: '先寫往下那一段，再轉彎寫往右那一段。兩段都可以用「重複」。機器人面向下的時候，它的左邊是畫面的右邊。',
    map: ['d...',
          'd...',
          'd...',
          'dddd'],
    entry: { x: 0, y: 0, heading: 'south' },
    goals: ['dry', 'soaked'],
    tools: ['rf_move', 'rf_turn_left', 'rf_turn_right', 'rf_water', 'rf_repeat'],
    stars: [9, 8],
    solution: '澆水；重複 3 次〔前進、澆水〕；左轉；重複 3 次〔前進、澆水〕（用重複包重複可以只要 6 塊）',
  },
  {
    id: 'ring',
    title: '繞一圈',
    goal: '正方形外圈的十二格，每一格都澆一次水。',
    hint: '四個邊都一樣：澆完一條邊、轉彎。「重複」裡面也可以再放一個「重複」。',
    map: ['dddd',
          'd..d',
          'd..d',
          'dddd'],
    entry: { x: 0, y: 0, heading: 'east' },
    goals: ['dry', 'soaked'],
    tools: ['rf_move', 'rf_turn_left', 'rf_turn_right', 'rf_water', 'rf_repeat'],
    stars: [9, 5],
    solution: '重複 4 次〔重複 3 次〔澆水、前進〕、右轉〕',
  },
  {
    id: 'snake',
    title: '來回兩排',
    goal: '兩排幼苗，走完第一排要掉頭走第二排，每一格都澆一次水。',
    hint: '掉頭是「轉彎、前進、轉彎」。走完第二排再掉頭一次，會回到哪裡？是不是又可以重複了？',
    map: ['dddddd',
          'dddddd'],
    entry: { x: 0, y: 0, heading: 'east' },
    goals: ['dry', 'soaked'],
    tools: ['rf_move', 'rf_turn_left', 'rf_turn_right', 'rf_water', 'rf_repeat'],
    stars: [11, 8],
    solution: '重複 2 次〔重複 5 次〔澆水、前進〕、澆水、右轉、前進、右轉〕',
  },
];

const CELL_STATES = {
  d: { crop: 'lettuce', growth: 0.4, moisture: 0 },
  w: { crop: 'lettuce', growth: 0.4, moisture: 2 },
  o: { crop: null, growth: 0, moisture: 0 },
  r: { crop: 'lettuce', growth: 1, moisture: 1 },
};

// 把關卡數據換成 createPlotView 與 sim.js 動作規則看得懂的「田」與「田的狀態」。
export function lessonPlot(lesson) {
  const cells = [];
  lesson.map.forEach((row, y) => [...row].forEach((ch, x) => { if (CELL_STATES[ch]) cells.push([x, y]); }));
  return { id: 'lesson-' + lesson.id, name: lesson.title, cells, entry: lesson.entry, rules: { colour: '#d7a44b' } };
}

export function lessonCells(lesson) {
  const cells = {};
  lesson.map.forEach((row, y) => [...row].forEach((ch, x) => {
    if (CELL_STATES[ch]) cells[x + ',' + y] = { ...CELL_STATES[ch], dryMs: 0 };
  }));
  return cells;
}
