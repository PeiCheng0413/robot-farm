// 遊戲畫面：依 assets/manifest.json 與 alignment.js 的數據畫土壤、作物、機器人、持物、想法泡泡與掃描波紋。
// 只讀數據，不依賴 app.js 的播放邏輯（AGENTS.md）。
//
// loadAssets()            載入 manifest、alignment 與圖片
// createPainter(assets)   繪圖元件：每個函式都把要畫的 ctx 與格子大小當參數，盤面與單塊田特寫共用
// createBoardRenderer()   農場盤面（遊戲機制測試畫面）
// createPlotView()        單塊田特寫（腳本編輯畫面）

import { PLOTS, BOARD, plotById, cellKey } from './plots.js';
import { VECTORS } from './sim.js';

const C = { floor: '#e7dcb8', slot: '#ddd0a6', outline: '#263f3c', selected: '#8fc7a3', crash: '#c65f48', label: '#fffaf0' };
const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
const ROBOT_SCALE = 1.4;   // 機器人 416 畫布的邊長＝格子邊長 × 這個倍數
const ROBOT_LIFT = 0.32;   // 機身中心比格子中心高幾格

export async function loadAssets() {
  const response = await fetch('assets/manifest.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('素材數據讀取失敗：' + response.status);
  const manifest = await response.json();
  const align = typeof spriteAlignment !== 'undefined' ? spriteAlignment : null;   // 由 alignment.js 以一般 script 載入
  if (!align) throw new Error('alignment.js 沒有載入');
  const { rendering } = manifest;
  const files = new Set([rendering.soil.atlas, ...manifest.crops.map(c => c.atlas), ...manifest.produce.map(p => p.file),
    ...Object.values(rendering.robotPoses).map(p => p.atlas),
    ...(manifest.thoughtBubbles ? [manifest.thoughtBubbles.atlas] : []),
    ...Object.values(manifest.effectClips || {}).map(e => e.atlas),
    ...(manifest.mainScreenAssets?.items || []).map(i => i.file)]);
  const images = new Map();
  await Promise.all([...files].map(file => new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = 'assets/' + file + '?v=' + encodeURIComponent(manifest.version);
    images.set(file, img);
  })));
  return { manifest, align, images };
}

// 主畫面靜態素材（manifest.mainScreenAssets）：依 id 取一項。
export const screenAsset = ({ manifest }, id) => manifest.mainScreenAssets?.items.find(i => i.id === id) || null;

