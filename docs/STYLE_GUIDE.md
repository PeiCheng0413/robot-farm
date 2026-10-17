# 浮葉農場｜美術風格規範 v0.18

這是素材與動作的初期驗證版。先確定畫面、角色與農作物，之後再開發增量玩法。所有使用者介面使用繁體中文。

## 視覺方向

目前方向：溫暖、安靜、低飽和的山谷農田，以遠山、林緣與草地包圍空地；溫室素材保留為舊版資源。使用可辨識方形色塊、深色輪廓與三階明暗的像素風。禁止寫實材質、模糊邊緣、漸層、發光濾鏡與不同方向的光源。直立素材採略俯視的正交三分之四視角；遊戲斜角由程式投影地面，規範見下方視角章節。光線固定從左上方來。

## 視角與地面投影（目前規格・v0.18）

斜角場景先將整片「正方形俯視地面」在程式裡順時針旋轉約 18°，再把畫面 Y 壓為 40/64。這取代「田地不旋轉」作為通用規則；舊 `valleyFarm.projection` 仍保留其歷史比較視角與全部原值，不改動 `slight`。新增規格放在 `valleyScene.projection.views.game`，未旋轉的田面基準為 64×40，外露土壁向畫面下方延伸 13px；旋轉後的格子外框不等於 64×40。

地面素材（田土、草地、泥土步道、踏腳石）依然製作成正上方俯視的 64×64 邏輯方格，不在圖片裡預先畫斜、旋轉或壓扁。先合成地面圖層，再套同一個旋轉與 Y 縮放；相鄰格共用格線。地面點擊反算須按相反順序處理：扣原點、解除 Y 壓縮、反向旋轉，再換回田格。

直立素材（樹、作物、機器人、貨物、泡泡、名牌、農舍、裝飾）仍採略俯視正交三分之四，所有垂直線保持站直。只將落地錨點送進地面投影，圖片本身維持等比與朝上，禁止把整個場景一起 CSS scaleY、rotateX 或平面旋轉。機器人與貨物／泡泡為同一組直立顯示。前景樹叢按畫面邊緣定位，不跟地面轉。

所有直立物依投影後 groundY、groundX、kindOrder 全域排序，不能按田區分組。框邊樹叢為明確的前景遮罩，最後畫；一般樹與裝飾仍應依落地點排序。土壁只沿佔地聯集沒有鄰格且朝畫面前方的外露邊畫，跨田區不能長出內牆。背景的山、湖、天空在畫面座標定位。現有素材全部照常使用，不重做。

## 固定色票

|用途|色碼|
|---|---|
|深色輪廓|#263f3c|
|機器人面板／深葉|#35665b|
|薄荷綠／推進器|#8fc7a3|
|奶油白外殼|#f0e4bb|
|外殼暗部|#c6b887|
|黃銅／種子|#d7a44b|
|水|#75bdd0|
|胡蘿蔔|#dc8245|
|番茄|#c65f48|
|土壤|#77513b、#a67950、#c6a376|

以上是生成目標色票，生成圖仍有額外色階，尚未量化成嚴格索引色盤。

## 角色鎖定

機器人為奶油白圓角方殼、深青綠面板、兩個薄荷綠方眼、小型黃銅天線、青綠雙臂，底部一個漂浮推進器，沒有腳。固定朝右前方。各動作不能改變外殼、眼睛與天線設計。播種使用種子袋，澆水使用噴嘴，採收使用空手夾爪，最後雙手舉到頭頂；禁止把農作物、籃子或貨物畫進機器人圖格。收成物使用獨立透明 PNG 疊在角色上方，一次只能持有一個。

## 圖集與切格

兩張 PNG 均有透明 Alpha，實際尺寸 **1254 × 1254 px**；提示詞指定 1024，但生成結果未遵守。每張為 4 欄 × 4 列，沒有標籤或格線。

- `assets/robot-atlas-v01.png`：由上至下為漂浮、播種、澆水、採收；每列由左至右播放四格。
- `assets/farm-atlas-v01.png`：首列為乾裂、一般、濕潤、積水；後三列依序為胡蘿蔔、番茄、萵苣，每列依序為幼苗、幼株、成長、成熟。
- 農場圖集使用背景尺寸 400% × 400%，每格位置為欄／列索引乘 100/3%。機器人不可用此方法，必須使用下方 v0.1.1 的不等寬取樣範圍。
- 原圖每格名義寬高為 313.5 px，正式匯入引擎前應重整為整數格寬，不要假設它是 256 px。農場圖若先切原圖，邊界使用 `[0,314,627,941,1254]`，保留每格原始偏移。
- AI 生成圖仍有少量輪廓雜點、大小與基準點變動，是可互動概念素材，不是已逐像素清稿的最終 sprite。
- 目標下一版：64 × 64 邏輯像素／格、整數倍最近鄰放大、固定基準點。請勿把 v0.1 說成已符合此規格。

## 動作規則

展示播放每格 180 ms，四格約 0.72 秒循環。漂浮主要由圖格本身的上下位移表現；切換田區的移動由展示程式補間。播種與澆水維持循環預覽。v0.2 採收改為播放一次後持物：抬起時隱藏原田區植株並顯示獨立收成圖，放下時恢復原田區展示；沒有庫存、收益或生長運算。尊重系統減少動態設定，預設暫停。

## 畫面組裝

由後向前為溫室窗框、地板、土壤、作物、機器人與控制介面。每個田區的作物種類、生長階段與土壤狀態可獨立檢視。溫度 24°C、空氣濕度 65% 為自動環控的固定示意值；積水僅是視覺狀態，不代表種植建議。

## 下次生成流程

1. 先讀本文件與 `prompts.json`，以兩張 v0.1 圖集作為圖片風格參考，不只依賴文字。
2. 一次只增加一類素材，重複指定角色不變條件、光源、視角、色票與留白。
3. 保留透明背景、固定四欄四列、圖內不加文字。新圖命名 v02，不覆蓋 v01。
4. 檢查實際像素尺寸、Alpha、格數、格界是否截斷、四格循環是否跳動，以及土壤與植株疊圖的位置。
5. 確定美術方向後再做逐像素清稿、整數格寬與基準點統一；完成後才接生長、溫濕度調節與增量經濟系統。

