// 遊戲畫面：依 assets/manifest.json 與 alignment.js 的數據畫土壤、作物、機器人與持物。
// 只讀數據，不依賴 app.js 的播放邏輯（AGENTS.md）。數據缺少的規則記在 docs/GAME_EVENTS.md 的「數據疑問」。

import { PLOTS, BOARD, plotById, cellKey } from './plots.js';

export const CELL = 96;
const ROBOT_SIZE = CELL * 1.4;     // 機器人 416 畫布對應到畫面上的邊長
const ROBOT_LIFT = CELL * 0.32;    // 機身中心比格子中心高多少
const C = { floor: '#e7dcb8', slot: '#ddd0a6', outline: '#263f3c', selected: '#8fc7a3', crash: '#c65f48', label: '#fffaf0' };

export async function createRenderer(canvas) {
  const response = await fetch('assets/manifest.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('素材數據讀取失敗：' + response.status);
  const manifest = await response.json();
  const align = typeof spriteAlignment !== 'undefined' ? spriteAlignment : null;   // 由 alignment.js 以一般 script 載入
  if (!align) throw new Error('alignment.js 沒有載入');

  const { rendering, animationClips: clips, movement } = manifest;
  const cropById = new Map(manifest.crops.map(c => [c.id, c]));
  const produceById = new Map(manifest.produce.map(p => [p.id, p]));
  const lookup = path => path.reduce((v, k) => v[k], align);

  // 載入所有用得到的圖。
  const files = new Set([rendering.soil.atlas, ...manifest.crops.map(c => c.atlas), ...manifest.produce.map(p => p.file),
    ...Object.values(rendering.robotPoses).map(p => p.atlas)]);
  const images = new Map();
  await Promise.all([...files].map(file => new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = 'assets/' + file + '?v=' + encodeURIComponent(manifest.version);
    images.set(file, img);
  })));
  const ready = img => img && img.complete && img.naturalWidth;

  canvas.width = BOARD.columns * CELL;
  canvas.height = BOARD.rows * CELL;
  const ctx = canvas.getContext('2d');
  const floaters = [];

  const cellOrigin = (plot, x, y) => [(plot.board[0] + x) * CELL, (plot.board[1] + y) * CELL];

  // ---------- 動畫片段 ----------

  // 依經過時間回傳片段中的第幾格；循環片段一直轉，非循環片段停在最後一格。
  function clipFrame(name, elapsed) {
    const clip = clips[name];
    const durations = clip.frameDurationsMs || clip.frameOrder.map(() => clip.frameDurationMs);
    const total = durations.reduce((a, b) => a + b, 0);
    let t = clip.loop ? elapsed % total : Math.min(elapsed, total - 1);
    for (let i = 0; i < durations.length; i++) {
      if (t < durations[i]) return i;
      t -= durations[i];
    }
    return durations.length - 1;
  }
  const headingIndex = heading => movement.headingOrder.indexOf(heading);

  // 回傳這一格要畫哪個 pose、哪一格，以及持物與原植株的顯示狀態。
  function pose(name, step, heading) {
    const clip = clips[name];
    const row = clip.poseRows.length > 1 ? clip.poseRows[headingIndex(heading)] : clip.poseRows[0];
    return {
      row, frame: clip.frameOrder[step],
      cargoVisible: clip.objects.cargoVisible[step], cargoPose: clip.objects.cargoPose[step], plantVisible: clip.objects.sourcePlantVisible[step],
    };
  }

  // ---------- 繪圖元件 ----------

  function drawSoil(x, y, moisture) {
    const img = images.get(rendering.soil.atlas), b = manifest.pixelBoundaries;
    if (!ready(img)) { ctx.fillStyle = ['#c6a376', '#a67950', '#77513b', '#5f7f8a'][moisture]; ctx.fillRect(x, y, CELL, CELL); return; }
    ctx.drawImage(img, b[moisture], b[0], b[moisture + 1] - b[moisture], b[1] - b[0], x, y, CELL, CELL);
  }

  function drawPlant(x, y, cropId, stage) {
    const crop = cropById.get(cropId), img = crop && images.get(crop.atlas);
    if (!ready(img)) return;
    const f = crop.frames[stage], [sx, sy, sw, sh] = f.sourceRect;
    const [canvasW] = rendering.plantCanvas, [rootX, rootY] = rendering.plantRoot;
    const k = CELL / canvasW * f.scale;
    const dx = x + CELL * rootX / canvasW - f.root[0] * k, dy = y + CELL * rootY / canvasW - f.root[1] * k;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw * k, sh * k);
  }

  // 依外殼中心與高度對齊：外殼高度縮放成 bodyHeight，中心放在 bodyCenter（再加上漂浮位移）。
  function drawRobot(boxX, boxY, row, frameIndex) {
    const p = rendering.robotPoses[row], f = p.frames[frameIndex], img = images.get(p.atlas);
    if (!ready(img)) { ctx.fillStyle = '#f0e4bb'; ctx.fillRect(boxX + ROBOT_SIZE * .35, boxY + ROBOT_SIZE * .35, ROBOT_SIZE * .3, ROBOT_SIZE * .3); return null; }
    const [cx, cy, shell] = lookup(f.alignmentPath), [sx, sy, sw, sh] = f.sourceRect;
    const unit = ROBOT_SIZE / align.canvas, k = align.bodyHeight / shell * unit;
    const bob = f.bobIndex == null ? 0 : align.bob[f.bobIndex];
    const ox = boxX + align.bodyCenter[0] * unit - (cx - sx) * k;
    const oy = boxY + (align.bodyCenter[1] + bob) * unit - (cy - sy) * k;
    ctx.drawImage(img, sx, sy, sw, sh, ox, oy, sw * k, sh * k);
    // 持物錨點（手掌）換算到畫面座標。
    if (f.cargoAnchorPath) { const [hx, hy] = lookup(f.cargoAnchorPath); return [ox + (hx - sx) * k, oy + (hy - sy) * k]; }
    return null;
  }

  function drawProduce(cropId, centerX, bottomY, size) {
    const item = produceById.get(cropId), img = item && images.get(item.file);
    if (!ready(img)) return;
    const [sx, sy, sw, sh] = item.sourceRect, [canvasW] = rendering.produce.canvas;
    const k = size * rendering.produce.maxContentSize / canvasW / Math.max(sw, sh);
    const baseline = bottomY - size * (1 - rendering.produce.baseline / canvasW);
    ctx.drawImage(img, sx, sy, sw, sh, centerX - sw * k / 2, baseline - sh * k, sw * k, sh * k);
  }

  function drawCargo(cropId, boxX, boxY, cargoPose, anchor) {
    const size = ROBOT_SIZE * rendering.cargo.widthRatio;
    if (cargoPose === 'held' && anchor) return drawProduce(cropId, anchor[0], anchor[1], size);
    const spot = rendering.cargo[cargoPose] || rendering.cargo.fallback;
    drawProduce(cropId, boxX + spot.leftRatio * ROBOT_SIZE, boxY + ROBOT_SIZE * (1 - spot.bottomRatio), size);
  }

  // 沿著田塊外緣畫框線（相鄰格屬於同一塊田的邊不畫）。
  function outlinePlot(plot, colour, width) {
    const has = new Set(plot.cells.map(([x, y]) => cellKey(x, y)));
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineCap = 'square';
    ctx.beginPath();
    for (const [x, y] of plot.cells) {
      const [ox, oy] = cellOrigin(plot, x, y);
      if (!has.has(cellKey(x, y - 1))) { ctx.moveTo(ox, oy); ctx.lineTo(ox + CELL, oy); }
      if (!has.has(cellKey(x, y + 1))) { ctx.moveTo(ox, oy + CELL); ctx.lineTo(ox + CELL, oy + CELL); }
      if (!has.has(cellKey(x - 1, y))) { ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + CELL); }
      if (!has.has(cellKey(x + 1, y))) { ctx.moveTo(ox + CELL, oy); ctx.lineTo(ox + CELL, oy + CELL); }
    }
    ctx.stroke();
  }

  function label(text, x, y, fill, colour = C.label) {
    ctx.font = 'bold 22px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
    const w = ctx.measureText(text).width + 20;
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, 34, 8); ctx.fill();
    ctx.fillStyle = colour; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 10, y + 18);
  }

  // ---------- 機器人狀態換算 ----------

  const lerp = (a, b, t) => a + (b - a) * t;
  const boardPos = (plotId, x, y) => { const p = plotById.get(plotId); return [p.board[0] + x, p.board[1] + y]; };

  function robotView(robot, time) {
    const act = robot.act;
    const here = boardPos(robot.plot, robot.x, robot.y);
    if (!act || act.kind === 'wait' || time < act.start) return { pos: here, clip: 'idle', heading: robot.heading, elapsed: time };
    const elapsed = time - act.start, t = Math.min(1, elapsed / (act.end - act.start));
    switch (act.kind) {
      case 'travel': {
        const plot = plotById.get(act.toPlot), a = boardPos(act.fromPlot, act.from.x, act.from.y), b = boardPos(plot.id, plot.entry.x, plot.entry.y);
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const heading = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : (dy >= 0 ? 'south' : 'north');
        return { pos: [lerp(a[0], b[0], t), lerp(a[1], b[1], t)], clip: movingClip(), heading: dx || dy ? heading : plot.entry.heading, elapsed };
      }
      case 'move': {
        const a = boardPos(robot.plot, act.from.x, act.from.y), b = boardPos(robot.plot, act.to.x, act.to.y);
        if (act.result === 'bump') {   // 往前衝四分之一格再彈回
          const [vx, vy] = { south: [0, 1], west: [-1, 0], north: [0, -1], east: [1, 0] }[act.from.heading];
          const push = Math.sin(t * Math.PI) * 0.25;
          return { pos: [a[0] + vx * push, a[1] + vy * push], clip: movingClip(), heading: act.from.heading, elapsed };
        }
        return { pos: [lerp(a[0], b[0], t), lerp(a[1], b[1], t)], clip: movingClip(), heading: act.from.heading, elapsed };
      }
      case 'turnLeft': case 'turnRight':
        return { pos: here, clip: movingClip(), heading: t < .5 ? act.from.heading : act.to.heading, elapsed };
      case 'sow': case 'water':
        return { pos: here, clip: act.kind, heading: robot.heading, elapsed };
      case 'harvest':
        return { pos: here, clip: 'harvest', heading: robot.heading, elapsed, crop: act.result === 'ok' ? act.crop : null, cell: act.cell };
      default:
        return { pos: here, clip: 'idle', heading: robot.heading, elapsed };
    }
  }
  const movingClip = () => manifest.playback.directionalClips.empty;

  // ---------- 每格畫面 ----------

  function draw(state, { selected } = {}) {
    const time = state.time;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = C.floor; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 盤面格位
    ctx.strokeStyle = C.slot; ctx.lineWidth = 2;
    for (let x = 0; x <= BOARD.columns; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= BOARD.rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke(); }

    const views = state.robots.map(r => ({ robot: r, view: robotView(r, time) }));
    // 採收動畫抬起作物的那幾格，原田區植株要先藏起來（animationClips.harvest.objects.sourcePlantVisible）。
    const hidden = new Set();
    for (const { robot, view } of views) {
      if (view.clip === 'harvest' && view.crop) {
        const step = clipFrame('harvest', view.elapsed);
        if (!pose('harvest', step, view.heading).plantVisible) hidden.add(robot.plot + '|' + view.cell);
      }
    }

    for (const plot of PLOTS) {
      const ps = state.plots[plot.id];
      for (const [x, y] of plot.cells) drawSoil(...cellOrigin(plot, x, y), ps.cells[cellKey(x, y)].moisture);
      outlinePlot(plot, C.outline, 6);
      outlinePlot(plot, plot.rules.colour, 3);   // 內框顏色代表田的類型
      if (selected === plot.id) outlinePlot(plot, C.selected, 5);
    }
    for (const plot of PLOTS) {
      const ps = state.plots[plot.id];
      for (const [x, y] of [...plot.cells].sort((a, b) => a[1] - b[1])) {
        const cell = ps.cells[cellKey(x, y)];
        if (!cell.crop || hidden.has(plot.id + '|' + cellKey(x, y))) continue;
        drawPlant(...cellOrigin(plot, x, y), cell.crop, Math.min(3, Math.floor(cell.growth * 3 + 1e-9)));
      }
      if (ps.crashed) {
        ctx.fillStyle = 'rgba(198, 95, 72, .35)';
        for (const [x, y] of plot.cells) ctx.fillRect(...cellOrigin(plot, x, y), CELL, CELL);
      }
    }

    for (const { robot, view } of views) {
      const boxX = view.pos[0] * CELL + CELL / 2 - ROBOT_SIZE / 2;
      const boxY = view.pos[1] * CELL + CELL / 2 - ROBOT_LIFT - ROBOT_SIZE / 2;
      const step = clipFrame(view.clip, view.elapsed);
      const p = pose(view.clip, step, view.heading);
      const anchor = drawRobot(boxX, boxY, p.row, p.frame);
      if (view.crop && p.cargoVisible) drawCargo(view.crop, boxX, boxY, p.cargoPose, anchor);
      if (robot.phase === 'stuck') label('！當機', boxX + ROBOT_SIZE * .2, boxY - 8, C.crash);
    }

    for (const plot of PLOTS) {
      const ps = state.plots[plot.id], [ox, oy] = cellOrigin(plot, 0, 0);
      const minX = Math.min(...plot.cells.map(c => c[0])) * CELL;
      label(plot.name + (ps.crashed ? '・當機' : ''), ox + minX + 4, oy + 4, ps.crashed ? C.crash : 'rgba(38, 63, 60, .82)');
    }

    // 浮動文字（採收金額、撞到、白做）
    ctx.font = 'bold 26px "Noto Sans TC", "PingFang TC", sans-serif'; ctx.textBaseline = 'middle';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i], age = (performance.now() - f.born) / 1400;
      if (age >= 1) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 5; ctx.strokeStyle = '#fffaf0'; ctx.strokeText(f.text, f.x, f.y - age * 40);
      ctx.fillStyle = f.colour; ctx.fillText(f.text, f.x, f.y - age * 40);
      ctx.globalAlpha = 1;
    }
  }

  function floatAt(plotId, x, y, text, colour) {
    const plot = plotById.get(plotId);
    const [ox, oy] = cellOrigin(plot, x, y);
    floaters.push({ text, colour, x: ox + 12, y: oy + CELL * .3, born: performance.now() });
  }

  // 把滑鼠座標換成點到的田塊 id。
  function plotAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const bx = Math.floor((clientX - rect.left) / rect.width * BOARD.columns);
    const by = Math.floor((clientY - rect.top) / rect.height * BOARD.rows);
    const plot = PLOTS.find(p => p.cells.some(([x, y]) => p.board[0] + x === bx && p.board[1] + y === by));
    return plot ? plot.id : null;
  }

  return { draw, floatAt, plotAt, manifest };
}

