// Blockly 積木定義、工具箱與編譯。Blockly 只用來編輯；存檔時把積木編譯成 interpreter.js 的指令樹。
// 新增動作或條件：在 BLOCKS 加定義、在 compileStatement／compileCondition 加一行，sim.js 補效果或感測。

const Blockly = window.Blockly;

// 色系取自 docs/STYLE_GUIDE.md 色票，提高明度讓白字清楚。
const COLOURS = { move: '#3f7f70', farm: '#b0702f', flow: '#5b6fa8', sense: '#7a5a9c', start: '#35665b', func: '#9c4f6b',
  variable: '#d9730d', list: '#c2410c' };   // 變數、清單：跟 Scratch 一樣用橘色系（加深一點讓白字清楚）

const action = (type, text, colour, tooltip) => ({
  type, message0: text, previousStatement: null, nextStatement: null, colour, tooltip,
});
const condition = (type, message0, args0, tooltip) => ({
  type, message0, args0, output: 'Boolean', colour: COLOURS.sense, tooltip,
});
const WHAT = [['已成熟', 'mature'], ['是空地', 'empty'], ['土壤乾裂', 'dry']];
const PLOT_WHAT = [['有成熟作物', 'mature'], ['有空地', 'empty'], ['有乾裂土壤', 'dry']];

const BLOCKS = [
  { type: 'rf_start', message0: '開始', nextStatement: null, colour: COLOURS.start, tooltip: '機器人從這裡往下依序執行', hat: 'cap' },
  action('rf_move', '前進一格', COLOURS.move, '往面向的方向走一格；前面不是田就會撞到，原地不動但仍扣 Token'),
  action('rf_turn_left', '左轉', COLOURS.move, '以機器人自己為準，向左轉 90°'),
  action('rf_turn_right', '右轉', COLOURS.move, '以機器人自己為準，向右轉 90°'),
  action('rf_sow', '播種', COLOURS.farm, '在腳下的空地種下這塊田設定的作物'),
  action('rf_water', '澆水', COLOURS.farm, '腳下土壤含水 +1。乾裂→一般→濕潤→積水；積水會停止生長'),
  action('rf_harvest', '採收', COLOURS.farm, '採收腳下已成熟的作物，立刻賣成金錢'),
  { type: 'rf_leave', message0: '離開這塊田', previousStatement: null, colour: COLOURS.flow, tooltip: '立刻結束這次腳本，機器人去下一塊田' },
  {
    type: 'rf_repeat', message0: '重複 %1 次', args0: [{ type: 'field_number', name: 'TIMES', value: 3, min: 1, max: 20, precision: 1 }],
    message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null, nextStatement: null, colour: COLOURS.flow, tooltip: '把裡面的積木重複執行指定次數',
  },
  {
    // 跟 Scratch 一樣的「重複直到」：條件成立就停，不成立就繼續。（10-27 拿掉 Scratch 沒有的「當…就重複」，舊存檔見 migrateWorkspace）
    type: 'rf_until', message0: '重複直到 %1', args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
    message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null, nextStatement: null, colour: COLOURS.flow, tooltip: '一直重複裡面的積木，直到條件成立才停（一開始就成立的話一次都不做）',
  },
  {
    type: 'rf_if', message0: '如果 %1', args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
    message1: '就 %1', args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null, nextStatement: null, colour: COLOURS.flow, tooltip: '條件成立才執行裡面的積木',
  },
  {
    type: 'rf_if_else', message0: '如果 %1', args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
    message1: '就 %1', args1: [{ type: 'input_statement', name: 'DO' }],
    message2: '否則 %1', args2: [{ type: 'input_statement', name: 'ELSE' }],
    previousStatement: null, nextStatement: null, colour: COLOURS.flow, tooltip: '條件成立執行上面，不成立執行下面',
  },
  // ---------- 變數與清單（練習頁第三單元）----------
  // 數字格是 Blockly 內建的 math_number 影子積木（工具箱帶預設值），不算進積木數。
  {
    type: 'rf_repeat_times', message0: '重複 %1 次', args0: [{ type: 'input_value', name: 'TIMES', check: 'Number' }],
    message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null, nextStatement: null, colour: COLOURS.flow, tooltip: '把裡面的積木重複執行指定次數；次數可以放變數或清單的項目',
  },
  {
    type: 'rf_var_set', message0: '變數 %1 設為 %2', args0: [{ type: 'field_variable', name: 'VAR', variable: 'i' }, { type: 'input_value', name: 'VALUE', check: 'Number' }],
    previousStatement: null, nextStatement: null, colour: COLOURS.variable, tooltip: '把變數設成這個數字',
  },
  {
    type: 'rf_var_change', message0: '變數 %1 改變 %2', args0: [{ type: 'field_variable', name: 'VAR', variable: 'i' }, { type: 'input_value', name: 'VALUE', check: 'Number' }],
    previousStatement: null, nextStatement: null, colour: COLOURS.variable, tooltip: '把變數加上這個數字（放負數就是減）',
  },
  { type: 'rf_var_get', message0: '%1', args0: [{ type: 'field_variable', name: 'VAR', variable: 'i' }], output: 'Number', colour: COLOURS.variable, tooltip: '變數現在的值' },
  {
    type: 'rf_list_add', message0: '加入 %1 到清單', args0: [{ type: 'input_value', name: 'VALUE', check: 'Number' }],
    previousStatement: null, nextStatement: null, colour: COLOURS.list, tooltip: '把這個數字放到清單的最後面',
  },
  { type: 'rf_list_item', message0: '清單的第 %1 項', args0: [{ type: 'input_value', name: 'INDEX', check: 'Number' }], output: 'Number', colour: COLOURS.list, tooltip: '清單裡第幾個數字（從 1 開始數）', inputsInline: true },
  { type: 'rf_list_length', message0: '清單的長度', output: 'Number', colour: COLOURS.list, tooltip: '清單裡有幾項' },
  condition('rf_cell', '腳下 %1', [{ type: 'field_dropdown', name: 'WHAT', options: WHAT }], '檢查機器人腳下這一格'),
  condition('rf_front', '前方可以走', [], '前面一格是不是這塊田的一部分'),
  condition('rf_plot', '這塊田 %1', [{ type: 'field_dropdown', name: 'WHAT', options: PLOT_WHAT }], '檢查整塊田只要有一格符合'),
  condition('rf_token_less', 'Token 少於 %1', [{ type: 'field_number', name: 'VALUE', value: 20, min: 0, max: 99999, precision: 1 }], '全農場剩餘 Token 是否少於這個數字'),
  condition('rf_not', '%1 不成立', [{ type: 'input_value', name: 'COND', check: 'Boolean' }], '條件反過來：裡面的條件不成立時，這塊才成立（跟 Scratch 一樣）'),
  { ...condition('rf_and', '%1 且 %2', [{ type: 'input_value', name: 'A', check: 'Boolean' }, { type: 'input_value', name: 'B', check: 'Boolean' }], '兩個條件都成立才算成立'), inputsInline: true },
  { ...condition('rf_or', '%1 或 %2', [{ type: 'input_value', name: 'A', check: 'Boolean' }, { type: 'input_value', name: 'B', check: 'Boolean' }], '任一個條件成立就算成立'), inputsInline: true },
];

