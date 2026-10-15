// 遊戲數值設定表。調整平衡只改這裡，不改程式。時間單位一律毫秒。

export const SAVE_KEY = 'robot-farm-save-v1';
export const SAVE_VERSION = 2;   // 2：田改成「形狀 × 類型」，舊存檔不相容

export const START = { tokens: 120, money: 30 };

// 金錢兌換 Token：每 1 金錢換幾個 Token。
export const TOKENS_PER_MONEY = 2;
export const EXCHANGE_OPTIONS = [10, 50, 200];

// 動作積木每執行一次扣的 Token。控制積木（重複、如果、條件）不扣。
// 轉彎不扣（2026-10-15）：難走的形狀不該因為多轉幾次彎就吃虧，形狀難度改由積木數體現。
export const ACTION_COST = { move: 1, turnLeft: 0, turnRight: 0, sow: 2, water: 1, harvest: 1 };

// 每個動作花多久。move 對齊 manifest.movement.stepDurationMs；
// sow／water／harvest 對齊 manifest 動畫片段四格各 180ms。
export const ACTION_MS = { move: 650, turnLeft: 320, turnRight: 320, sow: 720, water: 720, harvest: 900 };
export const TRAVEL_MS = 1200;   // 機器人在田塊之間移動
export const IDLE_MS = 1500;     // 沒有田可做時原地待命多久再找下一塊

// 防呆：一次執行內，連續多少個控制積木沒有夾任何動作就判定當機；最多執行幾個動作。
export const CONTROL_LIMIT = 500;
export const ACTION_LIMIT = 300;
export const CALL_DEPTH = 20;    // 函式最多巢狀呼叫幾層

// 每塊田腳本的積木數上限（不含「開始」積木），起始值依田的類型（PLOT_TYPES.capacity），可花錢擴充。
export const CAPACITY = { step: 4, baseCost: 30, costGrowth: 1.6 };
export const capacityCost = level => Math.round(CAPACITY.baseCost * CAPACITY.costGrowth ** level);

// 土壤含水 0 乾裂、1 一般、2 濕潤、3 積水（對應 farm-atlas 第一列）。
// 每次澆水 +1；每過 MOISTURE_DECAY_MS 自然 -1。生長倍率依含水決定，乾裂與積水都不長。
export const MOISTURE_DECAY_MS = 40000;
export const GROWTH_RATE_BY_MOISTURE = [0, 1, 1.25, 0];

// 作物經濟數值。id 對應 manifest.crops[].id。growMs 是在含水「一般」下從播種到成熟的時間。
// tier 是作物等級：田的類型決定最高能種到幾級。等級越高每秒收益越高，鼓勵挑戰難的田。
export const CROPS = {
  lettuce:    { tier: 1, growMs: 45000,   price: 3 },
  carrot:     { tier: 2, growMs: 90000,   price: 12 },
  tomato:     { tier: 2, growMs: 150000,  price: 22 },
  strawberry: { tier: 3, growMs: 240000,  price: 40 },
  watermelon: { tier: 4, growMs: 900000,  price: 160 },
  cantaloupe: { tier: 4, growMs: 1800000, price: 340 },
};

// 田的類型：決定有哪些輔助。形狀另外定義在 plots.js，一塊田＝形狀 × 類型，類型解鎖後固定不變。
// tokenFree   動作不扣 Token
// autoScript  分「播種腳本」「採收腳本」兩份，系統依作物狀態自動選；false 則只有一份腳本，全部自己判斷
// noDrying    土壤不會變乾，不用澆水
// maxTier     最高能種幾級作物；capacity 起始積木上限
export const PLOT_TYPES = {
  novice:   { name: '新手', colour: '#d7a44b', tokenFree: true,  autoScript: true,  noDrying: true,  maxTier: 1, capacity: 10,
              rule: '不扣 Token、土壤不會乾。系統自動選擇跑「播種腳本」或「採收腳本」，專心想怎麼走完這塊田。' },
  advanced: { name: '進階', colour: '#75bdd0', tokenFree: false, autoScript: true,  noDrying: true,  maxTier: 2, capacity: 12,
              rule: '開始扣 Token，土壤不會乾。系統仍自動選擇播種或採收腳本，步數越少越省錢。' },
  high:     { name: '高級', colour: '#8fc7a3', tokenFree: false, autoScript: true,  noDrying: false, maxTier: 3, capacity: 16,
              rule: '扣 Token，土壤會乾。系統仍自動選擇播種或採收腳本，但要自己判斷什麼時候澆水。' },
  expert:   { name: '專家', colour: '#c65f48', tokenFree: false, autoScript: false, noDrying: false, maxTier: 4, capacity: 24,
              rule: '一份腳本全部自己來：判斷成熟、空地、乾裂，沒事做要記得離開，不然一直白走扣 Token。' },
};
