# 浮葉農場｜AI 協作分工

這個 repo 由兩個 AI 同時開發，兩邊都會 push 到 `main`：
- **ChatGPT**：素材、素材試驗室、動畫規則數據
- **Claude**：遊戲本體（機制、積木、遊戲畫面與遊戲內動畫播放）

## 每次開始工作前

先執行 `git pull --ff-only`，確認拿到最新版本。Claude 可能剛推過遊戲程式。
pull 失敗就停下來回報使用者，不要強制覆蓋。

## ChatGPT 的範圍

- `assets/`：所有圖片與 `manifest.json`
- `alignment.js`：sprite 對位與校準數據
- 素材試驗室：`index.html`、`app.js`、`style.css`
- `docs/STYLE_GUIDE.md`、`docs/prompts-*.json`

## Claude 的範圍（ChatGPT 不要改）

- `game.html`、`game/`：遊戲本體，包含遊戲內的角色動畫播放
- `vendor/`：第三方函式庫（Blockly）
- `play.html`（遊戲主畫面）、`practice.html`、`practice2.html`、`practice_array.html`（上課練習）、`CLAUDE.md`、`.claude/`、`docs/BACKLOG.md`

## 兩邊唯一的接點：manifest.json 與 alignment.js

Claude 只讀這兩份數據來播放遊戲內動畫，不讀 `app.js`。所以：

- **所有動畫規則都必須寫成數據**，不能只存在 `app.js` 的程式邏輯裡。包括每格毫秒數、播放順序、是否循環、哪一格顯示或隱藏物件、持物錨點、轉向順序、基準點、圖層順序。`app.js` 只負責照數據播放。
- 新增或修改動畫行為時，先改 `manifest.json` 或 `alignment.js`，再改 `app.js`。
- **改 `manifest.json` 的既有欄位結構、`alignment.js` 的既有資料形狀、既有素材檔名或讀取路徑之前，先問使用者。** 新增欄位可以直接做；改名、刪除、改意義要先問，因為遊戲程式依賴它們。
- 使用者於 2026-10-15 授權：依既有命名規則新增素材檔名與路徑可直接開工，不用逐次詢問；仍採新版本檔名，不覆蓋舊檔。

## 共同規則

- 素材新版本用新檔名（v05、v06…），不覆蓋舊檔
- 介面一律使用繁體中文
- 本檔的分工若要調整，由使用者決定
