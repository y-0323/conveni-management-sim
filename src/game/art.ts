// ドット絵をコードで描く。外部素材を使わないので M1 はライセンスの心配がない（M5 で素材差し替え予定）
import Phaser from 'phaser';
import { BUILDINGS, groundAt, MAP_H, MAP_W, TILE, type Building } from '../data/town';

type Ctx = CanvasRenderingContext2D;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function shade(c: number, f: number): string {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

// 決定的な疑似乱数（タイル座標から）
function noise(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function px(ctx: Ctx, color: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawGround(ctx: Ctx) {
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const g = groundAt(tx, ty);
      const x = tx * TILE;
      const y = ty * TILE;
      switch (g) {
        case 'grass': {
          px(ctx, '#7fb85a', x, y, TILE, TILE);
          for (let i = 0; i < 6; i++) {
            const nx = Math.floor(noise(tx, ty, i) * 15);
            const ny = Math.floor(noise(ty, tx, i + 9) * 15);
            px(ctx, i % 2 ? '#6aa64a' : '#93c96b', x + nx, y + ny, 1, 2);
          }
          break;
        }
        case 'road': {
          px(ctx, '#4a4e5a', x, y, TILE, TILE);
          px(ctx, '#53586a', x + Math.floor(noise(tx, ty) * 14), y + Math.floor(noise(ty, tx) * 14), 2, 1);
          // 中央線
          if (ty === 10 || ty === 23) for (let i = 0; i < TILE; i += 8) px(ctx, '#e8d27a', x + i, y + TILE - 1, 5, 1);
          if (tx === 14 || tx === 33) for (let i = 0; i < TILE; i += 8) px(ctx, '#e8d27a', x + TILE - 1, y + i, 1, 5);
          break;
        }
        case 'crosswalk': {
          px(ctx, '#4a4e5a', x, y, TILE, TILE);
          const vertical = ty === 10 || ty === 11 || ty === 23 || ty === 24;
          for (let i = 1; i < TILE; i += 4) {
            if (vertical) px(ctx, '#e9ecef', x + i, y + 1, 2, TILE - 2);
            else px(ctx, '#e9ecef', x + 1, y + i, TILE - 2, 2);
          }
          break;
        }
        case 'sidewalk': {
          px(ctx, '#c9c2b6', x, y, TILE, TILE);
          px(ctx, '#b8b0a3', x, y, TILE, 1);
          px(ctx, '#b8b0a3', x, y, 1, TILE);
          px(ctx, '#b8b0a3', x + 8, y + 8, TILE - 8, 1);
          break;
        }
        case 'plaza': {
          px(ctx, '#d8cfc0', x, y, TILE, TILE);
          if ((tx + ty) % 2 === 0) px(ctx, '#cfc4b2', x, y, TILE, TILE);
          break;
        }
        case 'rail': {
          px(ctx, '#8a7f72', x, y, TILE, TILE);
          for (let i = 2; i < TILE; i += 5) px(ctx, '#5e4b3c', x + i, y + 2, 2, 12);
          px(ctx, '#adb5bd', x, y + 4, TILE, 1);
          px(ctx, '#adb5bd', x, y + 11, TILE, 1);
          break;
        }
      }
    }
  }
}

function windows(ctx: Ctx, lit: Ctx, bl: Building, x0: number, y0: number, w: number, h: number, color: string, step = 6, size = 3) {
  for (let y = y0; y + size <= y0 + h; y += step) {
    for (let x = x0; x + size <= x0 + w; x += step) {
      px(ctx, color, x, y, size, size);
      if (noise(x, y, bl.x) > 0.35) px(lit, '#ffe08a', x, y, size, size);
    }
  }
}

function drawTree(ctx: Ctx, x: number, y: number) {
  px(ctx, 'rgba(0,0,0,0.18)', x + 2, y + 11, 12, 4);
  px(ctx, '#6b4f2a', x + 7, y + 9, 2, 5);
  px(ctx, '#2f6b3a', x + 2, y + 2, 12, 9);
  px(ctx, '#2f6b3a', x + 4, y, 8, 12);
  px(ctx, '#3f8a4a', x + 4, y + 2, 7, 6);
  px(ctx, '#57a85f', x + 5, y + 3, 3, 2);
}

function drawBuilding(ctx: Ctx, lit: Ctx, bl: Building) {
  const x = bl.x * TILE;
  const y = bl.y * TILE;
  const w = bl.w * TILE;
  const h = bl.h * TILE;
  const doorTop = bl.door && bl.door.y === bl.y;
  // 影
  if (bl.kind !== 'park' && bl.kind !== 'parking' && bl.kind !== 'lot') px(ctx, 'rgba(0,0,0,0.2)', x + 3, y + 3, w, h);

  switch (bl.kind) {
    case 'house': {
      const c = bl.color ?? 0xc8553d;
      const wallH = 9;
      const wallY = doorTop ? y : y + h - wallH;
      const roofY = doorTop ? y + wallH : y;
      px(ctx, '#efe3c8', x + 1, wallY, w - 2, wallH);
      px(ctx, shade(c, 1), x, roofY, w, h - wallH);
      for (let i = 0; i < h - wallH; i += 3) px(ctx, shade(c, 0.82), x, roofY + i, w, 1);
      px(ctx, shade(c, 0.6), x, doorTop ? roofY : roofY + h - wallH - 1, w, 1);
      windows(ctx, lit, bl, x + 4, wallY + 2, w - 8, 4, '#4d6a85', 9, 4);
      break;
    }
    case 'apartment': {
      const c = bl.color ?? 0xb08968;
      px(ctx, shade(c, 1), x, y, w, h);
      px(ctx, shade(c, 0.75), x, y, w, 4);
      windows(ctx, lit, bl, x + 4, y + 8, w - 8, h - 14, '#3c5a73', 7, 4);
      for (let yy = y + 13; yy < y + h - 6; yy += 7) px(ctx, shade(c, 0.85), x + 2, yy, w - 4, 1);
      break;
    }
    case 'office': {
      px(ctx, '#8d99ae', x, y, w, h);
      px(ctx, '#6c7a91', x, y, w, 5);
      px(ctx, '#adb5bd', x + 3, y + 1, 5, 3);
      windows(ctx, lit, bl, x + 3, y + 8, w - 6, h - 14, '#3a506b', 5, 3);
      break;
    }
    case 'station': {
      px(ctx, '#e5ddd0', x, y, w, h);
      px(ctx, '#7d5a50', x, y, w, 8);
      for (let i = 0; i < w; i += 4) px(ctx, '#6b4c43', x + i, y, 2, 8);
      px(ctx, '#2b4c7e', x + 8, y + 12, w - 16, 9);
      windows(ctx, lit, bl, x + 6, y + 26, w - 12, h - 34, '#4d6a85', 10, 5);
      break;
    }
    case 'school': {
      px(ctx, '#f1ede4', x, y, w, h);
      px(ctx, '#b5838d', x, y + h - 6, w, 6);
      windows(ctx, lit, bl, x + 4, y + 8, w - 8, h - 18, '#5c7c99', 7, 4);
      // 時計
      px(ctx, '#ffffff', x + w / 2 - 5, y + h - 20, 10, 10);
      px(ctx, '#333333', x + w / 2 - 1, y + h - 18, 1, 4);
      px(ctx, '#333333', x + w / 2 - 1, y + h - 15, 3, 1);
      break;
    }
    case 'store': {
      drawShop(ctx, lit, x, y, w, h);
      break;
    }
    case 'lot': {
      // 空き物件：更地＋フェンス＋「テナント募集」の看板
      px(ctx, '#b89f7e', x, y, w, h);
      for (let i = 0; i < 18; i++) px(ctx, '#a68c69', x + Math.floor(noise(i, bl.x) * (w - 2)), y + Math.floor(noise(bl.y, i) * (h - 2)), 2, 1);
      for (let i = x; i < x + w; i += 4) {
        px(ctx, '#e9ecef', i, y, 1, 4);
        px(ctx, '#e9ecef', i, y + h - 4, 1, 4);
      }
      px(ctx, '#e9ecef', x, y + 1, w, 1);
      px(ctx, '#e9ecef', x, y + h - 3, w, 1);
      px(ctx, '#ffffff', x + w / 2 - 12, y + h / 2 - 7, 24, 12);
      px(ctx, '#e63946', x + w / 2 - 12, y + h / 2 - 7, 24, 3);
      px(ctx, '#6c757d', x + w / 2 - 1, y + h / 2 + 5, 2, 4);
      break;
    }
    case 'parking': {
      px(ctx, '#5c616b', x, y, w, h);
      for (let i = x + 4; i < x + w; i += 16) px(ctx, '#e9ecef', i, y + 4, 1, h - 8);
      // 車
      px(ctx, '#3a86ff', x + 7, y + 10, 10, 18);
      px(ctx, '#bde0fe', x + 8, y + 13, 8, 4);
      px(ctx, '#e76f51', x + 39, y + 30, 10, 18);
      px(ctx, '#ffd6cc', x + 40, y + 33, 8, 4);
      break;
    }
    case 'park': {
      px(ctx, '#86c06c', x, y, w, h);
      px(ctx, '#d9c9a3', x, y + 20, w, 6);
      px(ctx, '#5fa8d3', x + 92, y + 4, 40, 14);
      px(ctx, '#8ecae6', x + 96, y + 6, 12, 3);
      for (let i = 0; i < bl.w; i += 3) drawTree(ctx, x + i * TILE, y + 2);
      // ベンチ
      px(ctx, '#8b5e34', x + 150, y + 30, 14, 3);
      break;
    }
  }

  if (bl.door && bl.kind !== 'lot') {
    const dx = bl.door.x * TILE + 4;
    const dy = doorTop ? y : y + h - 9;
    const doorColor = bl.kind === 'store' ? '#bfe6f5' : bl.kind === 'house' ? '#7f5539' : '#495057';
    px(ctx, doorColor, dx, dy, 8, 9);
    if (bl.kind === 'store') {
      px(ctx, '#ffffff', dx + 3, dy, 2, 9);
      px(lit, '#fff6cc', dx, dy, 8, 9);
    }
  }
}

/** コンビニの外観（看板の帯・ガラス張り）。1号店と新店で共通 */
function drawShop(ctx: Ctx, lit: Ctx, x: number, y: number, w: number, h: number) {
  px(ctx, '#fafafa', x, y, w, h);
  px(ctx, '#2e8b57', x, y + 3, w, 3);
  px(ctx, '#f4a261', x, y + 6, w, 2);
  px(ctx, '#e63946', x, y + 8, w, 2);
  const gh = Math.min(14, h - 22);
  px(ctx, '#9ed0e6', x + 4, y + 14, w - 8, gh);
  px(lit, '#fff6cc', x + 4, y + 14, w - 8, gh);
  for (let i = x + 4; i < x + w - 4; i += 10) px(ctx, '#d9d9d9', i, y + 14, 1, gh);
  px(ctx, '#d0d0d0', x, y + h - 6, w, 6);
  px(lit, '#fffbe6', x, y + 3, w, 7);
}

/** 新しく出店した店の外観テクスチャ（空き物件の上に重ねる） */
export function buildShopTexture(scene: Phaser.Scene, bl: Building) {
  const key = `shop-${bl.id}`;
  if (scene.textures.exists(key)) return key;
  const w = bl.w * TILE;
  const h = bl.h * TILE;
  const base = scene.textures.createCanvas(key, w + 3, h + 3)!;
  const lit = scene.textures.createCanvas(`${key}-lit`, w + 3, h + 3)!;
  const ctx = base.getContext();
  const lctx = lit.getContext();
  px(ctx, 'rgba(0,0,0,0.2)', 3, 3, w, h);
  drawShop(ctx, lctx, 0, 0, w, h);
  const doorTop = bl.door!.y === bl.y;
  const dx = (bl.door!.x - bl.x) * TILE + 4;
  const dy = doorTop ? 0 : h - 9;
  px(ctx, '#bfe6f5', dx, dy, 8, 9);
  px(ctx, '#ffffff', dx + 3, dy, 2, 9);
  px(lctx, '#fff6cc', dx, dy, 8, 9);
  base.refresh();
  lit.refresh();
  return key;
}

function drawDecorations(ctx: Ctx) {
  // 草地に木を散らす（建物と重ならない場所だけ）
  const occupied = new Set<string>();
  for (const bl of BUILDINGS) for (let x = bl.x - 1; x <= bl.x + bl.w; x++) for (let y = bl.y - 1; y <= bl.y + bl.h; y++) occupied.add(`${x},${y}`);
  for (let ty = 2; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (groundAt(tx, ty) !== 'grass' || occupied.has(`${tx},${ty}`)) continue;
      if (noise(tx, ty, 77) < 0.28) drawTree(ctx, tx * TILE, ty * TILE);
    }
  }
}

