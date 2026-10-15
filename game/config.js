// 遊戲數值設定表。調整平衡只改這裡，不改程式。時間單位一律毫秒。

export const SAVE_KEY = 'robot-farm-save-v1';
export const SAVE_VERSION = 1;

export const START = { tokens: 120, money: 30 };

// 金錢兌換 Token：每 1 金錢換幾個 Token。
export const TOKENS_PER_MONEY = 2;
export const EXCHANGE_OPTIONS = [10, 50, 200];

// 動作積木每執行一次扣的 Token。控制積木（重複、如果、條件）不扣。
export const ACTION_COST = { move: 1, turnLeft: 1, turnRight: 1, sow: 2, water: 1, harvest: 1 };

// 每個動作花多久。move 對齊 manifest.movement.stepDurationMs；
// sow／water／harvest 對齊 manifest 動畫片段四格各 180ms。
export const ACTION_MS = { move: 650, turnLeft: 320, turnRight: 320, sow: 720, water: 720, harvest: 900 };
export const TRAVEL_MS = 1200;   // 機器人在田塊之間移動
export const IDLE_MS = 1500;     // 沒有田可做時原地待命多久再找下一塊

// 防呆：一次執行內，連續多少個控制積木沒有夾任何動作就判定當機；最多執行幾個動作。
export const CONTROL_LIMIT = 500;
export const ACTION_LIMIT = 300;
export const CALL_DEPTH = 20;    // 函式最多巢狀呼叫幾層

// 每塊田腳本的積木數上限（不含「開始」積木），可花錢擴充。
export const CAPACITY = { start: 10, step: 4, baseCost: 30, costGrowth: 1.6 };
export const capacityCost = level => Math.round(CAPACITY.baseCost * CAPACITY.costGrowth ** level);

// 土壤含水 0 乾裂、1 一般、2 濕潤、3 積水（對應 farm-atlas 第一列）。
// 每次澆水 +1；每過 MOISTURE_DECAY_MS 自然 -1。生長倍率依含水決定，乾裂與積水都不長。
export const MOISTURE_DECAY_MS = 40000;
export const GROWTH_RATE_BY_MOISTURE = [0, 1, 1.25, 0];

// 作物經濟數值。id 對應 manifest.crops[].id。growMs 是在含水「一般」下從播種到成熟的時間。
// 前期以分鐘計，後期高價作物拉長（docs/BACKLOG.md）。
export const CROPS = {
  lettuce:    { growMs: 45000,   price: 3 },
  carrot:     { growMs: 90000,   price: 12 },
  tomato:     { growMs: 150000,  price: 20 },
  strawberry: { growMs: 240000,  price: 32 },
  watermelon: { growMs: 900000,  price: 110 },
  cantaloupe: { growMs: 1800000, price: 200 },
};
// 新手田只能種收益差的作物；它不扣 Token、含水固定一般。
export const TUTORIAL_CROPS = ['lettuce'];
