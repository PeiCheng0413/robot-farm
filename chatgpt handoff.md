# 浮葉農場｜ChatGPT 交接

更新：2026-10-16。這份文件由使用者明確要求建立，供新的 ChatGPT 對話接手；分工仍以最新版 AGENTS.md 為準。請先讀本文件、AGENTS.md、docs/STYLE_GUIDE.md，再讀相關數據與程式。

## 接手第一步

1. 在專案根目錄執行 `git pull --ff-only`。失敗立即回報，不要 reset、強制覆蓋或強推。
2. 讀 AGENTS.md，檢查 `git status --short`，保留別人的未提交修改。
3. 目前素材要求已完成、提交、推送、部署，沒有尚未完成的素材工作；等使用者下一項需求，不要自行重做或擴張遊戲機制。

專案：`/Users/peicheng/Documents/Codex/2026-10-15/clone-https-github-com-peicheng0413-robot-2`

- GitHub：https://github.com/PeiCheng0413/robot-farm
- 共同分支：`main`，Claude 也會推送。
- 素材試驗室：https://peicheng0413.github.io/robot-farm/?v=17
- 交接建立前 HEAD：`4aca552e11e4c70e39408042b509b82ffe809d36`。
- 試驗室 UI／app／manifest fetch 快取參數為 v17；manifest 根 `version` 仍是 `0.13`，不要為了對齊 UI 版號擅自改既有欄位意義。

## 分工與使用者偏好

- ChatGPT：`assets/`、`assets/manifest.json`、`alignment.js`、`index.html`、`app.js`、`style.css`、`docs/STYLE_GUIDE.md`、`docs/prompts-*.json`。
- Claude：`game.html`、`game/`、`vendor/`、`CLAUDE.md`、`.claude/`、`docs/BACKLOG.md`、`docs/GAME_EVENTS.md`。另有 `play.html` 是遊戲頁，也不要改。
- 生長、成熟度、經濟、庫存、商店、擴地、存檔、積木、遊戲內動畫播放器與互動全部由 Claude 負責。
- 唯一共用接點：manifest 與 alignment。Claude 不讀 app.js；播放順序、每格毫秒、循環、物件顯隱、錨點、轉向、基準點、圖層順序都要寫成數據。先改數據，再讓 app.js 依數據播放。
- 可直接新增欄位；改既有欄位結構／資料形狀、既有素材檔名／讀取路徑、刪除或改意義，先問使用者。
- 已授權依命名慣例直接新增素材檔名／路徑，不必逐次確認。新版本用新檔名，不覆蓋舊圖。歷史曾有明確授權覆蓋，不代表現在可自行覆蓋。
- 使用繁體中文，避免反覆確認例行美術選擇。真有選項時用 A／B／C，使用者不喜歡無必要的提問。
- 此對話一直採完成後提交、推送並更新 GitHub Pages 的流程；每次仍需看當下授權與最新指示。不要擅自傳訊給 Claude 或其他對話；有需要可以準備文字交由使用者轉交。

## 美術方向

目前是安靜溫暖、低飽和的山谷農田，遠山／林緣／草地包圍空地。舊溫室素材保留，不是現在主風格。硬邊方形像素、深青綠輪廓、三階明暗、左上光源、透明背景、圖內無字。

主色：輪廓 #263f3c、深青綠 #35665b、薄荷 #8fc7a3、奶油白 #f0e4bb、外殼暗部 #c6b887、黃銅 #d7a44b、水 #75bdd0，土色 #77513b／#a67950／#c6a376。生成圖保留原始色階，不能宣稱已嚴格量化成索引色盤或逐像素清稿。

田地是棋盤格、可拼俄羅斯方塊形狀。輕微俯角採正交矩形田面 64×48、外露南側土面厚 4px，不是菱形等角。作物、機器人、持物、泡泡、名牌、農舍都維持直立比例；不要用 CSS 壓縮整張場景。全場按落地位置排序，不可按田區各畫完一組，也不可將全部圍繩最後蓋到作物上。

## 最近三批完成項目

### v0.17 木樁與細繩（最新）

使用者要擴地用棋盤邊界，可圍 T 字、不遮田。已新增 `assets/land-boundary-atlas-v01.png`（2172×724 RGBA，三個獨立零件），內建 image_gen 生成後原樣複製；提示詞與來源見 `docs/prompts-v17.json`。

manifest 只新增根 `landBoundary`，舊數據保持不變：