## 可直接延用的提示詞骨架

「以附圖為唯一風格基準，製作浮葉農場的［素材名稱］。暖色低飽和像素風，硬邊方形像素，三階明暗，深青綠輪廓，左上光源，略俯視正交三分之四視角。保持奶油白與青綠機器人設計不變。透明背景，四欄四列固定格位，各圖完整置於格內，沒有文字、標籤、格線、模糊或漸層。逐格內容為［明確列出］。」

完整原始生成提示詞保存在同目錄 `prompts.json`，本次使用內建 image_gen，未使用 CLI/API。

## v0.1.1 切格修正

機器人的種子、水流與第一格採收胡蘿蔔跨越原本四等分格界。禁止使用等分裁圖或 clip-path 遮掉溢出物件；它們屬於前一格的完整動作。

原圖保留不變，展示以 Canvas 依各列透明間隙取樣。各列水平邊界如下（px）：

|動作|水平分界|
|---|---|
|漂浮|0, 327, 630, 936, 1254|
|播種|0, 329, 659, 970, 1254|
|澆水|0, 336, 660, 986, 1254|
|採收|0, 359, 647, 949, 1254|

垂直分界維持 0, 314, 627, 941, 1254。所有動作渲染到 384 × 340 的透明畫布，左上偏移為 `sourceX - round(column * 313.5) + 16, 13`，不逐格重新置中或拉伸。完整配置保存在 manifest.json。這是取樣修正，沒有重新生成或改繪角色。

## v0.2 空手採收與獨立收成素材（目前規格）

- `assets/robot-harvest-empty-v02.png`：1254 × 1254，2 × 2，共四格，每格 627 × 627。閱讀順序為左上、右上、左下、右下：伸手、抓取、抬起、舉過頭頂。所有格均為空手。
- 原始 `robot-atlas-v01.png` 的第四列僅保留歷史原檔，不再用於展示與遊戲。前三列維持 v0.1.1 逐列取樣修正。
- 獨立收成圖：`produce-carrot-v01.png`、`produce-tomato-v01.png`、`produce-lettuce-v01.png`；各 1254 × 1254、透明背景、單一完整作物。胡蘿蔔為完整根與葉，番茄為一顆果實，萵苣為一顆菜球。
- 商店與持物層共用相同 PNG、同一套內容範圍，只改顯示大小，不能從機器人圖集截取作物。
- 內容取樣範圍與畫布尺寸見 `assets/manifest.json`。收成圖在 96 × 96 畫布裡等比例縮放至最長邊 80，底部對齊 y=88。
- 採收開始即保留唯一攜帶槽，第二次按採收不能疊加。第三格顯示獨立作物，第四格完成後保持舉起姿勢，不循環生成新收成。
- 攜帶中可移動田區；不能播種、澆水或再採收。按「放下作物」會恢復原田區展示並釋放攜帶槽。這只是可重複驗證素材的展示行為。
- 未成熟作物也允許測試同種類收成圖，因為此階段尚未加入成熟度判定。
- 生成提示詞保存於 `docs/prompts-v02.json`，使用內建 image_gen。

延續生成時，請同時參考原始機器人圖集、新空手圖集及本次收成圖；將「空手角色」與「單個物品」分開生成。不得重新將胡蘿蔔、番茄、萵苣或籃子合併進角色貼圖。

## v0.3 移動與轉向

新增 `assets/robot-directions-v03.png`：1254 × 1254，2 × 2，每格 627 × 627。左上正面（南）、右上左側（西）、左下背面（北）、右下右側（東）。四格都是直立機器人，轉動的是身體朝向，不是將圖片平面旋轉。使用內建 image_gen，完整提示詞為 `docs/prompts-v03.json`。

轉向以機器人自己的左右為準。例如正面朝南時左轉會朝東（畫面右），右轉會朝西（畫面左）；連續四次同方向轉向回到原方向。移動方向獨立於工作動作，漂浮待命、播種、澆水與空手採收保持正面。

點選田區會依橫向再縱向的路徑逐格移動，每格 650ms，換方向時使用對應側面或背面圖。抵達後恢復正面待命或舉物姿勢，但保留下一次「向前一格」的方向設定。移動期間忽略新移動與工作指令，避免交錯；暫停按鈕也會暫停移動。降低動態效果偏好使用無補間位移。

攜帶物維持唯一獨立圖層，跟隨機器人移動。方向圖目前雙臂向下，尚未製作各方向的舉手姿勢；抵達後恢復正面舉手。之後可補方向持物圖，但作物不可合併進角色圖。

## v0.4 正南視角與四向漂浮（取代 v0.3 靜態方向圖）

新素材 `assets/robot-hover-directions-v04.png` 為 1254 × 1254 透明圖集：由上至下是南、西、北、東，各列由左至右四格漂浮，共 16 格。南向必須正對觀者，面板、雙眼與雙臂左右對稱，不可使用偏斜三分之四視角。

每格 180ms，四格循環；各方向均有機身上下與推進器變化。轉向後停留、移動中持續播放該方向的四格動畫；預設待命與抵達後的空手待命依 v0.4.1 恢復原版待命四格。播種、澆水、採收維持既有工作動作。

水平分界為 0,314,627,941,1254；垂直分界為 0,331,625,910,1254，依透明間隙取樣以保留完整推進器。顯示時保留原始列座標偏移，不將每格重新置中。禁止直接按四等分裁切垂直格線。

本次使用內建 image_gen，完整提示詞為 `docs/prompts-v04.json`。原 v0.3 方向圖保留作歷史參考，不再用於展示。

## v0.4.1 待命與移動分開

待命使用 `robot-atlas-v01.png` 第一列原版漂浮，包含初始畫面、按漂浮按鈕、移動抵達及放下作物後。`robot-hover-directions-v04.png` 的正南圖僅用於南向移動及方向預覽，不能取代待命。其他三方向的移動漂浮動畫保持不變。