/** 街の地面＋建物のテクスチャと、夜に光る窓のテクスチャを作る */
export function buildTownTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('town')) return;
  const W = MAP_W * TILE;
  const H = MAP_H * TILE;
  const base = scene.textures.createCanvas('town', W, H)!;
  const lit = scene.textures.createCanvas('town-lit', W, H)!;
  const ctx = base.getContext();
  const lctx = lit.getContext();
  ctx.imageSmoothingEnabled = false;
  drawGround(ctx);
  drawDecorations(ctx);
  for (const bl of BUILDINGS) drawBuilding(ctx, lctx, bl);
  base.refresh();
  lit.refresh();
}

/** 歩く人（8×12）。2コマの歩きアニメ */
export function buildWalkerTextures(scene: Phaser.Scene, key: string, body: number, hair: number) {
  if (scene.textures.exists(`${key}-0`)) return; // 店内と街で共用
  for (let f = 0; f < 2; f++) {
    const t = scene.textures.createCanvas(`${key}-${f}`, 8, 13)!;
    const c = t.getContext();
    px(c, 'rgba(0,0,0,0.25)', 1, 11, 6, 2);
    px(c, hex(hair), 2, 0, 4, 2);
    px(c, '#f2c9a0', 2, 2, 4, 3);
    px(c, hex(hair), 1, 1, 1, 2);
    px(c, hex(body), 1, 5, 6, 4);
    px(c, shade(body, 0.75), 1, 8, 6, 1);
    px(c, '#f2c9a0', 0, 6, 1, 2);
    px(c, '#f2c9a0', 7, 6, 1, 2);
    px(c, '#2b2d42', f ? 1 : 2, 9, 2, 3);
    px(c, '#2b2d42', f ? 5 : 4, 9, 2, 3);
    t.refresh();
  }
}

