# 浮葉農場：素材互動測試 v0.4.1

[直接開啟互動展示](https://peicheng0413.github.io/robot-farm/)

直接用瀏覽器開啟 `index.html`，不需安裝套件。或在此目錄執行 `python3 -m http.server 8765 --bind 127.0.0.1`，開啟 http://127.0.0.1:8765。

- 點田區，按「採收」：機器人伸手、抬起作物，最後舉到頭頂。
- 一次只持有一個。攜帶中可以移動，先按「放下作物」才能再次採收、播種或澆水。
- 作物是獨立圖層，機器人的四格採收圖均為空手。三張收成 PNG 同時用在頭頂與商店展示區。
- 放下會恢復原田區素材，便於反覆測試。這是互動展示，沒有生長計時、資源收益、成熟度判定或商店買賣。
- 可暫停動畫；系統減少動態設定會預設暫停，按播放可繼續。

素材：`assets/robot-harvest-empty-v02.png`、`assets/produce-carrot-v01.png`、`assets/produce-tomato-v01.png`、`assets/produce-lettuce-v01.png`。

風格規範：`docs/STYLE_GUIDE.md`。新提示詞：`docs/prompts-v02.json`。圖集、持物與取樣配置：`assets/manifest.json`。

舊機器人圖集仍保留供漂浮、播種、澆水使用；第四列含作物的舊採收圖已停用。生成素材仍屬概念美術，正式匯入引擎前可再做像素與對位清稿。

## 轉向與移動

左轉／右轉以機器人自身為準，每次 90°。「向前一格」依目前朝向移動；點田區則先橫向再縱向移動，途中使用對應方向圖。到達後恢復正面工作姿勢。可暫停移動。四方向素材：`assets/robot-directions-v03.png`，生成提示詞：`docs/prompts-v03.json`。

## 四向漂浮更新

南向已改為正對觀者的對稱視角；南、西、北、東各有四格漂浮動畫。新的圖集為 `assets/robot-hover-directions-v04.png`，提示詞為 `docs/prompts-v04.json`。轉向後與移動中持續播放該方向動畫。

待命已恢復原版漂浮；正南四格僅用於朝南移動及轉向預覽，抵達後回到原版待命。
