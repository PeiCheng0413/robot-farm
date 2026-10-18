# class-pass（網頁端）

- 來源：https://github.com/PeiCheng0413/class-pass 的 `web/`，commit `1fa1a42`
- `classpass.js`：sha1 `5b25093c3e328ea6814df8181485b945ea50d18d`（協定 CP2，見該 repo 的 docs/PROTOCOL.md）
- `vendor/qrcode.js`：qrcode-generator 1.4.4（MIT），sha1 `4c79be1679603ef9691b98a90617aa1e534e93ef`。classpass.js 會從同一層的 `vendor/` 自動載入它。
- 用途：練習頁（practice.html）選關畫面的「出示過關 QR code」，讓老師用 class-pass app 掃描收成績。
- 更新方式：整個 `web/classpass.js` 與 `web/vendor/qrcode.js` 複製過來，更新這份 README 的 commit 與 sha1。