// 把素材的 sourceRect 裁成指定大小的圖片網址，給 CSS 背景或 <img> 用。
export function spriteURL(assets, item, width, height) {
  const img = item && assets.images.get(item.file);
  if (!img || !img.naturalWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const [sx, sy, sw, sh] = item.sourceRect;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

export function createPainter({ manifest, align, images }) {
  const { rendering, animationClips: clips, movement } = manifest;
  const cropById = new Map(manifest.crops.map(c => [c.id, c]));
  const produceById = new Map(manifest.produce.map(p => [p.id, p]));
  const lookup = path => path.reduce((v, k) => v[k], align);
  const ready = img => img && img.complete && img.naturalWidth;
  const movingClip = manifest.playback.directionalClips.empty;
  const decision = manifest.playback.decisionClips || {};

  // ---------- 動畫片段 ----------

  const durationsOf = clip => clip.frameDurationsMs || clip.frameOrder.map(() => clip.frameDurationMs);
  const clipLength = name => durationsOf(clips[name]).reduce((a, b) => a + b, 0);

  // 依經過時間回傳片段中的第幾步；循環片段一直轉，非循環片段停在最後一步。
  function stepAt(durations, loop, elapsed) {
    const total = durations.reduce((a, b) => a + b, 0);
    let t = loop ? elapsed % total : Math.min(elapsed, total - 1);
    for (let i = 0; i < durations.length; i++) {
      if (t < durations[i]) return i;
      t -= durations[i];
    }
    return durations.length - 1;
  }
  const clipStep = (name, elapsed) => stepAt(durationsOf(clips[name]), clips[name].loop, elapsed);

  // 這一步要畫哪個 pose、哪一格，以及持物與原植株的顯示狀態。
  function pose(name, step, heading) {
    const clip = clips[name];
    const row = clip.poseRows.length > 1 ? clip.poseRows[movement.headingOrder.indexOf(heading)] : clip.poseRows[0];
    return {
      row, frame: clip.frameOrder[step],
      cargoVisible: clip.objects.cargoVisible[step], cargoPose: clip.objects.cargoPose[step], plantVisible: clip.objects.sourcePlantVisible[step],
    };
  }

  // ---------- 元件 ----------

  function soil(ctx, x, y, cell, moisture) {
    const img = images.get(rendering.soil.atlas), b = manifest.pixelBoundaries;
    if (!ready(img)) { ctx.fillStyle = ['#c6a376', '#a67950', '#77513b', '#5f7f8a'][moisture]; ctx.fillRect(x, y, cell, cell); return; }
    ctx.drawImage(img, b[moisture], b[0], b[moisture + 1] - b[moisture], b[1] - b[0], x, y, cell, cell);
  }

  function plant(ctx, x, y, cell, cropId, stage) {
    const crop = cropById.get(cropId), img = crop && images.get(crop.atlas);
    if (!ready(img)) return;
    const f = crop.frames[stage], [sx, sy, sw, sh] = f.sourceRect;
    const [canvasW] = rendering.plantCanvas, [rootX, rootY] = rendering.plantRoot;
    const k = cell / canvasW * f.scale;
    ctx.drawImage(img, sx, sy, sw, sh, x + cell * rootX / canvasW - f.root[0] * k, y + cell * rootY / canvasW - f.root[1] * k, sw * k, sh * k);
  }

  // 依外殼中心與高度對齊：外殼高度縮放成 bodyHeight，中心放在 bodyCenter（再加上漂浮位移）。回傳持物錨點。
  function robot(ctx, boxX, boxY, size, row, frameIndex) {
    const p = rendering.robotPoses[row], f = p && p.frames[frameIndex], img = p && images.get(p.atlas);
    if (!ready(img)) { ctx.fillStyle = '#f0e4bb'; ctx.fillRect(boxX + size * .35, boxY + size * .35, size * .3, size * .3); return null; }
    const [cx, cy, shell] = lookup(f.alignmentPath), [sx, sy, sw, sh] = f.sourceRect;
    const unit = size / align.canvas, k = align.bodyHeight / shell * unit;
    const bob = f.bobIndex == null ? 0 : align.bob[f.bobIndex];
    const ox = boxX + align.bodyCenter[0] * unit - (cx - sx) * k;
    const oy = boxY + (align.bodyCenter[1] + bob) * unit - (cy - sy) * k;
    ctx.drawImage(img, sx, sy, sw, sh, ox, oy, sw * k, sh * k);
    if (f.cargoAnchorPath) { const [hx, hy] = lookup(f.cargoAnchorPath); return [ox + (hx - sx) * k, oy + (hy - sy) * k]; }
    return null;
  }

  function produce(ctx, cropId, centerX, bottomY, size) {
    const item = produceById.get(cropId), img = item && images.get(item.file);
    if (!ready(img)) return;
    const [sx, sy, sw, sh] = item.sourceRect, [canvasW] = rendering.produce.canvas;
    const k = size * rendering.produce.maxContentSize / canvasW / Math.max(sw, sh);
    const baseline = bottomY - size * (1 - rendering.produce.baseline / canvasW);
    ctx.drawImage(img, sx, sy, sw, sh, centerX - sw * k / 2, baseline - sh * k, sw * k, sh * k);
  }

  function cargo(ctx, cropId, boxX, boxY, size, cargoPose, anchor) {
    const s = size * rendering.cargo.widthRatio;
    if (cargoPose === 'held' && anchor) return produce(ctx, cropId, anchor[0], anchor[1], s);
    const spot = rendering.cargo[cargoPose] || rendering.cargo.fallback;
    produce(ctx, cropId, boxX + spot.leftRatio * size, boxY + size * (1 - spot.bottomRatio), s);
  }

  // 想法泡泡：thoughtBubbles.byClip 決定哪個機器人片段配哪個泡泡；時間從進入片段起算。
  function bubble(ctx, clipName, elapsed, boxX, boxY, size) {
    const tb = manifest.thoughtBubbles, name = tb?.byClip[clipName], img = tb && images.get(tb.atlas);
    if (!name || !ready(img)) return;
    const anim = tb.animations[name], f = tb.frames[anim.frameOrder[stepAt(anim.frameDurationsMs, anim.loop, elapsed)]];
    const [canvasW, canvasH] = tb.canvas, place = tb.placement, k = size * place.widthRatio / canvasW;
    const left = boxX + place.leftRatio * size, top = boxY + size * (1 - place.bottomRatio) - canvasH * k;
    const [sx, sy, sw, sh] = f.sourceRect, [dx, dy, dw, dh] = f.destinationRect;
    ctx.drawImage(img, sx, sy, sw, sh, left + dx * k, top + dy * k, dw * k, dh * k);
  }

  // 範圍掃描波紋：跟著 scan 片段的步數播放，以整塊田的外框為範圍，只畫在田格上。
  function scanWave(ctx, step, rects) {
    const eff = manifest.effectClips?.areaScanWave, img = eff && images.get(eff.atlas);
    const index = eff?.frameIndexByStep[step];
    if (index == null || !ready(img)) return;
    const minX = Math.min(...rects.map(r => r[0])), minY = Math.min(...rects.map(r => r[1]));
    const maxX = Math.max(...rects.map(r => r[0] + r[2])), maxY = Math.max(...rects.map(r => r[1] + r[3]));
    const f = eff.frames[index], [sx, sy, sw, sh] = f.sourceRect;
    const w = (maxX - minX) * f.sizeRatio[0], h = (maxY - minY) * f.sizeRatio[1];
    const cx = minX + (maxX - minX) * eff.anchor[0], cy = minY + (maxY - minY) * eff.anchor[1];
    ctx.save();
    ctx.beginPath();
    for (const r of rects) ctx.rect(...r);
    ctx.clip();
    ctx.globalAlpha = eff.opacityByStep[step];
    ctx.drawImage(img, sx, sy, sw, sh, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }

  // 沿著田塊外緣畫框線（相鄰格屬於同一塊田的邊不畫）。origin(x, y) 回傳該格左上角像素座標。
  function outline(ctx, cells, origin, cell, colour, width) {
    const has = new Set(cells.map(([x, y]) => cellKey(x, y)));
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineCap = 'square';
    ctx.beginPath();
    for (const [x, y] of cells) {
      const [ox, oy] = origin(x, y);
      if (!has.has(cellKey(x, y - 1))) { ctx.moveTo(ox, oy); ctx.lineTo(ox + cell, oy); }
      if (!has.has(cellKey(x, y + 1))) { ctx.moveTo(ox, oy + cell); ctx.lineTo(ox + cell, oy + cell); }
      if (!has.has(cellKey(x - 1, y))) { ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + cell); }
      if (!has.has(cellKey(x + 1, y))) { ctx.moveTo(ox + cell, oy); ctx.lineTo(ox + cell, oy + cell); }
    }
    ctx.stroke();
  }

  function label(ctx, text, x, y, fill, size = 22, colour = C.label) {
    ctx.font = `bold ${size}px ${FONT}`;
    const w = ctx.measureText(text).width + size;
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, size * 1.55, 8); ctx.fill();
    ctx.fillStyle = colour; ctx.textBaseline = 'middle'; ctx.fillText(text, x + size / 2, y + size * .8);
  }

  // 田地名牌：依類型的中文名稱（新手／進階／高級／專家）找名牌；木樁尖端（groundAnchor）插在 (anchorX, anchorY)。
  // 文字依 textRect 置中，字級縮到放得下。找不到名牌素材時回傳 false，由呼叫端改畫標籤。
  const signs = new Map((manifest.mainScreenAssets?.items || []).filter(i => i.layer === 'plot-label').map(i => [i.label, i]));
  function sign(ctx, typeName, text, anchorX, anchorY, width, textColour) {
    const item = signs.get(typeName), img = item && images.get(item.file);
    if (!ready(img)) return false;
    const [sx, sy, sw, sh] = item.sourceRect, k = width / sw;
    const x = anchorX - item.groundAnchor[0] * k, y = anchorY - item.groundAnchor[1] * k;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, sw * k, sh * k);
    const [tx, ty, tw, th] = item.textRect.map(v => v * k);
    let size = Math.min(item.textStyle.maxFontSize * k, th * .8);
    ctx.font = `bold ${size}px ${FONT}`;
    const w = ctx.measureText(text).width;
    if (w > tw * .92) { size *= tw * .92 / w; ctx.font = `bold ${size}px ${FONT}`; }
    ctx.fillStyle = textColour || item.textStyle.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + tx + tw / 2, y + ty + th / 2);
    ctx.textAlign = 'start';
    return true;
  }

  function floaters(ctx, list, size) {
    ctx.font = `bold ${size}px ${FONT}`; ctx.textBaseline = 'middle';
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i], age = (performance.now() - f.born) / 1400;
      if (age >= 1) { list.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 5; ctx.strokeStyle = '#fffaf0'; ctx.strokeText(f.text, f.x, f.y - age * size * 1.5);
      ctx.fillStyle = f.colour; ctx.fillText(f.text, f.x, f.y - age * size * 1.5);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- 機器人狀態換算 ----------

  const lerp = (a, b, t) => a + (b - a) * t;

  // 把機器人目前的動作換算成「位置（格座標）＋片段＋片段內經過時間」。toGrid(plotId, x, y) 回傳格座標。
  // act.kind 'decide'：判斷條件。前半段播「判斷中」或範圍掃描，act.mid 之後播成立／不成立。
  function robotView(robot, act, time, toGrid) {
    const here = toGrid(robot.plot, robot.x, robot.y);
    if (!act || act.kind === 'wait' || act.kind === 'pause' || time < act.start) return { pos: here, clip: 'idle', heading: robot.heading, elapsed: time };
    const elapsed = time - act.start, t = Math.min(1, elapsed / (act.end - act.start));
    switch (act.kind) {
      case 'travel': {
        const plot = plotById.get(act.toPlot), a = toGrid(act.fromPlot, act.from.x, act.from.y), b = toGrid(plot.id, plot.entry.x, plot.entry.y);
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const heading = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : (dy >= 0 ? 'south' : 'north');
        return { pos: [lerp(a[0], b[0], t), lerp(a[1], b[1], t)], clip: movingClip, heading: dx || dy ? heading : plot.entry.heading, elapsed };
      }
      case 'move': {
        const a = toGrid(robot.plot, act.from.x, act.from.y), b = toGrid(robot.plot, act.to.x, act.to.y);
        if (act.result === 'bump') {   // 往前衝四分之一格再彈回
          const [vx, vy] = VECTORS[act.from.heading], push = Math.sin(t * Math.PI) * 0.25;
          return { pos: [a[0] + vx * push, a[1] + vy * push], clip: movingClip, heading: act.from.heading, elapsed };
        }
        return { pos: [lerp(a[0], b[0], t), lerp(a[1], b[1], t)], clip: movingClip, heading: act.from.heading, elapsed };
      }
      case 'turnLeft': case 'turnRight':
        return { pos: here, clip: movingClip, heading: t < .5 ? act.from.heading : act.to.heading, elapsed };
      case 'sow': case 'water':
        return { pos: here, clip: act.kind, heading: robot.heading, elapsed };
      case 'harvest':
        return { pos: here, clip: 'harvest', heading: robot.heading, elapsed, crop: act.result === 'ok' ? act.crop : null, cell: act.cell };
      case 'decide':
        if (time < act.mid) return { pos: here, clip: act.scan && clips.scan ? 'scan' : decision.thinking || 'idle', heading: robot.heading, elapsed };
        return { pos: here, clip: (act.value ? decision.true : decision.false) || 'idle', heading: robot.heading, elapsed: time - act.mid };
      default:
        return { pos: here, clip: 'idle', heading: robot.heading, elapsed };
    }
  }

  // 畫機器人（含持物與想法泡泡）。centerX／centerY 是所在格子的中心像素。
  function robotAt(ctx, view, centerX, centerY, cell) {
    const size = cell * ROBOT_SCALE;
    const boxX = centerX - size / 2, boxY = centerY - cell * ROBOT_LIFT - size / 2;
    const p = pose(view.clip, clipStep(view.clip, view.elapsed), view.heading);
    const anchor = robot(ctx, boxX, boxY, size, p.row, p.frame);
    if (view.crop && p.cargoVisible) cargo(ctx, view.crop, boxX, boxY, size, p.cargoPose, anchor);
    bubble(ctx, view.clip, view.elapsed, boxX, boxY, size);
    return { boxX, boxY, size };
  }

  // 採收動畫抬起作物的那幾步，原田區植株要先藏起來（animationClips.harvest.objects.sourcePlantVisible）。
  const hidesPlant = view => view.clip === 'harvest' && view.crop && !pose('harvest', clipStep('harvest', view.elapsed), view.heading).plantVisible;
  const stageOf = growth => Math.min(3, Math.floor(growth * 3 + 1e-9));

  return { clipLength, clipStep, soil, plant, produce, sign, robotAt, scanWave, outline, label, floaters, robotView, hidesPlant, stageOf, clips, manifest };
}