- `parts.post.sourceRect=[314,227,89,285]`，局部 `groundAnchor=[44.5,285]`，contain 顯示盒 `[6,16]`，實際約 5×16px。
- `parts.horizontal.sourceRect=[752,343,652,39]`，`endpointRatios=[[0,0.3],[1,0.3]]`。
- `parts.vertical.sourceRect=[1797,91,43,543]`，`endpointRatios=[[0.5,0],[0.5,1]]`。
- 繩厚 3px、架高 `ropeElevation=11`。橫／直分別用自己的圖格，只伸展長軸。木樁不旋轉、不隨田面壓扁。
- `geometry.sides` 定義四方鄰格與邊起終點；輸入是「同一個要顯示的範圍」整數田格聯集，不是照作物或小田區分組。只輸出鄰格不存在的外露邊，端點按整數頂點去重，一頂點一根樁；凹角、內洞、分離區塊均可處理。
- 擴地後由 Claude 提供新的格集合再重建視覺，共用邊消失；不是 ChatGPT 實作擴地條件、費用或碰撞。
- `depthOrder` 與直立素材共用 groundY／groundX／kindOrder；繩依未上移的中點，木樁依頂點排序，後繩可被前作物遮住。
- `lab` 保存 T／L／I／O 樣本格集合、田面比例、原點、作物示例等。

app.js：`boundaryGeometry` 依 sides 求邊與頂點；`addBoundarySprites` 依數據排入排序；`drawBoundarySample` 畫有作物的樣本。試驗室有主場景邊界開關 `#boundary-visible` 與四個 `#boundary-samples` 樣本。

已測：T／L／I 各 10 段繩與 10 根樁，O 為 8／8；重複輸入去重、空集合、分離兩格、3×3 內洞、擴一格後內邊刪除；瀏覽器 T 凹角／作物遮擋、開關、兩種視角切換、無 console error。node 語法、diff whitespace、manifest 舊值比較、PNG 來源框、Claude 保護檔案皆通過。

提交 `4aca552`，GitHub Pages run `38830126520` 成功。

### v0.16 科技農舍

`assets/farmhouse-tech-v01.png`，1536×1024 RGBA：奶油白牆、青綠屋頂、木門、太陽能板、小感測天線。提示詞 `docs/prompts-v16.json`。部分生成預覽看似有背景光暈，實際 alpha 大多為 0，已在草地合成確認；原始生成有少量近透明雜點，未清稿。

manifest `valleyFarm.assets.farmhouse`：sourceRect `[140,78,1340,856]`、局部 groundAnchor `[665,850]`、contain 盒 `[224,144]`、animated=false、sortKind=building。另新增 `depthOrder.kindOrder.building=4`、`preview.props=[{asset:'farmhouse',groundPosition:[144,350]}]` 與座標說明。位置是 960×600 示範畫布像素，遊戲可自己放置。

農舍只是靜態圖片，沒有開門、燈號、發電或其他遊戲效果。提交 `9352d22`，已部署。

### v0.15 山谷與輕微俯角

新圖：`mountain-backdrop-v01.png`、`forest-edge-v01.png`、`grass-ground-tile-v01.png`、`soil-front-edges-v01.png`。完整來源框、尺寸在 `manifest.valleyFarm.assets`，提示詞 `docs/prompts-v15.json`。

`valleyFarm` 含 environment 背景分層、projection 視角、terrain 前土面、uprightSprites、depthOrder、preview。輕微俯角 64×48／4px，原俯視比較 64×64／0px。草地是透明草叢疊底色，山與樹是分層背景。南側鄰格不存在才畫土面，需檢查所有相關田格聯集，跨田區也不能多畫內牆。

主場景 canvas `#valley-preview` 為 960×600，有 L／T／O 田形、六種作物、兩個靜態角色與名牌。動作工作台與舊溫室素材折疊保留，所有原功能仍在。提交 `d3f31c7`，已部署。

上述是試驗室／素材已完成，不代表 Claude 已接入遊戲。要判定遊戲目前整合程度須另作唯讀檢查，不要據此聲稱遊戲畫面已更新。

## 較早素材與動畫，延續時不能退回舊版

