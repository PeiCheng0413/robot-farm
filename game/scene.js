// 主畫面場景：同一份 state.layout，兩種看法。
//   斜角（平常）：依 manifest.valleyScene.projection（地面順時針轉 18°、垂直壓 0.625），直立物不轉不壓、依落地位置排序。
//   俯瞰（排列田地）：依 manifest.farmWorld.views.topDown，底圖是俯瞰環境地圖，田畫在格子上；不畫機器人（沒有俯視素材）。
// 畫布填滿地板，鏡頭自己算：把開放範圍放進畫面的安全區。不會動的背景、草地、樹、農舍先畫進快取，
// 只有大小或鏡頭改變才重畫；每格只重畫田、作物、機器人、名牌、圍欄。
// 模擬層不知道這些：田仍用局部座標，這裡只負責「格子 → 畫面」與反過來的點擊換算。

import { PLOTS, BOARD, plotById, cellKey, toBoard, placedCells } from './plots.js';
import { createPainter } from './render.js';

const T = 64;                                  // 素材規格的邏輯格寬
const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
const KIND = { rope: 0, post: 0.5, plant: 1, robot: 2, sign: 3, prop: 4, building: 5 };
const GLOW = '#fff4b8';

export function createSceneRenderer(canvas, assets) {
  const P = createPainter(assets), { manifest, images } = assets;
  const scene = manifest.valleyScene, world = manifest.farmWorld, valley = manifest.valleyFarm, fence = manifest.landBoundary;
  const view = scene.projection.views[scene.projection.defaultView];
  const theta = view.rotationDegrees * Math.PI / 180, cos = Math.cos(theta), sin = Math.sin(theta), sy = view.scaleY;
  const ready = img => img && img.complete && img.naturalWidth;
  const ctx = canvas.getContext('2d');
  const asset = id => scene.assets[id];

  let mode = 'angled', insetBottom = 0;
  let W = 0, H = 0, dpr = 1;
  let cam = { k: 1, ox: 0, oy: 0 };          // 螢幕 = k × 投影（邏輯像素）＋ (ox, oy)，單位是 CSS 像素
  let camKey = '', cacheBack = null, cacheFront = null;
  let layout = {};
  const floaters = [];

  // ---------- 投影 ----------
  // 斜角：格子 → 邏輯平面 (u, v) → 旋轉 → 壓扁。俯瞰：格子 × 64。
  const project = (gx, gy) => {
    if (mode === 'top') return [gx * T, gy * T];
    const u = gx * T, v = gy * T;
    return [u * cos - v * sin, sy * (u * sin + v * cos)];
  };
  const toScreen = (gx, gy) => { const [x, y] = project(gx, gy); return [cam.ox + x * cam.k, cam.oy + y * cam.k]; };
  function toGridF(sx, syv) {
    const x = (sx - cam.ox) / cam.k, y = (syv - cam.oy) / cam.k;
    if (mode === 'top') return [x / T, y / T];
    const dy = y / sy;
    return [(x * cos + dy * sin) / T, (-x * sin + dy * cos) / T];
  }
  const screenTransform = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ---------- 鏡頭 ----------
  // 開放範圍（加一圈）投影後的外框，放進畫面的安全區：上方留給遠景、下方留給前景樹叢。
  function fitCamera(state) {
    const cells = state.land.map(k => k.split(',').map(Number));
    const m = mode === 'top' ? 1.4 : 1.2;
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    const x0 = Math.min(...xs) - m, x1 = Math.max(...xs) + 1 + m, y0 = Math.min(...ys) - m, y1 = Math.max(...ys) + 1 + m;
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => project(x, y));
    const bx0 = Math.min(...corners.map(c => c[0])), bx1 = Math.max(...corners.map(c => c[0]));
    const by0 = Math.min(...corners.map(c => c[1])) - T * 1.1, by1 = Math.max(...corners.map(c => c[1])) + T * .5;   // 上方留名牌與作物高度
    // 俯瞰時下方有排列說明與倉庫面板（insetBottom，由頁面告知），鏡頭要避開
    const safe = mode === 'top' ? [.04, .04, .96, Math.max(.4, 1 - (insetBottom + 12) / H)] : [.1, .3, .9, .84];
    const sw = W * (safe[2] - safe[0]), sh = H * (safe[3] - safe[1]);
    const k = Math.min(sw / (bx1 - bx0), sh / (by1 - by0), mode === 'top' ? 2 : 1.8);
    cam = { k, ox: W * (safe[0] + safe[2]) / 2 - (bx0 + bx1) / 2 * k, oy: H * (safe[1] + safe[3]) / 2 - (by0 + by1) / 2 * k };
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
    camKey = '';
  }

  // ---------- 不會動的層（快取） ----------

  const offscreen = () => { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; return c; };

  function buildCaches() {
    cacheBack = offscreen(); cacheFront = offscreen();
    const real = ctx;
    // 暫時把畫筆換到快取畫布上，沿用同一套投影函式
    swapCtx(cacheBack.getContext('2d'));
    if (mode === 'top') drawTopBackdrop(); else drawAngledBack();
    swapCtx(cacheFront.getContext('2d'));
    if (mode === 'angled') drawAngledFront();
    swapCtx(real);
  }
  let pen = ctx;   // 目前的畫筆：主畫布或快取畫布，投影函式共用
  const swapCtx = c => { pen = c; pen.imageSmoothingEnabled = false; };
  // setGround：讓畫筆直接用「格子平面」的邏輯像素 (u = 64·gx, v = 64·gy) 作畫，整片地面一次轉過去。
  const setGround = () => { const p = pen; const t = mode === 'top'
    ? [dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.ox, dpr * cam.oy]
    : [dpr * cam.k * cos, dpr * cam.k * sy * sin, -dpr * cam.k * sin, dpr * cam.k * sy * cos, dpr * cam.ox, dpr * cam.oy]; p.setTransform(...t); };
  const setScreen = () => pen.setTransform(dpr, 0, 0, dpr, 0, 0);

  function drawImg(id, dx, dy, dw, dh, flipX) {
    const a = asset(id), img = a && images.get(a.file);
    if (!ready(img)) return;
    if (flipX) { pen.save(); pen.translate(dx + dw, dy); pen.scale(-1, 1); pen.drawImage(img, ...a.sourceRect, 0, 0, dw, dh); pen.restore(); }
    else pen.drawImage(img, ...a.sourceRect, dx, dy, dw, dh);
  }

  // 斜角的後景：天空、湖景、草地、步道、遠處的樹與農舍
  function drawAngledBack() {
    const p = pen;
    // 草地先鋪滿整個畫面（整片地面一次投影；邏輯 256px 一塊、交錯鏡像，避免看出重複）
    setGround();
    p.fillStyle = scene.rendering.groundColor;
    p.fillRect(-30 * T, -30 * T, 70 * T, 70 * T);
    const meadow = asset('meadow'), mimg = meadow && images.get(meadow.file), size = 4 * T;
    if (ready(mimg)) {
      for (let gy = -24; gy < 24; gy += 4) for (let gx = -20; gx < 32; gx += 4) {
        const fx = ((gx / 4) & 1) ? -1 : 1, fy = ((gy / 4) & 1) ? -1 : 1;
        p.save(); p.translate(gx * T + (fx < 0 ? size : 0), gy * T + (fy < 0 ? size : 0)); p.scale(fx, fy);
        p.drawImage(mimg, ...meadow.sourceRect, 0, 0, size, size); p.restore();
      }
    }
    // 步道：依 farmWorld 的分區（北側服務道、西側入口），與俯瞰地圖一致
    const path = asset('dirtPath'), pimg = path && images.get(path.file);
    for (const zone of world?.environment.zones || []) {
      if (zone.kind !== 'path' || !ready(pimg)) continue;
      const [zx, zy, zw, zh] = zone.bounds;
      for (let y = 0; y < zh; y += 1) for (let x = 0; x < zw; x += 1) {
        p.drawImage(pimg, ...path.sourceRect, (zx + x) * T, (zy + y) * T, Math.min(1, zw - x) * T, Math.min(1, zh - y) * T);
      }
    }
    // 天空與湖景從上方蓋下來：湖景底部那排樹壓在北邊林緣的位置，剛好遮住草地與遠景的接縫
    setScreen();
    const lakeH = W * 345 / 960, lakeBottom = horizonY(), lakeY = lakeBottom - lakeH;
    p.fillStyle = scene.rendering.skyColor; p.fillRect(0, 0, W, Math.max(0, lakeY + lakeH * .45));
    drawImg('skyClouds', 0, Math.min(0, lakeY), W, Math.max(H * .28, lakeY + lakeH * .5));
    drawImg('valleyLake', 0, lakeY, W, lakeH);
    // 湖景底部是一排不透明的深色樹，會在畫面上切出一條水平線：沿線補一排林下灌木蓋住接縫
    const under = asset('forestUnderstory');
    if (under) {
      const [, , uw, uh] = under.sourceRect, tw = Math.max(120, W / 7), th = tw * uh / uw;
      for (let x = -tw * .3, i = 0; x < W; x += tw * .82, i++) drawImg(i % 2 ? 'flowerUnderstory' : 'forestUnderstory', x, lakeBottom - th * .55, tw, th, i % 3 === 0);
    }
    // 後方直立物：北邊與兩側的樹、農舍（都在盤面外，機器人不會走到它們後面）
    for (const s of sortedProps(false)) uprightProp(s);
  }

  // 斜角的前景：盤面南邊的樹與框邊樹叢（永遠在最上層）
  function drawAngledFront() {
    setScreen();
    for (const s of sortedProps(true)) uprightProp(s);
    for (const id of ['frameLeft', 'frameRight', 'frameBottom']) {
      const a = asset(id);
      if (!a) continue;
      const [rx, ry, rw, rh] = a.viewportRect.map((v, i) => v * (i % 2 ? H : W));
      const [, , sw, sh] = a.sourceRect, k = a.fit === 'contain' && id === 'frameBottom' ? Math.max(rw / sw, rh / sh) : Math.min(rw / sw, rh / sh);
      const dw = sw * k, dh = sh * k;
      const dx = a.edge === 'right' ? W - dw : a.edge === 'left' ? 0 : (W - dw) / 2;
      // 前景離鏡頭最近、在陰影裡：壓暗約三成，視線才會落到中間的農場
      // （先畫到暫存畫布再疊深色，不用 ctx.filter，Safari 也一致）
      const tmp = document.createElement('canvas');
      tmp.width = Math.ceil(dw * dpr); tmp.height = Math.ceil(dh * dpr);
      const t = tmp.getContext('2d'), img = images.get(a.file);
      if (!ready(img)) continue;
      t.imageSmoothingEnabled = false;
      t.drawImage(img, ...a.sourceRect, 0, 0, tmp.width, tmp.height);
      t.globalCompositeOperation = 'source-atop';
      t.fillStyle = 'rgba(16, 30, 27, .34)'; t.fillRect(0, 0, tmp.width, tmp.height);
      pen.drawImage(tmp, dx, H - dh, dw, dh);
    }
  }

  // 場景裡的樹與農舍：都在盤面外。林帶範圍對照俯瞰環境地圖（farmWorld.views.topDown 的地圖：
  // 盤面四周一圈有厚度的森林，北側西邊是湖、東邊是農舍），斜角與俯瞰兩邊看到的地形才一致。
  // 帶狀區域裡錯落種樹：位置、大小、種類、翻轉都用固定亂數，每次打開都一樣。
  // 南側不種（鏡頭拉近時會投影到盤面上擋住田），畫面下緣交給框邊樹叢。
  let props = null;
  function sceneryProps() {
    if (props) return props;
    props = [];
    const zones = world?.environment.zones || [];
    const house = zones.find(z => z.kind === 'farmhouse-service');
    const lake = zones.find(z => z.kind === 'lake-shore');
    if (house) props.push({ id: 'farmhouseAngled', gx: house.bounds[0] + house.bounds[2] / 2, gy: house.bounds[1] + house.bounds[3] - .6, scale: 1 });
    const inside = (z, x, y, pad = 0) => z && x > z.bounds[0] - pad && x < z.bounds[0] + z.bounds[2] + pad && y > z.bounds[1] - pad && y < z.bounds[1] + z.bounds[3] + pad;
    // 固定亂數（同樣的格子永遠得到同樣的值）
    const rand = (x, y, k) => { const v = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
    // 林帶：[x0, x1, y0, y1]（格子座標），inner 是靠近空地那一側，種灌木當過渡
    const bands = [
      // 與盤面留 2 格以上：樹冠很寬，太近會被畫在後面的田面蓋住樹根
      { rect: [-7, -2.2, -9, 9.5], inner: 'east' },       // 西側
      { rect: [14.2, 19, -9, 9.5], inner: 'west' },       // 東側
      { rect: [-2.2, 14.2, -10.5, -6.6], inner: 'south' }, // 北側（湖與農舍的後方）
    ];
    for (const band of bands) {
      const [x0, x1, y0, y1] = band.rect;
      for (let y = y0; y < y1; y += 1.3) for (let x = x0; x < x1; x += 1.5) {
        const jx = x + rand(x, y, 1) * 1.2, jy = y + rand(x, y, 2) * 1.0;
        if (inside(house, jx, jy, .8) || inside(lake, jx, jy, -.3)) continue;
        if (rand(x, y, 3) < .18) continue;   // 留一些空隙，邊緣不會像一堵牆
        props.push({ id: rand(x, y, 4) < .55 ? 'conifers' : 'sunlitTrees', gx: jx, gy: jy, scale: .62 + rand(x, y, 5) * .45, flip: rand(x, y, 6) < .5 });
      }
      // 靠空地那一側的灌木：森林到草地的過渡
      const edge = band.inner === 'east' ? x1 : band.inner === 'west' ? x0 : y1;
      const along = band.inner === 'south' ? [x0, x1] : [y0, y1];
      for (let t = along[0]; t < along[1]; t += 1.7) {
        const j = t + rand(t, edge, 7) * 1.1, off = (rand(t, edge, 8) - .5) * .6;
        const [gx, gy] = band.inner === 'south' ? [j, edge + .2 + off] : [edge + (band.inner === 'east' ? .3 : -.3) + off, j];
        if (inside(house, gx, gy, .6)) continue;
        props.push({ id: rand(t, edge, 9) < .5 ? 'forestUnderstory' : 'flowerUnderstory', gx, gy, scale: .8 + rand(t, edge, 10) * .4, flip: rand(t, edge, 11) < .5 });
      }
    }
    return props;
  }

  // 草地與遠景的交界線：湖景底部接在地圖北緣，但至少落在畫面 30% 高度，鏡頭拉近時也看得到遠景
  const horizonY = () => Math.max(toScreen(6, -8)[1], H * .3);
  // 落地點在交界線以上的樹不畫：那裡在畫面上是遠景（湖、山），近處的樹不可能站在上面
  const sortedProps = front => {
    const limit = horizonY() + 6;
    return sceneryProps().filter(s => !!s.front === front && (s.id === 'farmhouseAngled' || toScreen(s.gx, s.gy)[1] > limit))
      .sort((a, b) => toScreen(a.gx, a.gy)[1] - toScreen(b.gx, b.gy)[1]);
  };

  function uprightProp(s) {
    const a = asset(s.id);
    if (!a) return;
    const [gx, gy] = toScreen(s.gx, s.gy), [bw, bh] = a.recommendedDisplaySize, [, , sw, sh] = a.sourceRect;
    const k = Math.min(bw / sw, bh / sh) * cam.k * s.scale;
    const dw = sw * k, dh = sh * k, ax = a.groundAnchor[0] * k, ay = a.groundAnchor[1] * k;
    shadowAt(gx, gy, dw * .55);
    drawImg(s.id, s.flip ? gx - (dw - ax) : gx - ax, gy - ay, dw, dh, s.flip);
  }

  function shadowAt(x, y, w) {
    pen.fillStyle = 'rgba(38, 63, 60, .24)';
    pen.beginPath(); pen.ellipse(x + 3, y, w / 2, Math.max(3, w * .12), 0, 0, Math.PI * 2); pen.fill();
  }

  // 俯瞰：環境地圖照 farmWorld.views.topDown 對齊格子（地圖像素 → 格子：(x - 224) / 64）
  function drawTopBackdrop() {
    const map = world?.assets.overheadMap, img = map && images.get(map.file), v = world?.views.topDown;
    setScreen();
    pen.fillStyle = '#2f4a3a'; pen.fillRect(0, 0, W, H);
    if (!ready(img) || !v) return;
    setGround();
    const [ox, oy] = v.boardOrigin;
    pen.drawImage(img, ...map.sourceRect, -ox, -oy, map.sourceRect[2], map.sourceRect[3]);
  }

  // ---------- 每格畫面 ----------

  // opts：{ selected, hovered, ghost, land }，ghost／land 的格式與 render.js 的盤面相同。
  function draw(state, opts = {}) {
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
    const key = `${mode}|${W}|${H}|${state.land.length}`;
    if (key !== camKey) { fitCamera(state); camKey = key; buildCaches(); }
    layout = opts.ghost ? { ...state.layout, [opts.ghost.plotId]: opts.ghost.place } : state.layout;
    swapCtx(ctx);
    screenTransform();
    ctx.clearRect(0, 0, W, H);
    if (cacheBack) ctx.drawImage(cacheBack, 0, 0, W, H);
    if (mode === 'top') drawTop(state, opts); else drawAngled(state, opts);
    if (cacheFront && mode === 'angled') { screenTransform(); ctx.drawImage(cacheFront, 0, 0, W, H); }
    drawFloaters();
  }

  const shownPlots = () => PLOTS.filter(p => layout[p.id]);
  const plotCells = plot => placedCells(plot, layout[plot.id]);
  const gridOf = (plot, x, y) => toBoard(plot, layout[plot.id], x, y);

  // 開放的地：淡淡提亮；排列模式另外標出可以買的格子
  function landLayer(state, land) {
    setGround();
    pen.fillStyle = mode === 'top' ? 'rgba(255, 250, 220, .18)' : 'rgba(240, 228, 187, .14)';
    for (const k of state.land) { const [x, y] = k.split(',').map(Number); pen.fillRect(x * T, y * T, T, T); }
    if (mode === 'top') {
      pen.fillStyle = 'rgba(29, 47, 44, .42)';
      for (let y = 0; y < BOARD.rows; y++) for (let x = 0; x < BOARD.columns; x++) if (!state.land.includes(cellKey(x, y))) pen.fillRect(x * T, y * T, T, T);
      pen.strokeStyle = 'rgba(255, 250, 240, .22)'; pen.lineWidth = 1.5 / cam.k;
      for (let x = 0; x <= BOARD.columns; x++) { pen.beginPath(); pen.moveTo(x * T, 0); pen.lineTo(x * T, BOARD.rows * T); pen.stroke(); }
      for (let y = 0; y <= BOARD.rows; y++) { pen.beginPath(); pen.moveTo(0, y * T); pen.lineTo(BOARD.columns * T, y * T); pen.stroke(); }
    }
    if (!land) return;
    for (const [x, y] of land.buyable) {
      const pending = land.pending && land.pending[0] === x && land.pending[1] === y;
      pen.fillStyle = pending ? 'rgba(38, 63, 60, .55)' : 'rgba(38, 63, 60, .2)';
      pen.fillRect(x * T + 4, y * T + 4, T - 8, T - 8);
      pen.strokeStyle = pending ? '#f0cf7e' : 'rgba(255, 250, 240, .85)'; pen.lineWidth = (pending ? 4 : 2.5) / cam.k * 1.5;
      pen.setLineDash(pending ? [] : [6, 6]); pen.strokeRect(x * T + 4, y * T + 4, T - 8, T - 8); pen.setLineDash([]);
    }
    setScreen();
    pen.fillStyle = '#fffaf0'; pen.textAlign = 'center'; pen.textBaseline = 'middle';
    for (const [x, y] of land.buyable) {
      const pending = land.pending && land.pending[0] === x && land.pending[1] === y, [cx, cy] = toScreen(x + .5, y + .5);
      pen.font = `bold ${Math.round((pending ? 14 : 22) * Math.min(1.4, cam.k))}px ${FONT}`;
      pen.fillText(pending ? `買 ${land.price}・再點一下` : '+', cx, cy);
    }
    pen.textAlign = 'start';
  }

  // 田面（格子平面上畫正方形，投影會把它轉斜）
  function soilLayer(state) {
    setGround();
    for (const plot of shownPlots()) {
      const ps = state.plots[plot.id];
      for (const [x, y] of plot.cells) {
        const [bx, by] = gridOf(plot, x, y);
        P.soil(pen, bx * T, by * T, T, ps.cells[cellKey(x, y)].moisture);
      }
    }
  }

  // 外框、選取、當機、拖曳預覽、滑鼠移上去的發光（都畫在田面上）
  function overlays(state, { selected, hovered, ghost }) {
    setGround();
    const lw = px => px / cam.k;
    const origin = (x, y) => [x * T, y * T];
    for (const plot of shownPlots()) {
      const ps = state.plots[plot.id], cells = plotCells(plot);
      P.outline(pen, cells, origin, T, 'rgba(38, 63, 60, .85)', lw(3));
      P.outline(pen, cells, origin, T, plot.rules.colour, lw(1.6));
      if (ps.crashed) { pen.fillStyle = 'rgba(198, 95, 72, .35)'; for (const [x, y] of cells) pen.fillRect(x * T, y * T, T, T); }
      if (selected === plot.id) P.outline(pen, cells, origin, T, '#f0cf7e', lw(4));
      if (ghost?.plotId === plot.id) {
        pen.fillStyle = ghost.valid ? 'rgba(143, 199, 163, .45)' : 'rgba(198, 95, 72, .55)';
        for (const [x, y] of cells) pen.fillRect(x * T, y * T, T, T);
        P.outline(pen, cells, origin, T, ghost.valid ? '#2f7d4a' : '#9b2c1c', lw(4));
      }
      // 發光：讓使用者看出這塊田是什麼形狀
      if (hovered === plot.id && !ghost) {
        const pulse = .55 + .35 * Math.sin(performance.now() / 220);
        pen.save();
        pen.shadowColor = GLOW; pen.shadowBlur = 18 * dpr;
        pen.fillStyle = `rgba(255, 244, 184, ${.22 * pulse})`;
        for (const [x, y] of cells) pen.fillRect(x * T, y * T, T, T);
        P.outline(pen, cells, origin, T, `rgba(255, 244, 184, ${pulse + .1})`, lw(4));
        pen.restore();
      }
    }
    if (ghost && state.layout[ghost.plotId]) {
      pen.setLineDash([8, 8]);
      P.outline(pen, placedCells(plotById.get(ghost.plotId), state.layout[ghost.plotId]), origin, T, 'rgba(38, 63, 60, .8)', lw(2.5));
      pen.setLineDash([]);
    }
  }

  // 土壁：所有田格聯集的外露邊，轉完朝下（螢幕法向量 y > 0）就往下延伸 frontDepth
  function walls(state) {
    const occupied = new Map();
    for (const plot of shownPlots()) {
      const ps = state.plots[plot.id];
      for (const [x, y] of plot.cells) { const [bx, by] = gridOf(plot, x, y); occupied.set(cellKey(bx, by), ps.cells[cellKey(x, y)].moisture); }
    }
    const f = valley?.assets.soilFront, img = f && images.get(f.file), depth = scene.rendering.frontWalls.frontDepth * cam.k;
    setScreen();
    for (const [key, moisture] of occupied) {
      const [x, y] = key.split(',').map(Number);
      for (const side of scene.rendering.frontWalls.sides) {
        if (occupied.has(cellKey(x + side.neighbor[0], y + side.neighbor[1]))) continue;
        const a = toScreen(x + side.start[0], y + side.start[1]), b = toScreen(x + side.end[0], y + side.end[1]);
        if (b[0] - a[0] <= 0) continue;   // 法向量 [b.y-a.y, -(b.x-a.x)] 的 y > 0 ⇔ b.x > a.x
        const frame = f?.frames.find(fr => fr.soilIndex === moisture);
        if (ready(img) && frame) {
          const [, , w, h] = frame.sourceRect;
          pen.save();
          pen.setTransform(dpr * (b[0] - a[0]) / w, dpr * (b[1] - a[1]) / w, 0, dpr * depth / h, dpr * a[0], dpr * a[1]);
          pen.drawImage(img, ...frame.sourceRect, 0, 0, w, h);
          pen.restore();
        } else {
          pen.fillStyle = '#6b4a33';
          pen.beginPath(); pen.moveTo(...a); pen.lineTo(...b); pen.lineTo(b[0], b[1] + depth); pen.lineTo(a[0], a[1] + depth); pen.fill();
        }
      }
    }
  }

  // 圍欄：已開放範圍的外緣，繩子沿著投影後的邊、架高 elevation，每個頂點一根樁
  function fenceItems(state) {
    if (!fence) return [];
    const open = new Set(state.land), items = [], vertices = new Map();
    const conf = scene.compositionV20?.boundary || { postSize: [8, 24], ropeThickness: 2, elevation: 16 };
    for (const key of open) {
      const [x, y] = key.split(',').map(Number);
      for (const side of fence.geometry.sides) {
        if (open.has(cellKey(x + side.neighbor[0], y + side.neighbor[1]))) continue;
        const a = [x + side.start[0], y + side.start[1]], b = [x + side.end[0], y + side.end[1]];
        items.push({ kind: 'rope', gx: (a[0] + b[0]) / 2, gy: (a[1] + b[1]) / 2, draw: () => rope(a, b, conf) });
        for (const v of [a, b]) vertices.set(cellKey(...v), v);
      }
    }
    for (const v of vertices.values()) items.push({ kind: 'post', gx: v[0], gy: v[1], draw: () => post(v, conf) });
    return items;
  }

  function rope(a, b, conf) {
    const part = fence.parts.horizontal, img = images.get(fence.atlas), lift = conf.elevation * cam.k, thick = Math.max(1.5, conf.ropeThickness * cam.k);
    const [x1, y1] = toScreen(...a), [x2, y2] = toScreen(...b);
    const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1);
    if (!ready(img)) { pen.strokeStyle = '#8a6a3a'; pen.lineWidth = thick; pen.beginPath(); pen.moveTo(x1, y1 - lift); pen.lineTo(x2, y2 - lift); pen.stroke(); return; }
    pen.save(); pen.translate(x1, y1 - lift); pen.rotate(ang);
    pen.drawImage(img, ...part.sourceRect, 0, -thick / 2, len, thick);
    pen.restore();
  }

  function post(v, conf) {
    const part = fence.parts.post, img = images.get(fence.atlas), [, , w, h] = part.sourceRect;
    const k = Math.min(conf.postSize[0] / w, conf.postSize[1] / h) * cam.k, [gx, gy] = toScreen(...v);
    if (!ready(img)) { pen.fillStyle = '#7a5530'; pen.fillRect(gx - 3, gy - conf.postSize[1] * cam.k, 6, conf.postSize[1] * cam.k); return; }
    pen.drawImage(img, ...part.sourceRect, gx - part.groundAnchor[0] * k, gy - part.groundAnchor[1] * k, w * k, h * k);
  }

  function drawAngled(state, opts) {
    landLayer(state, null);
    soilLayer(state);
    overlays(state, opts);
    walls(state);
    // 直立物：收集後依落地位置排序，越前面越晚畫（valleyScene.rendering.depthOrder）
    const items = fenceItems(state);
    const views = state.robots.filter(r => r.plot && layout[r.plot])
      .map(r => ({ robot: r, view: P.robotView(r, r.act, state.time, (id, x, y) => gridOf(plotById.get(id), x, y), id => layout[id].rot) }));
    const hidden = new Set(views.filter(v => P.hidesPlant(v.view)).map(v => v.robot.plot + '|' + v.view.cell));
    const comp = scene.compositionV20 || scene.composition, offsets = comp?.plantOffsets || [[.5, .7]], plantSize = (comp?.plantSize || 46) * 1.15;
    for (const plot of shownPlots()) {
      const ps = state.plots[plot.id];
      for (const [x, y] of plot.cells) {
        const cell = ps.cells[cellKey(x, y)];
        if (!cell.crop || hidden.has(plot.id + '|' + cellKey(x, y))) continue;
        const [bx, by] = gridOf(plot, x, y);
        // 每格兩株（valleyScene.composition.plantOffsets），田看起來是滿的
        for (const [px, py] of offsets) {
          items.push({ kind: 'plant', gx: bx + px, gy: by + py, draw: () => {
            const [sx0, sy0] = toScreen(bx + px, by + py);
            shadowAt(sx0, sy0, plantSize * cam.k * .38);
            P.plantAt(pen, sx0, sy0, plantSize * cam.k, cell.crop, P.stageOf(cell.growth));
          } });
        }
      }
      items.push(signItem(state, plot));
    }
    for (const { robot, view } of views) {
      const g = [view.pos[0] + .5, view.pos[1] + .5];
      items.push({ kind: 'robot', gx: g[0], gy: g[1], draw: () => {
        const [rx, ry] = toScreen(...g), cell = 83 * cam.k;
        shadowAt(rx, ry + 4 * cam.k, cell * .5);
        const box = P.robotAt(pen, view, rx, ry, cell);
        if (robot.phase === 'stuck') P.label(pen, '！當機', box.boxX + box.size * .2, box.boxY - 8, '#c65f48', Math.round(16 * Math.min(1.4, cam.k)));
      } });
    }
    // 以投影後的螢幕 y 排序（同樣的格子 y，旋轉後越東邊越低）
    for (const it of items) it.sy = toScreen(it.gx, it.gy)[1];
    items.sort((a, b) => a.sy - b.sy || a.gx - b.gx || KIND[a.kind] - KIND[b.kind]);
    setScreen();
    for (const it of items) it.draw();
  }

  // 名牌：插在田的左下外側（valleyFarm.preview.signAnchorRule：[最小 x, 最大 y] + signOffset）
  function signItem(state, plot) {
    const ps = state.plots[plot.id], cells = plotCells(plot);
    const off = valley?.preview?.signOffset || [-.35, 1.1];
    const gx = Math.min(...cells.map(c => c[0])) + off[0], gy = Math.max(...cells.map(c => c[1])) + off[1];
    const text = plot.name.split('・')[0] + '田' + (ps.crashed ? '・當機' : '');
    const size = (valley?.uprightSprites?.signDisplaySize || [80, 70])[0] * 1.15;
    return { kind: 'sign', gx, gy, draw: () => {
      const [ax, ay] = toScreen(gx, gy);
      shadowAt(ax, ay, size * cam.k * .25);
      if (!P.sign(pen, plot.rules.name, text, ax, ay, size * cam.k, ps.crashed ? '#9b2c1c' : null)) {
        P.label(pen, text, ax - 20, ay - 30, 'rgba(38, 63, 60, .82)', 16);
      }
    } };
  }

  // 俯瞰：田面、作物（每格一株，直立素材照舊）、名牌標籤；不畫機器人
  function drawTop(state, opts) {
    landLayer(state, opts.land);
    soilLayer(state);
    overlays(state, opts);
    setScreen();
    for (const plot of shownPlots()) {
      const ps = state.plots[plot.id];
      for (const [x, y] of [...plot.cells].sort((a, b) => gridOf(plot, ...a)[1] - gridOf(plot, ...b)[1])) {
        const cell = ps.cells[cellKey(x, y)];
        if (!cell.crop) continue;
        const [bx, by] = gridOf(plot, x, y), [sx0, sy0] = toScreen(bx, by);
        P.plant(pen, sx0, sy0, T * cam.k, cell.crop, P.stageOf(cell.growth));
      }
      const cells = plotCells(plot), top = Math.min(...cells.map(c => c[1])), left = Math.min(...cells.filter(c => c[1] === top).map(c => c[0]));
      const [lx, ly] = toScreen(left, top);
      P.label(pen, plot.name, lx + 3, ly + 3, ps.crashed ? '#c65f48' : 'rgba(38, 63, 60, .85)', Math.round(13 * Math.min(1.5, cam.k)));
    }
  }

  // ---------- 浮動文字 ----------

  function drawFloaters() {
    screenTransform();
    const size = Math.round(18 * Math.min(1.6, Math.max(.9, cam.k)));
    ctx.font = `bold ${size}px ${FONT}`; ctx.textBaseline = 'middle';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i], age = (performance.now() - f.born) / 1400;
      if (age >= 1 || !layout[f.plotId]) { floaters.splice(i, 1); continue; }
      const [x, y] = toScreen(...gridOf(plotById.get(f.plotId), f.x + .3, f.y + .2));
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 4; ctx.strokeStyle = '#fffaf0'; ctx.strokeText(f.text, x, y - 30 - age * 30);
      ctx.fillStyle = f.colour; ctx.fillText(f.text, x, y - 30 - age * 30);
      ctx.globalAlpha = 1;
    }
  }
  function floatAt(plotId, x, y, text, colour) {
    if (mode === 'angled') floaters.push({ plotId, x, y, text, colour, born: performance.now() });
  }

  // ---------- 點擊換算 ----------

  function cellAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect(), [gx, gy] = toGridF(clientX - r.left, clientY - r.top);
    return { x: Math.floor(gx), y: Math.floor(gy) };
  }
  function plotAt(clientX, clientY) {
    const { x: bx, y: by } = cellAt(clientX, clientY);
    const plot = PLOTS.find(p => layout[p.id] && plotCells(p).some(([x, y]) => x === bx && y === by));
    return plot ? plot.id : null;
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    camKey = '';
    floaters.length = 0;
  }

  resize();
  // 頁面下方被面板蓋住的高度（CSS 像素），俯瞰時鏡頭避開
  function setInsetBottom(px) { if (Math.abs(px - insetBottom) > 1) { insetBottom = px; camKey = ''; } }

  return { draw, floatAt, plotAt, cellAt, setMode, setInsetBottom, get mode() { return mode; }, scene: true };
}