## v0.5 貼圖尺寸與定位校準

來源 PNG 保留不變，顯示時依 `alignment.js` 的每格機身中心與外殼高度做等比縮放及定位。所有機器人畫布統一為 416 × 416，機身中心 (208,208)，外殼高度 124；不以手臂、水流、種子或推進器的外接範圍決定機身大小。漂浮位移統一為 0,-4,-8,-4，避免來源圖不同的偏移累積成跳動。畫布保留足夠空間容納完整水流。

作物以每階段的根部位置對齊同一基準點 (160,285)，使用 320 × 320 畫布，保留各生長階段的原始大小差異。萵苣不再因原始留白不同而浮在田面上。

場景中的機器人位置依田區實際格寬與格高計算，移動與靜止使用相同定位公式；縮放視窗時重新對齊。頭頂作物置於角色中心，漂浮位移與角色一致。待命仍使用原版圖，南向移動仍使用正南四格。

本次僅調整程式取樣與定位，未重新生成或修改 PNG。未來新增圖集時，應先補 `alignment.js` 的外殼與根部基準，再接入顯示。

## v0.6 持物四向與原版待機（取代 v0.3 的攜帶限制）

assets/robot-carry-directions-v06.png 為 1122 × 1402 透明 PNG，4 欄 × 5 列。由上至下是南、西、北、東、原版三分之四待機；各列四格以 180ms 循環。所有格雙臂舉高，機器人圖內不含作物。側面保持兩隻手臂，禁止多畫下垂手臂。

採收完成後改播持物待機。移動與轉向使用對應持物方向，抵達恢復原版視角的持物待機。空手狀態沿用原版待機及 v0.4 四向移動。採收過程仍播放 v0.2 四格一次。

作物仍共用既有三張收成透明圖，一次一個；每格以 alignment.js 的 carry.shells 校準機身尺寸與中心、carry.hands 定位手掌之間的作物底部。機身與作物共用 0,-4,-8,-4 的漂浮位移。切格依實際尺寸與透明間隙檢查，不能假設生成尺寸符合提示詞。新素材仍是概念美術，尚未逐像素清稿。

使用內建 image_gen，初始提示詞與側面手臂修正提示詞保存在 prompts-v06.json。

## v0.6.1 東、西向持物手臂

東、西側視圖的肩關節固定在可見側殼中央。近側手臂從側肩向上彎曲，遠側手臂受機身遮擋，兩臂在側視投影中重疊；不可把雙手畫在機身前後兩端。保留頭頂單個獨立作物，手掌座標與機身定位沿用既有 carry.hands、carry.shells 的資料形狀，只校準數值。既有素材檔名、路徑、圖集尺寸與切格不變，manifest.json 不變。內建 image_gen 修正提示詞保存在 prompts-v06.json 的 sideProfileCorrection。


## v0.7 可拼接正方形農田

依使用者指定，沿用 assets/farm-atlas-v01.png，第一列改成四個滿格正方形土壤面，依序乾裂、一般、濕潤、積水。四欄四列、圖集尺寸及既有素材路徑保留。後三列仍為獨立作物階段，土壤不能畫入作物格。

新土壤俯視呈正方形，四邊平直，沒有外凸石塊、圓角、立體側面、圍欄與透明留白。土壤顏色、硬邊像素與左上光源沿用原風格；同狀態鄰格可排列成 I、L、T、O 等形狀。生成紋理仍是概念素材，未逐像素校正成嚴格無縫貼圖。

場景田區改用等寬高單格，純美術展示區提供四種靜態拼接排列及土壤外觀切換。沒有實作擺放、碰撞、解鎖或其他遊戲規則。manifest.json 與 alignment.js 均未修改。使用內建 image_gen，原始紋理及圖集合成提示詞保存於 docs/prompts.json 的 squareSoilTexture 與 squareSoilAtlasComposition。

取樣注意：本次生成的土壤內容延伸至 y=317。第一列作物由 y=318 起取樣，略過上方四像素並保留原畫布偏移，避免帶入土壤細線；此修正在 app.js 的 drawPlant，植株根部參數不變。


## v0.8 草莓、西瓜、哈密瓜與共用素材數據

新增 fruit-growth-v01.png（1448 × 1086，四欄三列），由上至下是草莓、西瓜、哈密瓜，各有幼苗、幼株、成長、成熟四種外觀。以白花／尖形紅果、綠色條紋整顆瓜、金黃色網紋整顆瓜區別三種作物；沿用硬邊像素、深青綠輪廓與左上光源。

獨立透明收成圖沿用 produce-作物名-v01.png 命名：strawberry、watermelon、cantaloupe 各一張。機器人圖集不含作物，持物時照舊疊加獨立收成圖。舊素材、舊作物編號及 alignment.js 完整保留。

manifest.json 新增 crops、animationClips、playback、rendering；只新增欄位，不刪除、改名或改變既有欄位意義。crops[].frames 列出每格 sourceRect、局部 root、scale，對齊 rendering.plantRoot。藤蔓超出名義等分格界，必須使用逐格 sourceRect，不能直接四等分。新作物各階段共用固定比例，保留自然大小差異。produce[].sourceRect 提供各收成圖內容範圍。

animationClips 以 frameDurationsMs 明列每個播放步驟的時長（frameDurationMs 保留為預設值），frameOrder 可重複同一圖格；另定義、loop、物件逐格顯示狀態及完成後 clip。playback 指定工作、轉向、空手與持物待機的 clip。rendering.robotPoses 指定來源框與 alignmentPath，持物格另有 cargoAnchorPath；路徑相對於 spriteAlignment。rendering 定義畫布、植株根部、收成圖基準、持物尺寸與圖層順序。movement 保留轉向順序／步進時長，新增方向向量與減少動態時長。rendering.scene 是素材試驗室位置示例，遊戲可使用自己的田格位置配合相同 sprite 基準點。

這些都是美術播放與定位數據；四階段作物外觀由素材試驗室手動切換，沒有加入生長時間、成熟度判定、經濟、庫存或存檔規則。app.js 讀取共用數據顯示；Claude 可只讀 manifest.json 與 alignment.js，不需讀 app.js。game.html、game/、vendor/ 完整保留。提示詞規格與生成來源記錄於 docs/prompts-v08.json。