export function defineBlocks() {
  Blockly.common.defineBlocksWithJsonArray(BLOCKS.map(({ hat, ...b }) => b));
  // 函式用 Blockly 內建的 procedures_defnoreturn／procedures_callnoreturn（blocks_compressed.js）。
  // 第一版不支援參數，所以拿掉定義積木上的齒輪（參數編輯器）。
  Object.assign(Blockly.Msg, {
    PROCEDURES_DEFNORETURN_TITLE: '定義函式', PROCEDURES_DEFNORETURN_PROCEDURE: '我的函式',
    PROCEDURES_DEFNORETURN_TOOLTIP: '把一串步驟包成函式，之後用一塊積木就能執行整串',
    PROCEDURES_CALLNORETURN_TOOLTIP: '執行函式「%1」裡的所有步驟',
  });
  const def = Blockly.Blocks.procedures_defnoreturn, init = def.init;
  def.init = function () {
    init.call(this);
    const mutator = Blockly.icons?.MutatorIcon?.TYPE;
    if (mutator && this.hasIcon?.(mutator)) this.removeIcon(mutator);
  };
}

// 「函式」分類的內容依目前編輯區裡定義了哪些函式動態產生。
export function registerFunctionCategory(workspace) {
  workspace.registerToolboxCategoryCallback('RF_FUNCTIONS', ws => {
    const items = [{ kind: 'block', type: 'procedures_defnoreturn' }];
    for (const [name] of Blockly.Procedures.allProcedures(ws)[0]) {
      items.push({ kind: 'block', type: 'procedures_callnoreturn', extraState: { name } });
    }
    return items;
  });
}