export function buildMiscTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('raindrop')) return;
  // 車（横向き 14×8 と 縦向き 8×14）
  const colors = [0xe63946, 0x457b9d, 0xf4a261, 0x2a9d8f, 0xffffff, 0x6d597a];
  colors.forEach((col, i) => {
    const h = scene.textures.createCanvas(`car-h-${i}`, 14, 8)!;
    const c = h.getContext();
    px(c, 'rgba(0,0,0,0.25)', 1, 6, 13, 2);
    px(c, hex(col), 0, 1, 14, 6);
    px(c, '#bde0fe', 4, 2, 5, 4);
    px(c, '#222222', 2, 0, 2, 1);
    px(c, '#222222', 10, 0, 2, 1);
    px(c, '#222222', 2, 7, 2, 1);
    px(c, '#222222', 10, 7, 2, 1);
    h.refresh();
    const v = scene.textures.createCanvas(`car-v-${i}`, 8, 14)!;
    const d = v.getContext();
    px(d, 'rgba(0,0,0,0.25)', 6, 1, 2, 13);
    px(d, hex(col), 1, 0, 6, 14);
    px(d, '#bde0fe', 2, 4, 4, 5);
    v.refresh();
  });
  const train = scene.textures.createCanvas('train', 96, 12)!;
  const t = train.getContext();
  for (let i = 0; i < 3; i++) {
    px(t, '#e9ecef', i * 32, 1, 30, 10);
    px(t, '#2e8b57', i * 32, 7, 30, 2);
    for (let w = 3; w < 28; w += 6) px(t, '#6c8ead', i * 32 + w, 3, 4, 3);
  }
  train.refresh();
  const drop = scene.textures.createCanvas('raindrop', 1, 5)!;
  px(drop.getContext(), 'rgba(200,220,255,0.8)', 0, 0, 1, 5);
  drop.refresh();
  const glow = scene.textures.createCanvas('glow', 32, 32)!;
  const g = glow.getContext();
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,230,160,0.9)');
  grad.addColorStop(1, 'rgba(255,230,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  glow.refresh();
}
