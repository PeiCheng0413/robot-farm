// 上課練習的關卡（practice.html）。改關卡只要改這張表。
//
// unit：屬於哪個單元（UNITS）。每個單元各自計時、各自出示過關 QR code。
// map：田的樣子，一個字一格，每一列一個字串。
//   d 乾裂的幼苗（要澆水）  w 濕潤的幼苗（再澆會積水）  o 乾裂的空地（要播種）  e 一般土壤的空地
//   r 成熟作物（要採收）    D 乾裂的成熟作物（快收成，不要澆）  . 不是田
// crop：這關種的作物（預設萵苣）。fact：關卡說明下面的小知識（可省略）。
// variants：另外幾塊同形狀、內容不同的田（可省略）。學生的程式在這些田上也要完成目標才算過關，
//   用來確認程式是「看了再決定」，不是把步數寫死。星等只看畫面上那一塊田。
// entry：機器人出發的格子與面向（east 右、west 左、south 下、north 上）。
// goals：跑完要達成什麼。empty 不能留空地、dry 不能留乾裂的幼苗、soaked 不能澆到積水、mature 不能留成熟作物、
//   wetMature 成熟作物不能澆水、emptyWet 空地要澆濕（EXTRA_GOALS；其他在 editor.js 的 GOALS）。
// tools：這關的積木箱（只放需要的，學生才不會被一大堆積木分心）。
// stars：[二星的積木數上限, 三星的積木數上限]。三星還要沒撞牆、沒白做。
// solution：老師參考用的最少積木寫法（不會顯示給學生）。

export const UNITS = [
  { id: 'loops', title: '第一單元｜重複與判斷', intro: '用「重複」和「如果」積木，讓機器人用最少的積木做完田裡的工作。', game: 'robot-farm-practice' },
  { id: 'logic', title: '第二單元｜且與或', intro: '一個條件不夠用的時候，用「且」「或」「不是」把條件組合起來。', game: 'robot-farm-practice-2' },
];

export const LESSONS = [
  {
    unit: 'loops',
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
    unit: 'loops',
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
    unit: 'loops',
    id: 'check-dry',
    title: '看一看再澆水',
    goal: '只有乾裂的幼苗要澆水。濕潤的那幾格再澆就會積水，不要澆！',
    hint: '乾的格子沒有規律，只能每一格都「看一看」：用「如果 腳下 土壤乾裂」，成立才澆水。記得把下拉選單改成「土壤乾裂」。',
    map: ['ddwdwwdw'],
    entry: { x: 0, y: 0, heading: 'east' },
    goals: ['dry', 'soaked'],
    tools: ['rf_move', 'rf_water', 'rf_repeat', 'rf_if', 'rf_cell'],
    stars: [8, 5],
    solution: '重複 7 次〔如果 腳下土壤乾裂 就 澆水；前進〕（最後一格是濕的，不用看）',
  },
  {
    unit: 'loops',
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
    unit: 'logic',
    id: 'melon-dry',
    title: '西瓜要控水',
    goal: '乾裂的西瓜幼苗要澆水；已經成熟的西瓜就算土乾了也不要澆！',
    hint: '要同時符合兩件事才澆水：「土壤乾裂」而且「不是已成熟」。用「且」把兩個條件接起來，「不是」可以把條件反過來。',
    fact: '🍉 小知識：西瓜快成熟的最後一兩個星期，農夫會減少澆水，叫做「控水」。這時候水太多，西瓜會變得不甜，果皮還可能裂開。',
    crop: 'watermelon',
    map: ['dDwdDdwD'],
    entry: { x: 0, y: 0, heading: 'east' },
    goals: ['dry', 'soaked', 'wetMature'],
    tools: ['rf_move', 'rf_water', 'rf_repeat', 'rf_if', 'rf_cell', 'rf_and', 'rf_not'],
    stars: [10, 8],
    solution: '重複 7 次〔如果 腳下土壤乾裂 且 不是 腳下已成熟 就 澆水；前進〕（最後一格是成熟的，不用看）',
  },
  {
    unit: 'logic',
    id: 'wet-empty',
    title: '播種前先澆水',
    goal: '明天要播種，空地要先澆水讓土變濕；乾裂的幼苗也要澆。濕潤的幼苗不要澆，會積水！',
    hint: '有兩種格子要澆水：「土壤乾裂」或「是空地」，只要符合其中一種就澆。用「或」把兩個條件接起來，只要寫一個「如果」。',
    map: ['dewedwew'],
    entry: { x: 0, y: 0, heading: 'east' },
    goals: ['dry', 'soaked', 'emptyWet'],
    tools: ['rf_move', 'rf_water', 'rf_repeat', 'rf_if', 'rf_cell', 'rf_or'],
    stars: [9, 7],
    solution: '重複 7 次〔如果 腳下土壤乾裂 或 腳下是空地 就 澆水；前進〕（兩個「如果」也能過，但要 8 塊）',
  },
  {
    unit: 'logic',
    id: 'find-ripe',
    title: '找到成熟的西瓜',
    goal: '一路往前走，遇到第一顆成熟的西瓜就停下來採收。成熟的西瓜每次位置都不一樣，也可能一顆都沒有！',
    hint: '機器人不知道西瓜在哪裡，所以不能數步數。用「當…就重複」一直往前走：「前方可以走」而且「不是已成熟」才繼續走，停下來以後再採收。',
    crop: 'watermelon',
    map: ['wwwwrww'],
    variants: [['rwwwwww'], ['wwwwwwr'], ['wwwwwww']],
    entry: { x: 0, y: 0, heading: 'east' },
    goals: ['mature'],
    tools: ['rf_move', 'rf_harvest', 'rf_while', 'rf_cell', 'rf_front', 'rf_and', 'rf_not'],
    stars: [9, 7],
    solution: '當 前方可以走 且 不是 腳下已成熟 就重複〔前進〕；採收',
  },
];

export const EXTRA_GOALS = {
  wetMature: { test: c => c.crop && c.growth >= 1 && c.moisture > 0, text: n => `${n} 顆成熟的西瓜被澆了水（快收成時要控水）` },
  emptyWet:  { test: c => !c.crop && c.moisture < 2,                  text: n => `還有 ${n} 格空地沒有澆濕` },
};

const CELL_STATES = {
  d: { crop: true, growth: 0.4, moisture: 0 },
  w: { crop: true, growth: 0.4, moisture: 2 },
  o: { crop: null, growth: 0, moisture: 0 },
  e: { crop: null, growth: 0, moisture: 1 },
  r: { crop: true, growth: 1, moisture: 1 },
  D: { crop: true, growth: 1, moisture: 0 },
};

// 把關卡數據換成 createPlotView 與 sim.js 動作規則看得懂的「田」與「田的狀態」。map 不給就用 lesson.map。
export function lessonPlot(lesson, map = lesson.map) {
  const cells = [];
  map.forEach((row, y) => [...row].forEach((ch, x) => { if (CELL_STATES[ch]) cells.push([x, y]); }));
  return { id: 'lesson-' + lesson.id, name: lesson.title, cells, entry: lesson.entry, rules: { colour: '#d7a44b' } };
}

export function lessonCells(lesson, map = lesson.map) {
  const cells = {}, crop = lesson.crop || 'lettuce';
  map.forEach((row, y) => [...row].forEach((ch, x) => {
    const st = CELL_STATES[ch];
    if (st) cells[x + ',' + y] = { ...st, crop: st.crop ? crop : null, dryMs: 0 };
  }));
  return cells;
}