const blocks = types => types.map(type => ({ kind: 'block', type }));
export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: '移動', colour: COLOURS.move, contents: blocks(['rf_move', 'rf_turn_left', 'rf_turn_right']) },
    { kind: 'category', name: '農務', colour: COLOURS.farm, contents: blocks(['rf_sow', 'rf_water', 'rf_harvest']) },
    { kind: 'category', name: '流程', colour: COLOURS.flow, contents: blocks(['rf_repeat', 'rf_until', 'rf_if', 'rf_if_else', 'rf_leave']) },
    { kind: 'category', name: '感測', colour: COLOURS.sense, contents: blocks(['rf_cell', 'rf_front', 'rf_plot', 'rf_token_less', 'rf_not', 'rf_and', 'rf_or']) },
    { kind: 'category', name: '函式', colour: COLOURS.func, custom: 'RF_FUNCTIONS' },
  ],
};

export function createTheme() {
  return Blockly.Theme.defineTheme('robot-farm', {
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#f7f0d8', toolboxBackgroundColour: '#263f3c', toolboxForegroundColour: '#fffaf0',
      flyoutBackgroundColour: '#e9dfbf', flyoutOpacity: 1, scrollbarColour: '#8a7d56', insertionMarkerColour: '#263f3c',
    },
    blockStyles: { procedure_blocks: { colourPrimary: COLOURS.func, colourSecondary: '#c98aa0', colourTertiary: '#6e3249' } },
    fontStyle: { family: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif', size: 15, weight: 'bold' },
  });
}

// ---------- 預設腳本 ----------

const chain = (...types) => types.reduceRight((next, type) => ({ type, ...(next && { next: { block: next } }) }), null);
const startWith = body => ({
  blocks: { languageVersion: 0, blocks: [{ type: 'rf_start', x: 24, y: 24, deletable: false, ...(body && { next: { block: body } }) }] },
});

// 新手田給一份能動的範例，讓經濟從第一秒就轉得起來；正式田從空白開始。
export const DEFAULT_WORKSPACES = {
  sow: startWith(chain('rf_sow', 'rf_move', 'rf_sow', 'rf_move', 'rf_sow')),
  harvest: startWith(chain('rf_harvest', 'rf_move', 'rf_harvest', 'rf_move', 'rf_harvest')),
  main: startWith(null),
};

// ---------- 舊存檔 ----------

// 舊的「當〈X〉就重複」（rf_while）換成意思一樣的「重複直到〈〈X〉不成立〉」。積木已經拿掉，不轉換的話舊存檔載入會失敗。
// 回傳新的 Blockly 存檔（不改動傳進來的那份）；沒有舊積木時原樣回傳。
export function migrateWorkspace(json) {
  if (!json || !JSON.stringify(json).includes('"rf_while"')) return json;
  const walk = v => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const out = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    if (out.type !== 'rf_while') return out;
    const { COND, ...rest } = out.inputs || {};
    const inputs = COND?.block ? { ...rest, COND: { block: { type: 'rf_not', inputs: { COND: { block: COND.block } } } } } : rest;
    return { ...out, type: 'rf_until', inputs };
  };
  return walk(json);
}

// ---------- 編譯 ----------

export class CompileError extends Error {}

export function findStart(workspace) {
  return workspace.getTopBlocks(false).find(b => b.type === 'rf_start') || null;
}

const functionDefs = workspace => workspace.getTopBlocks(false).filter(b => b.type === 'procedures_defnoreturn');

// 算會被執行的積木：接在「開始」下面的，加上每個函式定義（定義積木本身也算 1 塊）。數字格（影子積木）不算。
const solid = block => block.getDescendants(false).filter(b => !b.isShadow()).length;
export function countBlocks(workspace) {
  const start = findStart(workspace);
  const body = start ? solid(start) - 1 : 0;
  return functionDefs(workspace).reduce((n, def) => n + solid(def), body);
}

// 編譯結果：{ body: 主程式, functions: { 函式名稱: 指令陣列 } }
export function compile(workspace) {
  const start = findStart(workspace);
  if (!start) throw new CompileError('找不到「開始」積木');
  const functions = {};
  for (const def of functionDefs(workspace)) {
    const [name, params] = def.getProcedureDef();
    if (params.length) throw new CompileError(`函式「${name}」有參數，目前還不支援參數`);
    functions[name] = compileStatements(def.getInputTargetBlock('STACK'));
  }
  const body = compileStatements(start.getNextBlock());
  checkCalls(body, functions);
  for (const fn of Object.values(functions)) checkCalls(fn, functions);
  return { body, functions };
}