## v0.9 田地角落裝飾

新增 soil-decorations-v01.png，1086 × 1448 RGBA，三欄（小花、碎石、混合）、四列（乾裂、一般、濕潤、積水）。保留所有原素材。原版加三種裝飾組合，共 16 種田地外觀。裝飾為透明獨立圖，花叢與石塊逐個取樣，再以最大 40／45 像素繪入 320 方形土壤畫布；保留中央 30–70% 與邊緣空間。

manifest.soilVariants 完整提供畫布、預設、狀態、variant ID、每個圖層的 atlas、sourceRect、destinationRect、z。按 z 升序合成同一 soil 畫布，再沿用既有 soil → plant → robot → cargo 圖層。sourceRect 是來源圖像素，destinationRect 是合成畫布像素。每田格保存 variant ID，不隨動畫或重繪抽樣；原版 ID 為 plain。Claude 可只讀這份數據實作遊戲顯示。既有欄位形狀與意義不變，alignment.js 與遊戲檔案未改。

素材試驗室提供每狀態四種樣本、選取田區細節選單，以及固定裝飾分布的 I/L/T/O 拼接預覽。本次用內建 image_gen 生成，提示詞與來源保存於 prompts-v09.json。


## v0.10 整塊田範圍掃描

新增 robot-area-scan-v01.png 與 scan-wave-v01.png，皆為 1254 × 1254 RGBA。角色為準備、抬起側邊感測器、伸手掃描、收回四格；波紋為小、中、大、分段消散四格。保留原奶油白機殼、深青綠面板、雙方眼、黃銅天線、薄荷推進器與左上光源。兩份圖集分開，不含田地與作物。使用內建 image_gen；完整提示詞在 prompts-v10.json。

manifest.animationClips.scan 使用八個播放步驟，frameOrder 為 0/1/2/2/2/2/3/0，時長依序 140/160/140/180/180/180/160/160 ms，共 1300 ms；播放一次後 onComplete=idle。伸手的四個步驟依序播放四格波紋。rendering.robotPoses 新增 row 13，逐格 sourceRect 與 alignmentPath 指向 spriteAlignment.scan；只新增校準欄位，不改舊結構。

manifest.effectClips.areaScanWave 的 frameIndexByStep／opacityByStep 與 scan 的播放步驟對應，不可用重複的角色圖格索引取代。每格 sourceRect 是原圖像素；sizeRatio 是相對整塊田 bounds 的寬高，anchor 是相對中心。按 layerZ=1.5 畫在植株之上、角色之下，blendMode=source-over。clipToFieldCells 表示裁切至田地實際格子的聯集，讓 L/T 等不規則田地不掃到外部空格；素材試驗室範例為六格矩形田。波紋共用 scan 時鐘，暫停與減少動態設定同時生效，沒有獨立 CSS 動畫。

工作動作保持正面，範圍波紋不依朝向旋轉。既有持物試驗流程維持不變，素材試驗室空手時可展示掃描。這份 scan clip 的物件數據為空手，不可直接覆蓋持物 cargo 的可見性；遊戲要在持物時掃描，可保留 carryIdle 並只採用獨立 effect 的播放數據。

本次僅交付素材、試驗室與共用播放數據；感測積木觸發、判讀這整塊田的狀態、實際遊戲動畫接線由 Claude 負責。game.html、game/、vendor/ 未修改。


## v0.11 天線收納與頭頂雷達

依使用者選擇 A，掃描改成頭頂機構，雙手全程空手垂放。新增 robot-area-scan-v02.png（1774 × 887 RGBA，四欄兩列），保留 v01 手持感測器舊圖。八個來源格依序為天線升起、天線下降、頂蓋開啟、雷達升起、雷達轉向、雷達回掃、雷達收回、天線復位；以深青綠碟面、薄荷亮部與黃銅饋源維持原色系。雷達出現時原天線已完全縮入機殼。

manifest.animationClips.scan 沿用名稱與原有欄位結構，poseRows 改採新增 row 14；逐格 alignmentPath 指向新增 spriteAlignment.scanRadar，原 scan 校準與 row 13 保留。外殼大小固定，以機殼中心對位，不按雷達或天線外框縮放。圖集第二列由 y=490 起，禁止直接二等分高度。

scan 的 12 步 frameOrder 為 0/1/2/3/4/5/4/5/6/2/1/7；frameDurationsMs 為 120/140/100/160/180/180/180/180/140/100/140/120，合計 1740 ms，loop=false，完成後 idle。objects 明列每步的天線／雷達可見性與頭頂機構狀態；它們已畫在角色來源格裡，無須再額外疊畫。areaScanWave 沿用獨立 scan-wave-v01.png，frameIndexByStep／opacityByStep 更新為 12 步，只在第 5–8 步（索引 4–7，雷達轉動時）播放原四格波紋；原來源框、尺寸、定位、圖層與裁切規則保留。

素材試驗室照同一份數據播放，八格角色展示以兩列呈現。遊戲觸發與狀態偵測仍由 Claude 負責。內建 image_gen 完整提示詞與來源記錄於 prompts-v11.json。


## v0.12 判斷燈號

新增 robot-decision-v01.png（1254 × 1254 RGBA，二欄二列）。四格依閱讀順序為左紅右綠、左綠右紅、雙綠、雙紅，左右以觀看者為準。維持方形 LED、奶油白機殼、黃銅天線與空手垂放姿勢；亮燈以硬邊色塊呈現，不加模糊光暈。圖集原樣保存，機殼中心按 spriteAlignment.decision 校準；rendering.robotPoses 新增 row 15，原資料與素材保留。

