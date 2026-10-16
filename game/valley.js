// 主畫面的山谷農田：略俯視的正交視角（manifest.valleyFarm），比素材規格再壓深一點、田畦再厚一點（使用者 2026-10-16 選 A）。
//
// 立體感的三個線索：
//   1. 田面壓扁（TILE_H < TILE_W），田下緣沒有相鄰田的地方露出土壁（valleyFarm.terrain.frontRule）
//   2. 直立物（作物、機器人、名牌、木樁）腳下一塊硬邊影子
//   3. 所有直立物依落地位置排序，越前面越晚畫，前排的作物會擋住後排（valleyFarm.depthOrder）
// 已開放的地用木樁繩子圍起來（manifest.landBoundary），未開放的地就是草地。
// 模擬層不知道這些：田仍用局部座標，這裡只負責「格子 → 畫面」與反過來的點擊換算。

import { PLOTS, BOARD, plotById, cellKey, toBoard, placedCells } from './plots.js';
import { createPainter } from './render.js';

const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
const TILE_W = 96, TILE_H = 60, FRONT = 20;   // 素材規格是 64×48、土壁 4px；這裡加深成 64×40、土壁約 13px
const K = TILE_W / 64;                        // 素材規格以 64px 寬的格子為準
const SHADOW = 'rgba(38, 63, 60, .26)';
const KIND_ORDER = { rope: 0, post: 0.5, plant: 1, robot: 2, sign: 3 };