// ---------- 農場盤面 ----------

// 名牌顏色已經表示類型，牌面只寫形狀，例如「T 形田」。
const SHAPE_NAME = plot => plot.name.split('・')[0] + '田';

// background:false 時不畫地板，只畫淡淡的格位線，讓頁面自己的溫室地板透出來（主畫面）。
export function createBoardRenderer(canvas, assets, { background = true } = {}) {
  // TOP：盤面上方留白，第一排田的名牌與機器人的頭才不會被切掉。
  const P = createPainter(assets), CELL = 96, TOP = CELL * 1.35, SIGN_W = CELL * 1.6, list = [];
  canvas.width = BOARD.columns * CELL;
  canvas.height = BOARD.rows * CELL + TOP;
  const ctx = canvas.getContext('2d');
  const toGrid = (plotId, x, y) => { const p = plotById.get(plotId); return [p.board[0] + x, p.board[1] + y]; };

  function draw(state, { selected } = {}) {
    const time = state.time;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (background) { ctx.fillStyle = C.floor; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.translate(0, TOP);
    const boardH = BOARD.rows * CELL;
    ctx.strokeStyle = background ? C.slot : 'rgba(38, 63, 60, .12)'; ctx.lineWidth = 2;
    for (let x = 0; x <= BOARD.columns; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, boardH); ctx.stroke(); }
    for (let y = 0; y <= BOARD.rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke(); }

    const views = state.robots.map(r => ({ robot: r, view: P.robotView(r, r.act, time, toGrid) }));
    const hidden = new Set(views.filter(v => P.hidesPlant(v.view)).map(v => v.robot.plot + '|' + v.view.cell));

    for (const plot of PLOTS) {
      const ps = state.plots[plot.id], origin = (x, y) => toGrid(plot.id, x, y).map(v => v * CELL);
      for (const [x, y] of plot.cells) P.soil(ctx, ...origin(x, y), CELL, ps.cells[cellKey(x, y)].moisture);
      P.outline(ctx, plot.cells, origin, CELL, C.outline, 6);
      P.outline(ctx, plot.cells, origin, CELL, plot.rules.colour, 3);   // 內框顏色代表田的類型
      if (selected === plot.id) P.outline(ctx, plot.cells, origin, CELL, C.selected, 5);
    }
    for (const plot of PLOTS) {
      const ps = state.plots[plot.id], origin = (x, y) => toGrid(plot.id, x, y).map(v => v * CELL);
      for (const [x, y] of [...plot.cells].sort((a, b) => a[1] - b[1])) {
        const cell = ps.cells[cellKey(x, y)];
        if (cell.crop && !hidden.has(plot.id + '|' + cellKey(x, y))) P.plant(ctx, ...origin(x, y), CELL, cell.crop, P.stageOf(cell.growth));
      }
      if (ps.crashed) {
        ctx.fillStyle = 'rgba(198, 95, 72, .35)';
        for (const [x, y] of plot.cells) ctx.fillRect(...origin(x, y), CELL, CELL);
      }
    }
    // 名牌先畫，機器人疊在上面，免得機器人在入口格時被名牌蓋住。
    for (const plot of PLOTS) {
      const ps = state.plots[plot.id];
      // 名牌插在田最上排、最左邊那格的上緣
      const topY = Math.min(...plot.cells.map(c => c[1])), leftX = Math.min(...plot.cells.filter(c => c[1] === topY).map(c => c[0]));
      const [gx, gy] = toGrid(plot.id, leftX, topY);
      const text = SHAPE_NAME(plot) + (ps.crashed ? '・當機' : '');
      if (!P.sign(ctx, plot.rules.name, text, gx * CELL + CELL * .55, gy * CELL + CELL * .12, SIGN_W, ps.crashed ? '#9b2c1c' : null)) {
        P.label(ctx, plot.name + (ps.crashed ? '・當機' : ''), gx * CELL + 4, gy * CELL + 4, ps.crashed ? C.crash : 'rgba(38, 63, 60, .82)', 20);
      }
    }
    for (const { robot, view } of views) {
      const box = P.robotAt(ctx, view, view.pos[0] * CELL + CELL / 2, view.pos[1] * CELL + CELL / 2, CELL);
      if (robot.phase === 'stuck') P.label(ctx, '！當機', box.boxX + box.size * .2, box.boxY - 8, C.crash);
    }
    P.floaters(ctx, list, 26);
  }

  function floatAt(plotId, x, y, text, colour) {
    const [gx, gy] = toGrid(plotId, x, y);
    list.push({ text, colour, x: gx * CELL + 12, y: gy * CELL + CELL * .3, born: performance.now() });
  }

  // 把滑鼠座標換成點到的田塊 id。
  function plotAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const bx = Math.floor((clientX - rect.left) / rect.width * canvas.width / CELL);
    const by = Math.floor(((clientY - rect.top) / rect.height * canvas.height - TOP) / CELL);
    const plot = PLOTS.find(p => p.cells.some(([x, y]) => p.board[0] + x === bx && p.board[1] + y === by));
    return plot ? plot.id : null;
  }

  return { draw, floatAt, plotAt, manifest: assets.manifest };
}