playback.decisionClips 指定 thinking、true、false 三種 clip，供 Claude 依外部判斷結果選用。animationClips.decisionThinking 的 frameOrder=0/1，每步 300 ms、loop=true，持續左右交換紅綠直到外部切換。decisionTrue 使用圖格 2、decisionFalse 使用圖格 3，均穩定亮燈 1000 ms、loop=false、onComplete=idle。objects 提供逐步 eyeLeft、eyeRight 與 decisionResult，null 表示尚無結果，true/false 表示外部已提供的狀態；不是在素材程式內計算條件。每步的 cargoVisible、sourcePlantVisible、cargoPose 也明列。三種 clip 不啟動掃描波紋，與雷達掃描獨立。

素材試驗室動作按鈕由 playback.actionClips/actionLabels 建立，新增「判斷中／判斷成立／判斷不成立」，手動選擇結果而不自動抽取或判讀田地。暫停與減少動態設定沿用共用播放器。角色圖集為正面空手姿勢，遊戲若需持物時判斷，不能直接用空手 clip 隱藏既有 cargo；可另外設計持物眼燈疊加。感測條件、成立與否、觸發時機均由 Claude 的遊戲邏輯負責；game.html、game/、vendor/ 未修改。內建 image_gen 完整提示詞保存於 prompts-v12.json。


## v0.13 機器人頭頂想法泡泡

新增 robot-thought-bubbles-v01.png（1774 × 887 RGBA），四欄二列。首列是三個方點依序跳動與停留的四格思考動畫；第二列依序為綠勾、紅叉、澆水壺、三顆種子。奶油白雲狀泡泡加兩個往左下方延伸的小圓泡，採深青綠輪廓、左上光源、硬邊像素；沒有尖角對話框尾巴，也沒有把角色畫入圖集。內建 image_gen 完整提示詞與原始來源保存於 prompts-v13.json。

manifest.thoughtBubbles 完整提供 atlas、400 × 340 共用畫布、每格 sourceRect／destinationRect、動畫 frameOrder／frameDurationsMs／loop、byClip 動作對應、placement 比例定位與 layerZ。思考四格各 180 ms、720 ms 循環；勾叉各 1000 ms 不循環，維持最後一格直到角色 clip 結束；水壺與種子為單格循環。byClip 將 decisionThinking/decisionTrue/decisionFalse/water/sow 分別對應 thinking/true/false/watering/sowing，其餘狀態隱藏泡泡。判斷眼燈每 300 ms 交替的舊規則保留，泡泡三點以獨立 elapsed-time cursor 在同一 render clock 中更新，不可拿眼燈或角色圖格編號直接當泡泡動畫索引。

placement.relativeTo=robotCanvas：泡泡畫布左下角固定在角色畫布 leftRatio/bottomRatio 指定位置，寬度為 widthRatio，依原畫布比例決定高度；layerZ=4 在角色與貨物上方，followPoseBob=true 跟隨當格 bob。泡泡放在頭頂偏右上方，不遮臉；目前持物與雷達 clip 沒有泡泡對應，避免和頭頂貨物／雷達重疊。保留原有 rendering.layerOrder 與全部舊素材／alignment 資料。

clock 明列每次進入或重播動作歸零、與角色一起暫停、非循環到尾格後維持、無對應 clip 隱藏。離開判斷結果回到 idle 時泡泡立即隱藏，切換為澆水或播種時立即更換內容。素材試驗室提供八格樣本與隨動作顯示的泡泡；沒有條件判斷、生長、資源、商店或存檔邏輯。Claude 只需讀 manifest 與 alignment，即可接入遊戲；本次未修改 game.html、game/、vendor/。


## 主畫面靜態素材 v01（試驗室 v0.14）

新增 greenhouse-strip-v01.png、stone-floor-tile-v01.png、plot-signs-v01.png、token-icon-v01.png、money-icon-v01.png，均由內建 image_gen 生成，保留 RGBA 透明背景、深青綠輪廓、硬邊像素造型與左上光源。完整提示詞及石板缺口修正記錄於 prompts-v14.json。生成圖仍有少量色階變化，未宣稱為嚴格三色索引圖。五張新圖保存原始生成輸出，全部舊圖未覆蓋。

本次 manifest 僅新增 mainScreenAssets 根欄位，既有欄位與根 version=0.13 完全保留。新欄位 items 收錄八個可用項目（窗框、石板、四種木牌、兩圖示），每項都有 file、imageSize、sourceRect、repeat、recommendedDisplaySize、layer、animated=false。沒有新增動畫或遊戲規則。

窗框原圖 2172 × 724，來源單元 [768,112,640,500] 從窗柱中央取樣，repeat.x=true/y=false，單元與步進均 640 × 500 原圖像素；建議顯示 160 × 125。只能重複 sourceRect，不可把整張 PNG 含外圍透明留白直接鋪排。接縫兩列像素平均通道差約 0.71/255，為視覺連續接合，非逐位元完全相同的週期貼圖。

石板原圖 1254 × 1254，來源單元 [112,120,1030,1030]；repeat.x/y 都為 true，單元與步進 1030 × 1030，建議顯示 64 × 64。四條邊 alpha 全為 0，保留極窄透明留縫；下層可用 mainScreenAssets.lab.groutColor 或遊戲自己的地面底色。石面內部完整，未使用第一版有缺口的生成圖。

木牌圖集 1254 × 1254，四種 sourceRect 分別校準，閱讀順序為新手／進階／高級／專家。typeColor 分別精確記錄 #d7a44b、#75bdd0、#8fc7a3、#c65f48，作為類型色與遊戲 UI 配色；原 PNG 保留生成的三階明暗色差。textRect=[99,163,380,110] 是相對各 sourceRect 左上角的原圖像素，不是全圖絕對座標，也不是顯示像素。疊字時與圖片套用同一縮放和平移；textStyle 指定置中、垂直置中與字級上限。groundAnchor 是相對來源框的木樁插入點。建議在 160 × 140 顯示盒中等比例 contain。名牌圖內完全無字，試驗室勾選框僅在 canvas 上疊字與框線示例。

Token 為薄荷／青綠多邊形閃電代幣，金錢為黃銅色圓幣，皆單獨透明 PNG，sourceRect 去掉外圍多餘留白。建議 32 × 32 邏輯像素、contain 等比例顯示。圖內沒有字母、數字或貨幣字號；顏色與輪廓皆可區分兩種資源。這批只提供視覺素材，不加入 Token 成本或經濟計算。

