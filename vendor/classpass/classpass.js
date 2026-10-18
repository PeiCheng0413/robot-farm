/*
 * classpass.js — 小遊戲過關 QR code（協定見 docs/PROTOCOL.md）
 *
 * 用法：
 *   <script src="classpass.js"></script>          （vendor/qrcode.js 會自動從同一層載入）
 *   // 最後一次交出所有關卡（一堂課掃一次）
 *   ClassPass.show({ game: 'robot-farm-practice', levels: [
 *     { level: 'check-dry', title: '澆水', score: 3, max: 3 },
 *     { level: 'harvest', title: '收成', score: 4, max: 5 },
 *   ]});
 *   // 或每過一關呼叫一次，各關會自動累積在同一張 QR code 裡
 *   ClassPass.show({ game: 'robot-farm-practice', level: 'check-dry', title: '澆水', score: 3, max: 3 });
 *   ClassPass.showPassed('robot-farm-practice');   // 再叫出這個遊戲的 QR code
 *   ClassPass.editStudent();                       // 修改班級、座號
 *
 * 一個學生、一個遊戲只有一張 QR code，裡面裝所有已過關的關卡。
 * 學生資料與過關紀錄存在 localStorage，同一個網域的小遊戲共用；
 * 過關紀錄按「班級＋座號」分開存，電腦教室換人用時不會混在一起。
 */