export function createValleyRenderer(canvas, assets) {
  const P = createPainter(assets), { manifest, images } = assets;
  const valley = manifest.valleyFarm, fence = manifest.landBoundary;
  const ready = img => img && img.complete && img.naturalWidth;
  const TOP = TILE_W * 1.7, BOTTOM = FRONT + TILE_W * .4;   // 上方留給第一排的名牌與機器人，下方留給土壁
  canvas.width = BOARD.columns * TILE_W;
  canvas.height = TOP + BOARD.rows * TILE_H + BOTTOM;
  const ctx = canvas.getContext('2d');
  const list = [];

  let layout = {};
  const toGrid = (plotId, x, y) => toBoard(plotById.get(plotId), layout[plotId], x, y);
  const turnOf = plotId => layout[plotId].rot;
  const sx = gx => gx * TILE_W, sy = gy => gy * TILE_H;   // 格座標 → 畫面（已平移 TOP）
  const origin = (x, y) => [sx(x), sy(y)];

  // ---------- 元件 ----------

  function front(x, y, moisture) {
    const f = valley?.assets.soilFront, img = f && images.get(f.file), frame = f?.frames.find(fr => fr.soilIndex === moisture);
    if (!ready(img) || !frame) { ctx.fillStyle = ['#a8885f', '#86613f', '#5f412d', '#3f5a5c'][moisture]; ctx.fillRect(x, y, TILE_W, FRONT); return; }
    ctx.drawImage(img, ...frame.sourceRect, x, y, TILE_W, FRONT);
  }

  // 硬邊影子：左上光源，影子略往右下
  function shadow(groundX, groundY, width) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath(); ctx.roundRect(groundX - width / 2 + 3, groundY - 4, width, 9, 4); ctx.fill();
  }

  // 木樁與繩：只在已開放範圍的外緣（鄰格不在範圍內的邊），每個頂點一根樁。
  function fenceItems(open) {
    if (!fence) return [];
    const items = [], vertices = new Map();
    for (const key of open) {
      const [x, y] = key.split(',').map(Number);
      for (const side of fence.geometry.sides) {
        if (open.has(cellKey(x + side.neighbor[0], y + side.neighbor[1]))) continue;
        const a = [x + side.start[0], y + side.start[1]], b = [x + side.end[0], y + side.end[1]];
        items.push({ kind: 'rope', gx: (a[0] + b[0]) / 2, gy: (a[1] + b[1]) / 2, draw: () => rope(side.part, a, b) });
        for (const v of [a, b]) vertices.set(cellKey(...v), v);
      }
    }
    for (const v of vertices.values()) items.push({ kind: 'post', gx: v[0], gy: v[1], draw: () => post(v) });
    return items;
  }

  function rope(partName, a, b) {
    const part = fence.parts[partName], img = images.get(fence.atlas);
    const lift = fence.placement.ropeElevation * K, thick = part.displayThickness * K;
    const [x1, y1] = [sx(a[0]), sy(a[1]) - lift], [x2, y2] = [sx(b[0]), sy(b[1]) - lift];
    if (!ready(img)) { ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = thick; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); return; }
    const [er] = part.endpointRatios;
    if (partName === 'horizontal') ctx.drawImage(img, ...part.sourceRect, x1, y1 - er[1] * thick, x2 - x1, thick);
    else ctx.drawImage(img, ...part.sourceRect, x1 - er[0] * thick, y1, thick, y2 - y1);
  }

  function post(v) {
    const part = fence.parts.post, img = images.get(fence.atlas), [, , w, h] = part.sourceRect;
    const [bw, bh] = part.recommendedDisplaySize.map(n => n * K), k = Math.min(bw / w, bh / h);
    const gx = sx(v[0]), gy = sy(v[1]);
    if (!ready(img)) { ctx.fillStyle = '#7a5530'; ctx.fillRect(gx - 3, gy - bh, 6, bh); return; }
    ctx.drawImage(img, ...part.sourceRect, gx - part.groundAnchor[0] * k, gy - part.groundAnchor[1] * k, w * k, h * k);
  }

  // ---------- 每格畫面 ----------

  // ghost：拖曳中的田（吸附格子）；land：排列模式標出可以買的格子。參數與 render.js 的盤面相同。
  function draw(state, { selected, ghost, land } = {}) {
    const time = state.time;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(0, TOP);
    layout = ghost ? { ...state.layout, [ghost.plotId]: ghost.place } : state.layout;
    const shown = PLOTS.filter(p => layout[p.id]);
    const open = new Set(state.land);

    // 已開放的地：淡淡提亮，配上外圍木樁繩子，看得出哪裡能放田
    ctx.fillStyle = 'rgba(240, 228, 187, .16)';
    for (const key of open) { const [x, y] = key.split(',').map(Number); ctx.fillRect(sx(x), sy(y), TILE_W, TILE_H); }
    if (land) buyableMarks(land);

    // 1. 地面：田面
    const occupied = new Set(), cellOf = new Map();
    for (const plot of shown) {
      const ps = state.plots[plot.id];
      for (const [x, y] of plot.cells) {
        const [bx, by] = toGrid(plot.id, x, y), cell = ps.cells[cellKey(x, y)];
        occupied.add(cellKey(bx, by)); cellOf.set(cellKey(bx, by), cell);
        P.soil(ctx, sx(bx), sy(by), TILE_W, cell.moisture, TILE_H);
      }
    }
    // 2. 土壁：南側鄰格不是田才露出來（跨田區也不畫內牆）
    for (const [key, cell] of cellOf) {
      const [x, y] = key.split(',').map(Number);
      if (!occupied.has(cellKey(x, y + 1))) front(sx(x), sy(y + 1), cell.moisture);
    }
    // 3. 田的框線、當機、選取、拖曳預覽（都畫在田面上）
    for (const plot of shown) {
      const ps = state.plots[plot.id], cells = placedCells(plot, layout[plot.id]);
      P.outline(ctx, cells, origin, TILE_W, 'rgba(38, 63, 60, .9)', 4, TILE_H);
      P.outline(ctx, cells, origin, TILE_W, plot.rules.colour, 2, TILE_H);
      if (selected === plot.id) P.outline(ctx, cells, origin, TILE_W, '#f0cf7e', 5, TILE_H);
      if (ps.crashed) { ctx.fillStyle = 'rgba(198, 95, 72, .35)'; for (const [x, y] of cells) ctx.fillRect(sx(x), sy(y), TILE_W, TILE_H); }
      if (ghost?.plotId === plot.id) {
        ctx.fillStyle = ghost.valid ? 'rgba(143, 199, 163, .45)' : 'rgba(198, 95, 72, .55)';
        for (const [x, y] of cells) ctx.fillRect(sx(x), sy(y), TILE_W, TILE_H);
        P.outline(ctx, cells, origin, TILE_W, ghost.valid ? '#2f7d4a' : '#9b2c1c', 5, TILE_H);
      }
    }
    if (ghost && state.layout[ghost.plotId]) {
      ctx.setLineDash([12, 10]);
      P.outline(ctx, placedCells(plotById.get(ghost.plotId), state.layout[ghost.plotId]), origin, TILE_W, 'rgba(38, 63, 60, .75)', 3, TILE_H);
      ctx.setLineDash([]);
    }

    // 4. 直立物：先收集，依落地位置排序再畫
    const items = fenceItems(open);
    const views = state.robots.filter(r => r.plot && layout[r.plot]).map(r => ({ robot: r, view: P.robotView(r, r.act, time, toGrid, turnOf) }));
    const hidden = new Set(views.filter(v => P.hidesPlant(v.view)).map(v => v.robot.plot + '|' + v.view.cell));
    for (const plot of shown) {
      const ps = state.plots[plot.id];
      for (const [x, y] of plot.cells) {
        const cell = ps.cells[cellKey(x, y)];
        if (!cell.crop || hidden.has(plot.id + '|' + cellKey(x, y))) continue;
        const [bx, by] = toGrid(plot.id, x, y), groundX = sx(bx + .5), groundY = sy(by) + TILE_H * .7;
        items.push({ kind: 'plant', gx: bx + .5, gy: by + .7, draw: () => {
          shadow(groundX, groundY, TILE_W * .42);
          P.plantAt(ctx, groundX, groundY, TILE_W * 1.1, cell.crop, P.stageOf(cell.growth));
        } });
      }
      // 名牌插在田（盤面上）最上排、最左邊那格的上緣
      const cells = placedCells(plot, layout[plot.id]);
      const gy = Math.min(...cells.map(c => c[1])), gx = Math.min(...cells.filter(c => c[1] === gy).map(c => c[0]));
      const text = plot.name.split('・')[0] + '田' + (ps.crashed ? '・當機' : '');
      items.push({ kind: 'sign', gx: gx + .55, gy: gy + .1, draw: () => {
        const ax = sx(gx) + TILE_W * .55, ay = sy(gy) + TILE_H * .1;
        shadow(ax, ay, TILE_W * .22);
        if (!P.sign(ctx, plot.rules.name, text, ax, ay, TILE_W * 1.35, ps.crashed ? '#9b2c1c' : null)) {
          P.label(ctx, text, sx(gx) + 4, sy(gy) - 30, 'rgba(38, 63, 60, .82)', 20);
        }
      } });
    }
    for (const { robot, view } of views) {
      const groundX = sx(view.pos[0] + .5), groundY = sy(view.pos[1]) + TILE_H * .62;
      items.push({ kind: 'robot', gx: view.pos[0] + .5, gy: view.pos[1] + .62, draw: () => {
        shadow(groundX, groundY + 6, TILE_W * .5);
        const box = P.robotAt(ctx, view, groundX, groundY, TILE_W);
        if (robot.phase === 'stuck') P.label(ctx, '！當機', box.boxX + box.size * .2, box.boxY - 8, '#c65f48');
      } });
    }
    items.sort((a, b) => a.gy - b.gy || a.gx - b.gx || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    for (const item of items) item.draw();

    P.floaters(ctx, list, 26);
  }

  // 排列模式：草地上可以買的格子用虛線框加「+」，點過一次的顯示價格。
  function buyableMarks(land) {
    ctx.font = `bold 22px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [x, y] of land.buyable) {
      const pending = land.pending && land.pending[0] === x && land.pending[1] === y;
      ctx.fillStyle = pending ? 'rgba(38, 63, 60, .55)' : 'rgba(38, 63, 60, .22)';
      ctx.fillRect(sx(x) + 4, sy(y) + 4, TILE_W - 8, TILE_H - 8);
      ctx.strokeStyle = pending ? '#f0cf7e' : 'rgba(255, 250, 240, .8)'; ctx.lineWidth = pending ? 5 : 3;
      ctx.setLineDash(pending ? [] : [8, 8]); ctx.strokeRect(sx(x) + 4, sy(y) + 4, TILE_W - 8, TILE_H - 8); ctx.setLineDash([]);
      ctx.fillStyle = '#fffaf0';
      ctx.fillText(pending ? `買 ${land.price}・再點一下` : '+', sx(x) + TILE_W / 2, sy(y) + TILE_H / 2);
    }
    ctx.textAlign = 'start';
  }

  function floatAt(plotId, x, y, text, colour) {
    if (!layout[plotId]) return;
    const [gx, gy] = toGrid(plotId, x, y);
    list.push({ text, colour, x: sx(gx) + 12, y: sy(gy) - TILE_H * .2, born: performance.now() });
  }

  // 點擊換算只反推田面（土壁是裝飾，不算格子）。
  function cellAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor((clientX - rect.left) / rect.width * canvas.width / TILE_W),
      y: Math.floor(((clientY - rect.top) / rect.height * canvas.height - TOP) / TILE_H),
    };
  }

  function plotAt(clientX, clientY) {
    const { x: bx, y: by } = cellAt(clientX, clientY);
    const plot = PLOTS.find(p => layout[p.id] && placedCells(p, layout[p.id]).some(([x, y]) => x === bx && y === by));
    return plot ? plot.id : null;
  }

  return { draw, floatAt, plotAt, cellAt, manifest, cell: TILE_W, tileH: TILE_H, front: FRONT, top: TOP, valley: true };
}

// ---------- 背景：遠山、林緣、草地、農舍 ----------
// 照 valleyFarm.environment.layers 的比例與前後（rect 是整個場景的 0～1 比例），只在大小改變時重畫，平常零成本。
export function drawValleyBackdrop(canvas, assets) {
  const { manifest, images } = assets, v = manifest.valleyFarm, env = v.environment;
  const ready = img => img && img.complete && img.naturalWidth;
  const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = env.skyColor; ctx.fillRect(0, 0, w, h);
  for (const layer of [...env.layers].sort((a, b) => a.z - b.z)) {
    const asset = v.assets[layer.asset], img = images.get(asset.file);
    const [rx, ry, rw, rh] = [layer.rect[0] * w, layer.rect[1] * h, layer.rect[2] * w, layer.rect[3] * h];
    if (layer.repeat) {
      ctx.fillStyle = asset.baseColor || env.groundColor; ctx.fillRect(rx, ry, rw, rh);
      if (!ready(img)) continue;
      const [tw, th] = asset.repeatDisplaySize;
      for (let y = ry; y < ry + rh; y += th) for (let x = rx; x < rx + rw; x += tw) ctx.drawImage(img, ...asset.sourceRect, x, y, tw, th);
    } else if (ready(img)) {
      ctx.drawImage(img, ...asset.sourceRect, rx, ry, rw, rh);
    }
  }
  // 農舍：站在左側林緣前的草地上
  const house = v.assets.farmhouse, himg = house && images.get(house.file);
  if (ready(himg)) {
    const [, , sw, sh] = house.sourceRect, dh = Math.min(h * .26, 220), k = dh / sh;
    const groundX = Math.max(16, w * .04) + house.groundAnchor[0] * k, groundY = h * .43;
    ctx.fillStyle = 'rgba(38, 63, 60, .26)';
    ctx.beginPath(); ctx.roundRect(groundX - sw * k * .42 + 4, groundY - 6, sw * k * .86, 12, 6); ctx.fill();
    ctx.drawImage(himg, ...house.sourceRect, groundX - house.groundAnchor[0] * k, groundY - house.groundAnchor[1] * k, sw * k, sh * k);
  }
}

// 鏡頭：開放範圍（加一圈可擴地的草地）在 canvas 原始像素裡的範圍，給頁面把它放大到填滿畫面。
export function landView(state, renderer) {
  const cells = state.land.map(k => k.split(',').map(Number));
  const margin = 1;
  const minX = Math.max(0, Math.min(...cells.map(c => c[0])) - margin), maxX = Math.min(BOARD.columns - 1, Math.max(...cells.map(c => c[0])) + margin);
  const minY = Math.max(0, Math.min(...cells.map(c => c[1])) - margin), maxY = Math.min(BOARD.rows - 1, Math.max(...cells.map(c => c[1])) + margin);
  const { cell, tileH, top, front } = renderer;
  return {
    x: minX * cell, y: top + minY * tileH - top * .75,   // 上方多留名牌與機器人的高度
    width: (maxX - minX + 1) * cell, height: (maxY - minY + 1) * tileH + top * .75 + front + 10,
  };
}