素材試驗室新增窗框四格連續預覽、石板六欄四列鋪排、四種名牌與可切換 textRect 疊字、兩個 32px 圖示。遊戲頁面與 game/、vendor/、alignment.js 未修改；Claude 可直接讀 mainScreenAssets 數據接入主畫面。


## v0.15 山谷農田與輕微俯角

使用者選擇山谷農田、輕微俯角，並授權往後依命名慣例直接新增素材檔名／路徑，無須逐次詢問；AGENTS.md 已記錄，既有資料結構與檔案保護規則保留。

新增 mountain-backdrop-v01.png、forest-edge-v01.png、grass-ground-tile-v01.png、soil-front-edges-v01.png，原樣保存內建 image_gen 的選定 RGBA 輸出。前兩張分層組成遠山與林緣，中央留出山谷視野；草地是稀疏透明草叢，需疊在 manifest 指定底色。前緣最初兩版有背景／柔光，不採用；選定四條矩形土面版本，以 sourceRect 只取實心條帶，排除邊緣生成雜點。提示詞與來源在 prompts-v15.json。

manifest 僅新增 valleyFarm，保留原始 version 與所有舊欄位。assets 列出四份檔案的尺寸與來源框；environment 的 rect 是相對 viewport 的比例、z 是背景內部順序。projection 的 slight 田面為 64 × 48、前緣 4px，topDown 比較為 64 × 64、前緣 0；這是 v0.15 的舊比較視角（無旋轉、無 X 斜切），不是對新場景的限制；目前斜角使用上方 v0.18 視角章節與新增 valleyScene 數據。gridToScreen／screenToGrid 定義前後向投影與反算，裝飾前緣不算入格子點擊範圍。不要對整個場景做 CSS scaleY 或 rotateX，否則角色與像素也會壓扁。

terrain.frontNeighbor=[0,1]，所有田區佔用格子的聯集內只要正南方有鄰格，就不畫該格土面前緣；跨田區邊界同樣檢查。田面沿同一格線接續，不加每格空隙或圓角。uprightSprites 提供植株、機器人與名牌尺寸及落地錨點；它們維持原圖比例。機器人整組包含貨物與想法泡泡，不可單獨再壓縮。depthOrder 依 projected groundY、groundX、kindOrder 全域排序，不按田區分組排序，讓前排植物能遮住後排角色。

主要預覽提供 L/T/O 田形、六種作物、兩個靜態機器人與名牌，以及俯角／原俯視、四種含水外觀切換。角色動作工作台、舊溫室與通用素材放入展開區塊，全部功能保留。此預覽沒有生長或其他遊戲機制；遊戲投影、拖曳、點擊反算、移動呈現及最終遮擋接線由 Claude 負責，本次未改遊戲檔。

## v0.16 科技農舍

新增 assets/farmhouse-tech-v01.png：奶油白牆、深青綠斜屋頂、木門、青藍太陽能板與黃銅感測天線，沿用左上光源、硬邊像素與暖色山居風格。使用內建 image_gen 生成並原樣保留 RGBA，提示詞與選定來源保存於 prompts-v16.json。保留原始生成色階，不宣稱已量化為嚴格三色索引圖。

manifest 僅新增 valleyFarm.assets.farmhouse、depthOrder.kindOrder.building、preview.props／propPositionSpace。sourceRect 為全圖來源框，groundAnchor 是相對來源框左上角的入口落地點，recommendedDisplaySize 為 contain 等比顯示盒。農舍與其他直立素材共用 groundY／groundX／kindOrder 排序，不隨俯視切換壓扁。preview.props 的落地位置以 960×600 示範畫布像素表示，遊戲可自行選擇位置後沿用來源框與錨點。

農舍為單張靜態素材，animated=false，沒有新增門、燈、面板動畫或遊戲機制。遊戲本體與 alignment.js 未修改；Claude 由 manifest 接入。

## v0.17 木樁與繩索界線

新增 land-boundary-atlas-v01.png（2172×724 RGBA）：三個獨立零件為木樁、橫繩、直繩。內建 image_gen 生成，原圖透明背景與像素保留，提示詞在 prompts-v17.json。來源框依實際生成圖校準，不可三等分直接當內容框。木樁等比顯示約 5×16px，繩索厚 3px，架高 11px；低矮窄輪廓避免大面積遮田，未宣稱已作嚴格色票量化。

manifest 只新增 landBoundary，包含 atlas／parts、geometry.sides、placement、depthOrder、lab。以同一個範圍的整數田格聯集判斷四方鄰格，只輸出沒有鄰格的外露邊；內邊刪除、端點用整數頂點去重，每個外緣頂點一根樁，T／L 凹角、分離區塊、內洞邊同樣處理。擴地後由遊戲提供更新的範圍格集合再重建顯示；擴地條件、價格、碰撞與存檔由 Claude 負責。

橫繩與直繩分別使用獨立來源框，不旋轉木樁。endpointRatios 對應兩端接點；端點沿格線投影再上移 ropeElevation，只有繩索長軸隨格寬／格深伸展，厚度與木樁高度固定。木樁依 groundAnchor 落地；繩索使用未上移的線段中點排序，木樁使用原頂點排序，與作物、角色、名牌共用 groundY／groundX／kindOrder，全組不得一律蓋在作物上方。後方細繩可被前排作物遮住。無新增動畫。

試驗室新增主山谷邊界開關、T／L／I／O 帶作物拼接預覽。它是範圍呈現範例，不是擴地機制；game.html、play.html、game/、vendor/、alignment.js 均不修改。

## v0.18 森林山谷斜角場景素材