// ---------- 單塊田特寫 ----------

// 畫一塊田加上一圈留白（機器人撞牆、想法泡泡會超出田格）。scene：{ ps, robot, act, time, highlight }
export function createPlotView(canvas, plot, assets) {
  const P = createPainter(assets), CELL = 128, MARGIN = 1, list = [];
  const xs = plot.cells.map(c => c[0]), ys = plot.cells.map(c => c[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const cols = Math.max(...xs) - minX + 1 + MARGIN * 2, rows = Math.max(...ys) - minY + 1 + MARGIN * 2;
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d');
  const toGrid = (_, x, y) => [x - minX + MARGIN, y - minY + MARGIN];
  const origin = (x, y) => toGrid(null, x, y).map(v => v * CELL);
  const rects = plot.cells.map(([x, y]) => [...origin(x, y), CELL, CELL]);

  function draw({ ps, robot, act, time, marks = [] }) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = C.floor; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = C.slot; ctx.lineWidth = 2;
    for (let x = 0; x <= cols; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke(); }

    const view = P.robotView(robot, act, time, toGrid);
    for (const [x, y] of plot.cells) P.soil(ctx, ...origin(x, y), CELL, ps.cells[cellKey(x, y)].moisture);
    // 入口標記：機器人每次從這裡出發
    const [ex, ey] = origin(plot.entry.x, plot.entry.y);
    ctx.strokeStyle = 'rgba(255, 250, 240, .85)'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
    ctx.strokeRect(ex + 8, ey + 8, CELL - 16, CELL - 16); ctx.setLineDash([]);
    P.outline(ctx, plot.cells, origin, CELL, C.outline, 8);
    P.outline(ctx, plot.cells, origin, CELL, plot.rules.colour, 4);
    for (const [x, y] of [...plot.cells].sort((a, b) => a[1] - b[1])) {
      const cell = ps.cells[cellKey(x, y)];
      if (cell.crop && !(P.hidesPlant(view) && view.cell === cellKey(x, y))) P.plant(ctx, ...origin(x, y), CELL, cell.crop, P.stageOf(cell.growth));
    }
    // 過關檢查標出的問題格子：紅色粗框閃爍
    if (marks.length) {
      ctx.strokeStyle = C.crash; ctx.lineWidth = 7; ctx.globalAlpha = .55 + .45 * Math.sin(performance.now() / 260);
      for (const m of marks) { const [mx, my] = origin(m.x, m.y); ctx.strokeRect(mx + 6, my + 6, CELL - 12, CELL - 12); }
      ctx.globalAlpha = 1;
    }
    if (view.clip === 'scan') P.scanWave(ctx, P.clipStep('scan', view.elapsed), rects);
    P.robotAt(ctx, view, view.pos[0] * CELL + CELL / 2, view.pos[1] * CELL + CELL / 2, CELL);
    P.floaters(ctx, list, 34);
  }

  function floatAt(x, y, text, colour) {
    const [ox, oy] = origin(x, y);
    list.push({ text, colour, x: ox + 14, y: oy + CELL * .25, born: performance.now() });
  }

  return { draw, floatAt, painter: P };
}