function checkCalls(list, functions) {
  for (const s of list) {
    if (s.op === 'call' && !(s.name in functions)) throw new CompileError(`找不到函式「${s.name}」的定義`);
    for (const key of ['body', 'then', 'else']) if (s[key]) checkCalls(s[key], functions);
  }
}

function compileStatements(block) {
  const out = [];
  // 每個節點帶上積木 id，逐步執行時用來亮起對應積木。
  for (let b = block; b; b = b.getNextBlock()) if (b.isEnabled()) out.push({ ...compileStatement(b), id: b.id });
  return out;
}

function compileStatement(b) {
  const inner = name => compileStatements(b.getInputTargetBlock(name));
  switch (b.type) {
    case 'rf_move': return { op: 'move' };
    case 'rf_turn_left': return { op: 'turnLeft' };
    case 'rf_turn_right': return { op: 'turnRight' };
    case 'rf_sow': return { op: 'sow' };
    case 'rf_water': return { op: 'water' };
    case 'rf_harvest': return { op: 'harvest' };
    case 'rf_leave': return { op: 'leave' };
    case 'rf_repeat': return { op: 'repeat', times: Number(b.getFieldValue('TIMES')), body: inner('DO') };
    case 'rf_until': return { op: 'until', cond: compileCondition(b, 'COND'), body: inner('DO') };
    case 'rf_repeat_times': return { op: 'repeat', times: compileValue(b, 'TIMES'), body: inner('DO') };
    case 'rf_var_set': return { op: 'set', var: varName(b), value: compileValue(b, 'VALUE') };
    case 'rf_var_change': return { op: 'change', var: varName(b), value: compileValue(b, 'VALUE') };
    case 'rf_list_add': return { op: 'listAdd', value: compileValue(b, 'VALUE') };
    case 'rf_if': return { op: 'if', cond: compileCondition(b, 'COND'), then: inner('DO'), else: [] };
    case 'rf_if_else': return { op: 'if', cond: compileCondition(b, 'COND'), then: inner('DO'), else: inner('ELSE') };
    case 'procedures_callnoreturn': return { op: 'call', name: b.getProcedureCall() };
    default: throw new CompileError('不認得的積木：' + b.type);
  }
}

const SLOT_NAMES = { rf_not: '不成立', rf_until: '重複直到', rf_and: '且', rf_or: '或' };

const varName = b => b.getField('VAR').getText();

// 數字、變數、清單的項目與長度（interpreter.js 的「值」）。
function compileValue(parent, input) {
  const b = parent.getInputTargetBlock(input);
  if (!b) { parent.select?.(); throw new CompileError('有積木的數字格是空的'); }
  switch (b.type) {
    case 'math_number': return { num: Number(b.getFieldValue('NUM')) || 0 };
    case 'rf_var_get': return { var: varName(b) };
    case 'rf_list_item': return { item: compileValue(b, 'INDEX') };
    case 'rf_list_length': return { length: true };
    default: throw new CompileError('這裡要放數字：' + b.type);
  }
}

function compileCondition(parent, input) {
  const b = parent.getInputTargetBlock(input);
  return { ...conditionNode(parent, b), id: b.id };
}

function conditionNode(parent, b) {
  if (!b) {
    parent.select?.();
    throw new CompileError('有「' + (SLOT_NAMES[parent.type] || '如果') + '」積木還沒放條件');
  }
  switch (b.type) {
    case 'rf_cell': return { sense: 'cell', what: b.getFieldValue('WHAT') };
    case 'rf_plot': return { sense: 'plot', what: b.getFieldValue('WHAT') };
    case 'rf_front': return { sense: 'front' };
    case 'rf_token_less': return { sense: 'tokenLess', value: Number(b.getFieldValue('VALUE')) };
    case 'rf_not': return { not: compileCondition(b, 'COND') };
    case 'rf_and': return { all: [compileCondition(b, 'A'), compileCondition(b, 'B')] };
    case 'rf_or': return { any: [compileCondition(b, 'A'), compileCondition(b, 'B')] };
    default: throw new CompileError('不認得的條件：' + b.type);
  }
}