新增五張 PNG：foreground-forest-atlas-v02.png（左／右／下三組框邊樹叢）、valley-lake-backdrop-v02.png（山與湖）、sky-cloud-strip-v02.png（天空與硬邊雲帶）、valley-path-atlas-v02.png（泥土紋理與踏腳石）、valley-props-atlas-v02.png（作物木箱、燈籠柱、石頭、花叢、木頭堆、水桶、小工作棚）。皆由內建 image_gen 生成，完整提示詞與來源見 docs/prompts-v18.json。使用者於 2026-10-17 授權另製精簡遊戲版：原始 1536×1024 圖以最近鄰縮小為 768×512，Alpha >=128 轉為255，其餘轉為0，再不抖色限色為 8–48 色。原始生成圖保留於 generated_images 與本對話 outputs/valley-scene-originals，供比對；遊戲只載入精簡 v02，不覆蓋任何既有素材。

manifest 只新增 valleyScene 根欄位，十四個 assets 項目各自列出 file、sourceRect、groundAnchor、footprint、recommendedDisplaySize、layer。來源框以實際圖像量測，不能將裝飾圖集四等分：工作棚屋頂超出名義格線。groundAnchor 相對來源框左上角，等比 contain 時與圖片套相同縮放；footprint 是美術占格建議，不是碰撞或購地規則。背景與框邊占格 [0,0]，依 viewportRect 定位。前景另列 edge、viewportRatio 和貼齊側。

泥土步道是共用底色 #b29163 加透明紋理，先填滿 64×64，再把紋理畫進 destinationRect=[2,2,60,60]；外圈只保留底色，使四邊相鄰接續一致。踏腳石使用相同內縮框疊在泥土或草地上，並跟著整片地面投影，與直立石頭不同。試驗室提供 3×3 拼接檢視；不宣稱原始生成紋理本身已是逐像素週期貼圖。

五張遊戲用 PNG 皆為 768×512、全透明／全不透明兩種 Alpha。大小依序為 74,327／48,547／14,326／13,996／49,318 bytes，總計 200,514 bytes；每張都小於 500KB，長邊亦小於 2048px。前景／遠景／天空／步道／小物分別限制為 32／32／8／16／48 個不透明色，不宣稱是逐物件手工三階明暗清稿。實際尺寸、大小與處理方法記錄在 valleyScene.performance 與 prompts-v18.json。所有新增素材 animated=false；沒有水波、樹搖或燈籠閃爍。靜態播放規則放在 valleyScene.rendering.animation；既有角色動畫與 alignment 數據完整保留。

試驗室新增獨立 game 斜角預覽與前景／裝飾／格線開關，原 slight 與 topDown 不變。預覽用原版作物、機器人、農舍與名牌檢查落點、比例及遮擋；沒有加入遊戲機制。本次不修改 game.html、play.html、game/、vendor/ 或 alignment.js。


## v0.19 山谷主畫面構圖

以使用者提供的山谷農場參考圖調整素材試驗室：右後方放大農舍，五個矩形種植區占據前半部，中景日照闊葉樹／針葉樹群包住不規則空地，中央保留遠湖視線。新增 meadow-ground-tile-v01.png（512×512／16色）及 valley-midground-trees-v01.png（768×512／48色）；由內建 image_gen 生成，沿用已授權最近鄰縮圖、Alpha 128 閾值與無抖色量化。提示詞見 prompts-v19.json。草地在方形內不透明；樹群輪廓外透明。草地採交替水平／垂直鏡像鋪排，避免依賴原圖的週期接縫。

manifest.valleyScene.composition 保存構圖畫布、投影原點、草地裁切多邊形、材質重複尺度、步道折線、五區田格、植株偏移、裝飾落點、框邊範圍與靜態角色尺寸。這是可拆分素材合成的美術示範，不是將整張概念圖當遊戲底圖。原 game 視角與 slight 完整保留；新構圖只另用自己的原點。田面仍先旋轉18°再縮放Y至0.625，田格64×40，土壁13px。直立物按落地點全域排序，繩索端點隨地面投影、木樁保持站直。

所有新素材與此構圖均為靜態，frameOrder=[0]、loop=false、clock=none，無樹搖／燈光／水波動畫；現有角色動畫資料不變。原田格測試可用勾選框切回。未修改遊戲本體，尚需由 Claude 依 manifest 接入。現有作物與農舍繼續使用，與參考插畫的精細度、密度仍有差異。


## v0.20 農舍視角與自然過渡重製

依使用者要求縮小機器人並重製部分遊戲貼圖。新增 farmhouse-angled-v01.png（768×588、54,386 bytes）與 valley-transition-atlas-v01.png（768×512、56,664 bytes），使用內建 image_gen，完整提示詞與來源見 prompts-v20.json。兩張均沿用授權的最近鄰縮小、Alpha>=128 二值化與無抖色限色；48色農舍、32色過渡圖集。原始生成另保留，舊檔不覆蓋。

農舍直接重畫斜向正面基座、可見屋頂與側牆、右側薪柴棚；垂直柱仍站直，不旋轉或壓扁整張圖片。groundAnchor 校準到門前台階落地處。建築是繪製的三分之四視角，側牆與屋頂仍有美術透視近似，不宣稱是數學精準的三維投影；footprint 為建議占格，不能當精確碰撞範圍。

四項過渡素材共用一張圖集：forestUnderstory／flowerUnderstory 為直立低灌木，納入全場落點排序；grassTransition／pathTransition 為俯視草土碎片，依 groundDecals 的邏輯格落點與大小鋪設後，隨地面統一旋轉18°、縮放Y。這兩種是透明邊緣貼花，非單獨無縫地磚，不可當完全填滿的基底使用。

新增 valleyScene.compositionV20，保留 composition 及所有既有資料。staticRobot.canvasSize=116，相較前版160縮小27.5%，centerOffset=[0,-22]，沿用idle第一格與alignment定位；frameOrder=[0]、loop=false、clock=none。本場景不新增角色動畫；其他工作台既有動畫資料完整保留。所有新素材 animated=false。

試驗室預設顯示新構圖，可勾「比較上一版構圖」或「切換原田格測試」。最大寬度960px避免放大像素；地面、土壁、直立物與框邊順序不變。本批只修改素材／manifest／試驗室，遊戲本體由 Claude 接入。


## v0.21 擴地世界規劃與俯視地圖

