# Blockly 12.5.1（隨 repo 附帶）

- 來源：npm `blockly@12.5.1`（https://registry.npmjs.org/blockly/-/blockly-12.5.1.tgz）
- tarball sha1：`5e63b65382861cc75a6a36a85d71346ea768f8e8`（已與 npm registry 公布值核對）
- 授權：Apache-2.0，https://github.com/google/blockly/blob/master/LICENSE
- 取用：`blockly_compressed.js`（核心）、`blocks_compressed.js`（內建積木，只用到函式 procedures_*）、`msg/zh-hant.js`（繁中介面）、`media/`（游標、音效、圖示）
- 沒有取用程式碼產生器：其餘遊戲積木全部自訂，執行走自己的直譯器。

升級方式：下載新版 tarball，核對 sha1，替換上述四項，並更新本檔版本號。
`inject` 時必須設定 `media: 'vendor/blockly/media/'`，否則 Blockly 會預設從 CDN 抓圖示。