(function () {
  'use strict';

  var VERSION = 'CP1';
  var KEY = '7wtYq6EDHQJxEa6gbWgOLRac-2bzsmJv';
  var STUDENT_KEY = 'classpass.student';
  var PASSES_KEY = 'classpass.passes';
  var CODE_RE = /^[A-Za-z0-9-]{1,40}$/;
  var CLASS_MAX = 20;
  var TITLE_MAX = 10;
  var LEVELS_MAX = 30;

  var scriptSrc = document.currentScript && document.currentScript.src;

  // ---------- 儲存 ----------

  function load(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // 無痕模式等情況存不了，就只在這次頁面有效
    }
  }

  // ---------- 清理（PROTOCOL.md「文字欄位的清理」）----------

  function cleanText(s, max) {
    return Array.from(String(s == null ? '' : s)
      .normalize('NFC')
      .replace(/[|;~\u0000-\u001f\u007f]/g, '')
      .trim())
      .slice(0, max).join('')
      .trim();
  }

  // 座號：接受全形數字與前導零，轉成 1–999 的整數字串；不合法回傳 ''
  function cleanSeat(s) {
    var t = String(s == null ? '' : s).trim().replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48);
    });
    if (!/^[0-9]{1,4}$/.test(t)) return '';
    var n = parseInt(t, 10);
    return n >= 1 && n <= 999 ? String(n) : '';
  }

  function getStudent() {
    var s = load(STUDENT_KEY, null);
    if (!s) return null;
    s = { cls: cleanText(s.cls, CLASS_MAX), no: cleanSeat(s.no) };
    return s.cls && s.no ? s : null;
  }

  function studentId(s) {
    return s.cls + '|' + s.no;
  }

  // ---------- 簽章 ----------

  function base64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  var keyPromise = null;
  function hmacKey() {
    if (!keyPromise) {
      if (!(window.crypto && crypto.subtle)) {
        return Promise.reject(new Error('這個瀏覽器不支援 Web Crypto（網址要是 https）'));
      }
      keyPromise = crypto.subtle.importKey(
        'raw', new TextEncoder().encode(KEY),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    }
    return keyPromise;
  }

  function signBody(body) {
    return hmacKey().then(function (k) {
      return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body));
    }).then(function (mac) {
      return base64url(new Uint8Array(mac)).slice(0, 16);
    });
  }

  function checkLevel(r) {
    if (!CODE_RE.test(r.level)) throw new Error('關卡代號只能用英數字與 -：' + r.level);
    [['分數', r.score], ['滿分', r.max], ['完成時間', r.time]].forEach(function (p) {
      if (!Number.isSafeInteger(p[1]) || p[1] < 0) throw new Error(p[0] + '要是 0 以上的整數：' + p[1]);
    });
    if (r.max < 1 || r.score > r.max) throw new Error('分數要介於 0 和滿分之間');
  }

  // 組出 QR code 內容。
  //   game: 遊戲代號；s: { cls, no }；
  //   levels: [{ level, title, score, max, time }, ...]
  function build(game, s, levels) {
    try {
      if (!CODE_RE.test(game)) throw new Error('遊戲代號只能用英數字與 -：' + game);
      var cls = cleanText(s.cls, CLASS_MAX);
      var no = cleanSeat(s.no);
      if (!cls || !no) throw new Error('班級不可空白，座號要是 1–999 的數字');
      if (!levels.length || levels.length > LEVELS_MAX) throw new Error('關卡數要介於 1 和 ' + LEVELS_MAX);
      var seen = {};
      var list = levels.map(function (r) {
        checkLevel(r);
        if (seen[r.level]) throw new Error('關卡代號重複：' + r.level);
        seen[r.level] = true;
        var title = cleanText(r.title, TITLE_MAX) || r.level.slice(0, TITLE_MAX);
        return [r.level, title, r.score, r.max, r.time].join('~');
      }).join(';');
      var body = [VERSION, game, cls, no, list].join('|') + '|';
    } catch (err) {
      return Promise.reject(err);
    }
    return signBody(body).then(function (sig) { return body + sig; });
  }

  // ---------- 過關紀錄 ----------
  // localStorage 結構：{ "班級|座號": { 遊戲代號: { 關卡代號: { level, title, score, max, time } } } }

  // 這個學生在這個遊戲已過關的關卡，依完成時間排序
  function passed(game, s) {
    s = s || getStudent();
    if (!s) return [];
    var levels = ((load(PASSES_KEY, {})[studentId(s)] || {})[game]) || {};
    return Object.keys(levels).map(function (k) { return levels[k]; })
      .sort(function (a, b) { return a.time - b.time; });
  }

  // 這個學生玩過的遊戲代號
  function games(s) {
    s = s || getStudent();
    return s ? Object.keys(load(PASSES_KEY, {})[studentId(s)] || {}) : [];
  }

  // 記下一關成績，同一關只留最好的（分數高者勝；同分留較早的）。回傳之前的最佳紀錄。
  function record(game, s, rec) {
    var all = load(PASSES_KEY, {});
    var mine = all[studentId(s)] = all[studentId(s)] || {};
    var levels = mine[game] = mine[game] || {};
    var old = levels[rec.level];
    if (!old || old.max !== rec.max || rec.score > old.score) {
      levels[rec.level] = rec;
    } else if (rec.title) {
      old.title = rec.title;
    }
    save(PASSES_KEY, all);
    return old;
  }

  // ---------- QR code ----------

  var qrLoading = null;
  function loadQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLoading) {
      qrLoading = new Promise(function (resolve, reject) {
        var el = document.createElement('script');
        el.src = new URL('vendor/qrcode.js', scriptSrc || location.href).href;
        el.onload = function () { resolve(window.qrcode); };
        el.onerror = function () { qrLoading = null; reject(new Error('載入 vendor/qrcode.js 失敗')); };
        document.head.appendChild(el);
      });
    }
    return qrLoading;
  }

  function qrSvg(text) {
    var qrcode = window.qrcode;
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    var qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  }

  // ---------- 畫面 ----------

  var CSS = [
    '.cp-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);',
    'display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;',
    'font-family:-apple-system,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}',
    '.cp-card{background:#fff;color:#111;border-radius:16px;padding:24px;width:min(640px,100%);',
    'max-height:100%;overflow:auto;box-sizing:border-box;font-size:22px;line-height:1.5}',
    '.cp-card h2{margin:0 0 12px;font-size:28px}',
    '.cp-card p{margin:8px 0}',
    '.cp-body{display:flex;gap:20px;align-items:center;flex-wrap:wrap;justify-content:center}',
    '.cp-qr{flex:0 1 auto;width:min(100%,56vh,340px)}',
    '.cp-qr svg{display:block;width:100%;height:auto}',
    '.cp-info{flex:1 1 200px;min-width:0}',
    '.cp-who{font-size:30px;font-weight:700;margin:0 0 8px}',
    '.cp-levels{list-style:none;padding:0;margin:0}',
    '.cp-levels li{display:flex;justify-content:space-between;gap:12px;padding:4px 0;',
    'border-bottom:1px solid #d6d3d1}',
    '.cp-levels li.cp-new{font-weight:700}',
    '.cp-stars{color:#b45309;letter-spacing:2px;white-space:nowrap}',
    '.cp-note{color:#333;font-size:19px}',
    '.cp-err{color:#b91c1c;font-weight:700}',
    '.cp-card label{display:block;margin:14px 0 4px;font-weight:700}',
    '.cp-card input{width:100%;box-sizing:border-box;font-size:24px;padding:10px 12px;',
    'border:2px solid #555;border-radius:10px;color:#111;background:#fff}',
    '.cp-card input:focus{outline:3px solid #2563eb;outline-offset:1px}',
    '.cp-row{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;margin-top:20px}',
    '.cp-btn{font-size:22px;padding:12px 22px;border-radius:10px;border:2px solid #111;',
    'background:#fff;color:#111;cursor:pointer;font-family:inherit}',
    '.cp-btn.cp-main{background:#1d4ed8;border-color:#1d4ed8;color:#fff}',
    '.cp-list{list-style:none;padding:0;margin:0}',
    '.cp-list li{margin:8px 0}',
    '.cp-list .cp-btn{width:100%;text-align:left}'
  ].join('');

  function injectCss() {
    if (document.getElementById('cp-style')) return;
    var st = document.createElement('style');
    st.id = 'cp-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 開一個對話框；回傳 { root, card, close }。同時只會有一個。
  var current = null;
  function openDialog(html, onClose) {
    injectCss();
    if (current) current.close();
    var root = document.createElement('div');
    root.className = 'cp-overlay';
    root.innerHTML = '<div class="cp-card" role="dialog" aria-modal="true">' + html + '</div>';
    var prevFocus = document.activeElement;
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!root.parentNode) return;
      root.parentNode.removeChild(root);
      document.removeEventListener('keydown', onKey, true);
      if (current === dlg) current = null;
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      if (onClose) onClose();
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(root);
    var dlg = { root: root, card: root.firstChild, close: close };
    current = dlg;
    return dlg;
  }

  function scoreText(score, max) {
    if (max <= 5) {
      return '<span class="cp-stars" aria-label="' + score + ' / ' + max + ' 星">' +
        '★'.repeat(score) + '☆'.repeat(max - score) + '</span>';
    }
    return '<span>' + score + ' / ' + max + ' 分</span>';
  }

  // 學生資料表單；按「確定」才 resolve，按「取消」reject。
  function editStudent() {
    return new Promise(function (resolve, reject) {
      var s = getStudent() || { cls: '', no: '' };
      var done = false;
      var dlg = openDialog(
        '<h2>請輸入你的班級和座號</h2>' +
        '<p class="cp-note">只要輸入一次，這台電腦的其他小遊戲也會用到。換人使用時記得修改。</p>' +
        '<form>' +
        '<label for="cp-cls">班級</label><input id="cp-cls" name="cls" autocomplete="off" placeholder="例如 701">' +
        '<label for="cp-no">座號</label><input id="cp-no" name="no" inputmode="numeric" autocomplete="off" placeholder="例如 7">' +
        '<p class="cp-err" aria-live="polite"></p>' +
        '<div class="cp-row"><button type="button" class="cp-btn" data-act="cancel">取消</button>' +
        '<button type="submit" class="cp-btn cp-main">確定</button></div>' +
        '</form>',
        function () { if (!done) reject(new Error('cancelled')); });
      var form = dlg.card.querySelector('form');
      var err = dlg.card.querySelector('.cp-err');
      form.cls.value = s.cls;
      form.no.value = s.no;
      dlg.card.querySelector('[data-act=cancel]').onclick = dlg.close;
      form.onsubmit = function (e) {
        e.preventDefault();
        var next = { cls: cleanText(form.cls.value, CLASS_MAX), no: cleanSeat(form.no.value) };
        if (!next.cls) {
          err.textContent = '請填班級。';
          form.cls.focus({ preventScroll: true });
          return;
        }
        if (!next.no) {
          err.textContent = '座號請填 1 到 999 的數字。';
          form.no.focus({ preventScroll: true });
          return;
        }
        save(STUDENT_KEY, next);
        done = true;
        dlg.close();
        resolve(next);
      };
      form.cls.focus({ preventScroll: true });
    });
  }

  function ensureStudent() {
    var s = getStudent();
    return s ? Promise.resolve(s) : editStudent();
  }

  // 顯示這個學生在這個遊戲的 QR code。opts: { heading, note, highlight, back }
  function showGame(game, opts) {
    opts = opts || {};
    return Promise.all([ensureStudent(), loadQr()]).then(function (res) {
      var s = res[0];
      var levels = passed(game, s);
      if (!levels.length) {
        var empty = openDialog('<h2>還沒有過關紀錄</h2>' +
          '<p>' + esc(s.cls) + ' 班 ' + esc(s.no) + ' 號在這個遊戲還沒有過關的關卡。</p>' +
          '<div class="cp-row"><button type="button" class="cp-btn" data-act="edit">修改班級座號</button>' +
          '<button type="button" class="cp-btn cp-main" data-act="close">關閉</button></div>');
        empty.card.querySelector('[data-act=close]').onclick = empty.close;
        empty.card.querySelector('[data-act=edit]').onclick = function () {
          editStudent().then(function () { showGame(game, opts); }, function () {});
        };
        return null;
      }
      return build(game, s, levels).then(function (text) {
        var rows = levels.map(function (r) {
          return '<li' + ((opts.highlight || []).indexOf(r.level) >= 0 ? ' class="cp-new"' : '') + '><span>' +
            esc(r.title || r.level) + '</span>' + scoreText(r.score, r.max) + '</li>';
        }).join('');
        var dlg = openDialog(
          '<h2>' + esc(opts.heading || '過關了！') + '</h2>' +
          '<div class="cp-body"><div class="cp-qr">' + qrSvg(text) + '</div>' +
          '<div class="cp-info"><p class="cp-who">' + esc(s.cls) + ' 班 ' + esc(s.no) + ' 號</p>' +
          '<ul class="cp-levels">' + rows + '</ul></div></div>' +
          (opts.note ? '<p class="cp-note">' + esc(opts.note) + '</p>' : '') +
          '<p class="cp-note">已過關的 ' + levels.length + ' 關都在這張 QR code 裡，請老師掃描。</p>' +
          '<div class="cp-row">' +
          '<button type="button" class="cp-btn" data-act="edit">不是我？修改班級座號</button>' +
          (opts.back ? '<button type="button" class="cp-btn" data-act="back">回到列表</button>' : '') +
          '<button type="button" class="cp-btn cp-main" data-act="close">關閉</button></div>');
        dlg.card.querySelector('[data-act=close]').onclick = dlg.close;
        dlg.card.querySelector('[data-act=edit]').onclick = function () {
          editStudent().then(function () { showGame(game, opts); }, function () {});
        };
        if (opts.back) dlg.card.querySelector('[data-act=back]').onclick = opts.back;
        dlg.card.querySelector('[data-act=close]').focus({ preventScroll: true });
        return text;
      });
    });
  }

  function showError(err) {
    if (err && err.message === 'cancelled') return;
    var dlg = openDialog('<h2>無法產生 QR code</h2><p class="cp-err">' + esc(err && err.message || err) + '</p>' +
      '<div class="cp-row"><button type="button" class="cp-btn cp-main">關閉</button></div>');
    dlg.card.querySelector('button').onclick = dlg.close;
  }

  // ---------- 公開 API ----------

  // 記下成績（每關只留最好的），然後顯示這個遊戲的 QR code（裡面是所有已過關關卡）。
  // 兩種呼叫方式：
  //   最後一次交出多關：show({ game, levels: [{ level, title, score, max, time? }, ...] })
  //   每過一關呼叫一次：show({ game, level, title, score, max })
  // time 是 Unix 秒，省略就用現在時間。
  // 回傳 Promise，內容是 QR code 文字；學生取消輸入資料時 reject。
  function show(opts) {
    var game = String(opts.game);
    var batch = Array.isArray(opts.levels);
    var now = Math.floor(Date.now() / 1000);
    var recs;
    try {
      if (!CODE_RE.test(game)) throw new Error('遊戲代號只能用英數字與 -：' + game);
      recs = (batch ? opts.levels : [opts]).map(function (o) {
        var rec = {
          level: String(o.level),
          title: cleanText(o.title, TITLE_MAX),
          score: Number(o.score),
          max: Number(o.max),
          time: o.time == null ? now : Number(o.time)
        };
        checkLevel(rec);
        return rec;
      });
      if (!recs.length) throw new Error('levels 至少要有一關');
      if (recs.length > LEVELS_MAX) throw new Error('關卡數不可超過 ' + LEVELS_MAX);
      var seen = {};
      recs.forEach(function (r) {
        if (seen[r.level]) throw new Error('關卡代號重複：' + r.level);
        seen[r.level] = true;
      });
    } catch (err) {
      showError(err);
      return Promise.reject(err);
    }
    return ensureStudent().then(function (s) {
      // 這次比之前差、QR 裡沿用舊成績的關卡
      var kept = recs.filter(function (rec) {
        var old = record(game, s, rec);
        return old && old.max === rec.max && old.score > rec.score;
      });
      var note = !kept.length ? ''
        : batch ? kept.map(function (r) { return r.title || r.level; }).join('、') +
          '：QR code 裡記的是你之前更好的成績。'
        : '這次 ' + kept[0].score + ' / ' + kept[0].max + '，QR code 裡記的是你這關最好的成績。';
      return showGame(game, {
        heading: batch ? '我的成績' : '過關了！',
        note: note,
        highlight: batch ? [] : [recs[0].level]
      });
    }).catch(function (err) {
      showError(err);
      throw err;
    });
  }

  // 再叫出 QR code。給 game 就直接顯示該遊戲；不給就列出玩過的遊戲讓學生選。
  function showPassed(game) {
    if (game) return showGame(game, { heading: '我的過關紀錄' }).catch(showError);
    return ensureStudent().then(function (s) {
      var list = games(s);
      if (list.length === 1) return showPassed(list[0]);
      var dlg = openDialog('<h2>我的過關紀錄</h2>' +
        '<p class="cp-who">' + esc(s.cls) + ' 班 ' + esc(s.no) + ' 號</p>' +
        (list.length ? '<ul class="cp-list">' + list.map(function (g, i) {
          return '<li><button type="button" class="cp-btn" data-i="' + i + '">' + esc(g) +
            '（' + passed(g, s).length + ' 關）</button></li>';
        }).join('') + '</ul>' : '<p>還沒有過關紀錄。</p>') +
        '<div class="cp-row"><button type="button" class="cp-btn cp-main" data-act="close">關閉</button></div>');
      dlg.card.querySelector('[data-act=close]').onclick = dlg.close;
      Array.prototype.forEach.call(dlg.card.querySelectorAll('[data-i]'), function (btn) {
        btn.onclick = function () {
          showGame(list[+btn.getAttribute('data-i')], {
            heading: '我的過關紀錄', back: function () { showPassed(); }
          }).catch(showError);
        };
      });
      (dlg.card.querySelector('[data-i]') || dlg.card.querySelector('[data-act=close]')).focus({ preventScroll: true });
    }).catch(showError);
  }

  window.ClassPass = {
    version: VERSION,
    show: show,
    showPassed: showPassed,
    passed: function (game) { return passed(game); },
    editStudent: function () { return editStudent().catch(function () { return getStudent(); }); },
    getStudent: getStudent,
    // 給測試與 demo 用：直接組出 QR code 文字，不存紀錄、不顯示
    build: build
  };
})();