唯讀分析 game/config.js／plots.js／sim.js／play.js／render.js／valley.js／session.js：目前盤面12×7，開局中央5×3，購地一次一格且四鄰相接。田塊的局部座標與腳本不隨排列旋轉改變；田塊不互相連通，也無場景道路尋路。安排模式換成96×96方格，不會暫停模擬；普通畫面目前只有96×60壓扁，尚未使用18°旋轉。不要把試驗室的五區展示田當成遊戲開局資料。

新增 farmWorld 根欄位，完整保留全部既有 manifest 數據。board 保留84格，不設內部永久道路／建築禁用格。expansion.phases建議15→35→70→84格，僅空間引導，不新增遊戲門檻；額外69格的建議購地順序與現行價格都記錄成資料，總價22,612。以原遊戲canBuyLand／buyLand逐次驗證通過。後段價格漲幅大，是否調平衡由Claude機制層另議，本次不改動價格。

valley-overhead-map-v01.png由內建image_gen生成後修正成完全俯視：屋頂取代可見立面、樹冠朝上，北側湖岸與農舍、道路走盤面外，中心留空草地。完整提示詞及兩輪來源見prompts-v21.json。使用已授權的最近鄰縮放至1280×1280、Alpha128閾值與無抖色48色限色，檔案365,353 bytes；量化後再次將色盤Alpha二值化，避免出現254的近不透明項。外輪廓外透明、84格範圍全不透明。原始生成保留供比對。

最終盤面校準為boardOrigin=[224,576]，每格64×64，boardRect=[224,576,768,448]，確保全部84格在純草地上。零起算x向東、y向南；PNG不畫格線、購地狀態、田塊、作物、角色或文字。地圖中的樹、農舍與路是靜態背景；遊戲必須依state.land與state.layout另外疊加。圖片本身不是碰撞／購地資料。斜角與俯視沿用同一份世界格座標，只切換投影；俯視使用屋頂圖，不把斜角農舍壓扁。

試驗室新增純圖／四階段範圍、格線與開局直線田的唯讀預覽。所有圖、規劃與切換均為靜態，frameOrder=[0]、loop=false、clock=none、transitionMs=0，既有角色動畫完整保留。遊戲載圖器目前不會自動讀farmWorld或valleyScene，需要Claude接入載入器、鏡頭與滑鼠反算；不得聲稱遊戲已整合。game/、game.html、play.html、alignment.js未修改。


## v0.22 半尺寸圖集、資源小圖示與當機動作

使用者於2026-10-17轉交Claude的明確需求，授權換用新版素材路徑並調整manifest與alignment既有像素數值。17張指定機器人／作物／土壤／收成／泡泡／波紋圖以最近鄰精確縮為50%，命名保留原版號再加-half.png；舊原圖不改。奇數邊長先在右／下補一透明像素再2:1縮小，因此1774×887成887×444，但來源座標仍統一除2，保留.5等小數，不逐格取整造成漂移。舊圖不額外限色或二值化，以保留原有像素及透明度；PNG使用無損壓縮。Token／金錢另出256×256的v02.png，顯示仍32px（遊戲可用40px）。

必須區分來源與顯示座標：sourceRect、pixelBoundaries、圖集列欄邊界、作物局部root、alignment的original／harvest／hover／carry.shells／carry.hands／scan／scanRadar／decision／cropRoots縮半；作物frames.scale乘2。alignment.canvas=416、bodyCenter=[208,208]、bodyHeight=124、bob、renderCanvas／renderDestination、plantCanvas／plantRoot、produce.canvas、soilVariants.canvas／destinationRect、thoughtBubbles.canvas／destinationRect及所有顯示比例完整保留。泡泡只縮sourceRect，不能把目的框也縮小。

指定19張圖（含資源圖示）合計13,207,006→3,524,574 bytes；每張新圖最大412,638 bytes。依Claude目前game/render.js載圖清單，全部遊戲圖片14,984,574→5,487,295 bytes（已含新增185,153 bytes當機圖），減少63.38%；這不含程式、HTTP壓縮、網路延遲或快取，不能當實際載入秒數。所有對照與原始檔不進遊戲載圖清單。

新增robot-stuck-v01-half.png，627×627；由內建image_gen生成四格後縮半、Alpha128清理。四格維持同機殼高度，雙臂垂下、雙紅眼明暗交替、右上硬邊像素煙，不含作物／工具／文字／場景。rendering.robotPoses[16]與alignment.stuck逐格校準。animationClips.stuck順序[0,1,2,3]，時長[300,260,300,260]ms、總1120ms、loop=true；不自動復原。playback.statusClips.stuck為接線名稱，lifecycle記錄robot.phase==='stuck'進入，狀態離開後停止並回idle；時間進入／重播歸零、跟隨共用暫停。objects.cargoVisible皆false、sourcePlantVisible皆true，僅呈現空手當機，不清除遊戲資料。

thoughtBubbles.byClip.stuck='error'，error使用既有紅叉frame5、1000ms循環，直到片段離開。重用泡泡圖，不新增下載。素材試驗室頂部提供當機／重置示範，工作台也新增當機循環；遊戲端robot.phase分派及移除舊「！當機」標籤仍由Claude負責。其他未設計的新動作與田格狀態未製作。

新增assetOptimization根欄位記錄檔案、縮放例外、下載量與對照設定。舊版資料存assets/manifest-reference-v21.json和alignment-reference-v21.json，按「載入舊版對照」才讀取；下拉可檢查所有指定19張的來源格。並排採相同目的尺寸與手掌錨點。使用實際game/render.js的createPainter驗證176組機器人影格／朝向（含持物及48組泡泡）、24作物、4土壤、6收成與12掃描步驟：繪製目的框精確相等。原圖SHA256不變，目的畫布完整保留。

chatgpt handoff.md刪除已取消GAME_EVENTS文件清單，事件規格以game/sim.js檔頭為準。舊valleyFarm、環境圖與名牌保留供試驗室或game.html，未重製。game/、game.html、play.html、vendor/未修改；Claude若沿用舊alignment.js?v=13快取，接入時應更新頁面資源版本或重新驗證快取。