- 原版待命使用 `robot-atlas-v01.png` 第一列；四向移動使用 `robot-hover-directions-v04.png`，不是把正南移動圖代替原版待命。
- 空手採收 `robot-harvest-empty-v02.png`，四格播放一次，第三步開始疊獨立收成；不要使用原 v01 帶作物的採收列。
- 持物 `robot-carry-directions-v06.png`：南／西／北／東／原版視角待機，共 5×4 格。東西雙臂在側邊；使用者決定保留獨立兩方向，不要水平鏡像取代其細微光影。
- 角色圖內沒有收成物。六種 `produce-作物英文名-v01.png` 獨立疊圖，單一攜帶槽；機身與手掌透過 alignment 校準，不按圖片外框逐格重置中心。
- 六種作物：胡蘿蔔、番茄、萵苣、草莓、西瓜、哈密瓜。`crops[].frames` 有來源框、局部 root、scale。新水果在 `fruit-growth-v01.png`，不可假設四等分能保留藤蔓。
- 田面四種含水狀態；soilVariants 每種有 plain／flowers／stones／mixed，所有來源與合成位置在數據內。
- 最新雷達是 `robot-area-scan-v02.png`，不是 v01。天線縮回、頂蓋打開、雷達升起來回轉、收回再復位；scan clip 12 步共 1740ms，不循環，完成 idle。獨立 `scan-wave-v01.png`／effectClips，別把波紋畫進角色。規格見 prompts-v11.json、STYLE_GUIDE 與 manifest。
- 判斷 `robot-decision-v01.png`：左右紅綠互換每 300ms，成立雙綠、不成立雙紅各 1000ms 後 idle。結果由外部提供，試驗室只手動示範。
- 思考 `robot-thought-bubbles-v01.png`：三點四步各 180ms 循環；勾、叉各 1000ms；澆水壺、種子靜態，manifest.thoughtBubbles.byClip 指定狀態。泡泡有獨立 elapsed-time cursor，不可用眼燈 frame 當索引。錨在頭頂右側，跟隨 bob，不遮臉。
- mainScreenAssets 保留窗框橫條、石板方塊、四級田牌、Token 與金錢。田牌圖內無字，以 textRect 疊字；四類色 #d7a44b／#75bdd0／#8fc7a3／#c65f48。接續必須用指定 sourceRect／repeat 單元，不是鋪整張含透明留白的 PNG。
- manifest.animationClips／playback／rendering 配合 alignment.js 是播放事實來源。歷史 STYLE_GUIDE 前面的舊規格有些被後段新版取代，優先讀最新相關章節與現行數據。

## 素材製作與驗證流程

1. 有新增或編輯位圖需求就讀 imagegen SKILL.md，用內建 image_gen；不要自行用 SVG／Canvas 假素材取代使用者要的圖。
2. 參考現有圖片需先 view_image 觀察；編輯舊圖仍用 imagegen。不要用 Python 編圖，除非使用者明確指定。Python/PIL 可唯讀量測尺寸、alpha、來源範圍；選定生成圖可原樣複製。
3. 輸出新版本 PNG 至 assets/，不能只留在 Codex generated_images 目錄。記錄完整提示詞、選定來源與製作方式至 docs/prompts-vNN.json。
4. 實際生成尺寸可能不等於提示詞；逐格量測，校準 sourceRect／錨點，確認 alpha、切圖不截斷。
5. 先加 manifest／alignment 數據，再接 lab。保留所有既有數據和檔名。
6. 測與改動相關的資料、語法與呈現；靜態素材不需龐大測試套件。常用 `node --check app.js`、`git diff --check`、舊 manifest 深度比較、圖片框界限，瀏覽器看實際合成與 console。
7. 提交前再 pull --ff-only 避免 Claude 已推新版本。只 add 自己的檔案，不能 git add . 把 Claude 工作一起帶進提交。
8. 若推送部署，等待 GitHub Pages 對應 SHA 的 run 成功再宣告線上已更新；必要時比對線上檔案 hash。既有 workflow 是 Pages 自動部署，repo 沒有自訂 .github/workflows 目錄。

本機可以 `python3 -m http.server 8765 --bind 127.0.0.1` 測試；前對話曾啟動一個此埠服務，先確認再另開。瀏覽器工具的舊 tab／JS 變數不保證跨對話存在，需重新取得工具文件與 tab。不必為接手而開新 worktree 或子代理。

## 為什麼換對話

使用者手機開此任務出現「載入此任務的訊息逾時，請再試一次」，因此要新的對話接手。已查桌面 Codex 更新工具，當時 26.1013.31256／build 20586 回報 up_to_date。確切逾時原因未確認；長對話與大量圖片只能算可能因素，沒有診斷證據。不要把此問題誤認為 repo 或 GitHub Pages 故障。

使用者問過 handoff skill：當時可用技能清單沒有名為 handoff 的技能，因此以一般專案交接文件完成，沒有假裝使用該技能。

## 可以貼給新對話的開場

> 請接手浮葉農場。先 git pull --ff-only，再讀 AGENTS.md、chatgpt handoff.md 與 docs/STYLE_GUIDE.md。遵守 ChatGPT／Claude 分工；素材、試驗室與動畫數據由你負責，遊戲本體不要改。已完成至素材試驗室 v0.17。讀完後等待我的下一項素材需求，不要重做已完成工作。
