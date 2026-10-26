# 浮葉農場｜Claude 協作規則

這個 repo 由兩個 AI 同時開發：ChatGPT 負責素材，Claude 負責遊戲本體。兩邊都會 push 到 `main`。
ChatGPT 那側的分工說明在 `AGENTS.md`，兩份內容要保持一致。遊戲設計決策見 `docs/BACKLOG.md`。

## 每次接到需求，第一步

`.claude/settings.json` 的 UserPromptSubmit hook 會在每則訊息送出時自動執行 `git pull --ff-only`，結果會出現在 context 裡。
看到 `[hook] git pull 失敗` 就停下來回報，不要自行 merge、rebase 或 stash。沒看到 hook 輸出就手動 pull 一次。

## 分工

**Claude 的範圍**
- `game.html`、`game/`：直譯器、模擬、經濟、存檔、遊戲畫面與遊戲內動畫播放
- `vendor/`：Blockly（固定版本，放進 repo，不走 CDN）
- `play.html`（遊戲主畫面）、`practice.html`、`practice2.html`（上課練習）、`docs/BACKLOG.md`

**ChatGPT 的範圍**
- `assets/`、`manifest.json`、`alignment.js`
- 素材試驗室：`index.html`、`app.js`、`style.css`
- `docs/STYLE_GUIDE.md`、`docs/prompts-*.json`

## 接點規則

- 遊戲內動畫只依 `manifest.json` 與 `alignment.js` 的數據播放，**不讀、不模仿 `app.js` 的程式邏輯**。
- 數據裡缺少某個動畫規則時，不要自己從 `app.js` 推敲，回報使用者，請 ChatGPT 補進 manifest。
- 需要新素材時，整理成需求清單交給使用者轉達，不要自己產生或修改圖片。
- 試驗室的生長階段切換、採收等操作只是美術展示，不是遊戲機制規格。機制以 `docs/BACKLOG.md` 為準。

## 動工前要先問

- 動到 ChatGPT 範圍的任何檔案
- 需要改 `manifest.json` 或 `alignment.js` 的結構（即使只是想新增欄位）

只讀這些檔案不需要問。
