// 店内のドット絵（床・壁・棚・レジ）と商品アイコン
import Phaser from 'phaser';
import { IN_H, IN_W } from '../data/interior';

type Ctx = CanvasRenderingContext2D;
const T = 16;

function px(ctx: Ctx, color: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawFloor(ctx: Ctx) {
  for (let y = 0; y < IN_H; y++) {
    for (let x = 0; x < IN_W; x++) {
      px(ctx, (x + y) % 2 ? '#e9e6df' : '#f4f2ec', x * T, y * T, T, T);
      px(ctx, '#dcd8cf', x * T, y * T, T, 1);
    }
  }
}

function drawWalls(ctx: Ctx) {
  // 奥の壁
  px(ctx, '#d7dde4', 0, 0, IN_W * T, 2 * T);
  px(ctx, '#2e8b57', 0, 0, IN_W * T, 3);
  // 手前の壁（窓と自動ドア）
  const y = 13 * T;
  px(ctx, '#bfc6cf', 0, y, IN_W * T, T);
  for (let x = 1; x < IN_W - 1; x++) {
    if (x === 9 || x === 10) continue;
    px(ctx, '#8ec5e8', x * T + 1, y + 3, T - 2, 10);
  }
  // 自動ドア
  px(ctx, '#6c757d', 9 * T - 1, y, 2 * T + 2, T);
  px(ctx, '#cfe8f7', 9 * T + 1, y + 2, T - 2, 13);
  px(ctx, '#cfe8f7', 10 * T + 1, y + 2, T - 2, 13);
  // 入口マット
  px(ctx, '#7a6a5a', 9 * T, 12 * T + 4, 2 * T, 12);
  px(ctx, '#8d7c6a', 9 * T + 2, 12 * T + 6, 2 * T - 4, 8);
}

function drawFridge(ctx: Ctx) {
  // 飲料の冷蔵ケース（x2〜14, y0〜2）
  const x0 = 2 * T;
  const w = 12 * T;
  px(ctx, '#495867', x0 - 2, 0, w + 4, 2 * T + 2);
  for (let i = 0; i < 12; i++) {
    const x = x0 + i * T;
    px(ctx, '#e3f2fd', x + 1, 2, T - 2, 2 * T - 4);
    px(ctx, '#b0bec5', x + 1, 12, T - 2, 1);
    px(ctx, '#b0bec5', x + 1, 20, T - 2, 1);
    px(ctx, '#b0bec5', x + 1, 28, T - 2, 1);
    px(ctx, '#ffffff', x + 2, 3, 1, 2 * T - 8);
  }
  px(ctx, '#2e8b57', x0, 2 * T - 1, w, 3);
}

function drawBentoCase(ctx: Ctx) {
  // おにぎり・弁当のオープンケース（x0〜2, y3〜11）
  const y0 = 3 * T;
  px(ctx, '#495867', 0, y0 - 2, 2 * T + 2, 8 * T + 4);
  px(ctx, '#9fb8c8', 0, y0, 2 * T - 1, 8 * T);
  for (let i = 0; i < 16; i++) px(ctx, '#7f98a8', 0, y0 + i * 8 + 7, 2 * T - 1, 1);
  px(ctx, '#f4a261', 2 * T - 1, y0, 2, 8 * T);
}

function drawGondolas(ctx: Ctx) {
  // 中央の棚（お菓子・日用品。M2 で棚割りの対象になる）
  const colors = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#8d99ae', '#9d4edd', '#06d6a0', '#ef476f'];
  for (const gy of [4, 7]) {
    const x0 = 4 * T;
    const y0 = gy * T;
    px(ctx, 'rgba(0,0,0,0.12)', x0 + 2, y0 + 3, 6 * T, 2 * T);
    px(ctx, '#adb5bd', x0, y0, 6 * T, 2 * T);
    px(ctx, '#868e96', x0, y0 + T - 1, 6 * T, 2);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 16; i++) {
        const c = colors[(i * 3 + row * 5 + gy) % colors.length];
        const yy = y0 + row * T + 3;
        px(ctx, c, x0 + 2 + i * 6, yy, 4, 9);
        px(ctx, 'rgba(255,255,255,0.5)', x0 + 2 + i * 6, yy, 4, 2);
      }
    }
  }
}

function drawCounter(ctx: Ctx) {
  // レジカウンター（x13〜19, y8〜10）
  const x0 = 13 * T;
  const y0 = 8 * T;
  px(ctx, 'rgba(0,0,0,0.15)', x0 + 2, y0 + 3, 6 * T, 2 * T);
  px(ctx, '#8b5e34', x0, y0, 6 * T, 2 * T);
  px(ctx, '#a47148', x0, y0, 6 * T, 5);
  // ホットスナックの保温ケース
  px(ctx, '#495867', x0, y0 - 2, 2 * T, T + 2);
  px(ctx, '#fff3bf', x0 + 2, y0, 2 * T - 4, T - 2);
  px(ctx, '#ff922b', x0 + 2, y0, 2 * T - 4, 2);
  // レジ
  for (const rx of [16, 18]) {
    px(ctx, '#343a40', rx * T - 6, y0 + 2, 12, 8);
    px(ctx, '#74c0fc', rx * T - 4, y0 + 3, 8, 4);
  }
  // 後ろの棚（たばこ等）
  px(ctx, '#ced4da', 15 * T, 5 * T, 5 * T, T);
  for (let i = 0; i < 18; i++) px(ctx, ['#e63946', '#f1faee', '#457b9d', '#1d3557'][i % 4], 15 * T + 3 + i * 4, 5 * T + 4, 3, 8);
}

function drawExtras(ctx: Ctx) {
  // ATM・コピー機
  px(ctx, '#495057', 16 * T, T / 2, T + 4, 2 * T - 4);
  px(ctx, '#74c0fc', 16 * T + 4, T / 2 + 4, 12, 6);
  px(ctx, '#dee2e6', 18 * T, T / 2, T + 6, 2 * T - 4);
  px(ctx, '#868e96', 18 * T + 2, T / 2 + 2, T + 2, 4);
  // 雑誌ラック（窓際）
  px(ctx, '#868e96', 1 * T, 12 * T, 6 * T, 10);
  const mag = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#da77f2', '#ffa94d'];
  for (let i = 0; i < 12; i++) px(ctx, mag[i % mag.length], 1 * T + 2 + i * 8, 12 * T + 1, 6, 8);
  // ゴミ箱
  px(ctx, '#adb5bd', 11 * T + 4, 12 * T + 2, 10, 12);
  px(ctx, '#495057', 11 * T + 5, 12 * T + 3, 8, 2);
}

export function buildInteriorTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('interior')) return;
  const tex = scene.textures.createCanvas('interior', IN_W * T, IN_H * T)!;
  const ctx = tex.getContext();
  drawFloor(ctx);
  drawWalls(ctx);
  drawFridge(ctx);
  drawBentoCase(ctx);
  drawGondolas(ctx);
  drawCounter(ctx);
  drawExtras(ctx);
  tex.refresh();

  // 商品アイコン
  const make = (key: string, w: number, h: number, draw: (c: Ctx) => void) => {
    const t = scene.textures.createCanvas(key, w, h)!;
    draw(t.getContext());
    t.refresh();
  };
  make('item-onigiri', 7, 6, (c) => {
    px(c, '#ffffff', 2, 0, 3, 1);
    px(c, '#ffffff', 1, 1, 5, 2);
    px(c, '#ffffff', 0, 3, 7, 3);
    px(c, '#212529', 2, 4, 3, 2);
  });
  make('item-bento', 8, 6, (c) => {
    px(c, '#343a40', 0, 0, 8, 6);
    px(c, '#ffffff', 1, 1, 3, 4);
    px(c, '#e76f51', 4, 1, 3, 2);
    px(c, '#90be6d', 4, 3, 3, 2);
  });
  const bottle = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#8ac926', '#ffca3a'];
  bottle.forEach((col, i) =>
    make(`item-drink${i}`, 4, 7, (c) => {
      px(c, '#dee2e6', 1, 0, 2, 1);
      px(c, col, 0, 1, 4, 6);
      px(c, 'rgba(255,255,255,0.6)', 0, 3, 4, 1);
    }),
  );
  make('item-chicken', 6, 5, (c) => {
    px(c, '#b5651d', 1, 0, 4, 5);
    px(c, '#b5651d', 0, 1, 6, 3);
    px(c, '#e0a458', 1, 1, 2, 1);
  });
  // 店員（緑の制服）
  for (let f = 0; f < 2; f++) {
    make(`clerk-${f}`, 8, 13, (c) => {
      px(c, '#2b2118', 2, 0, 4, 2);
      px(c, '#f2c9a0', 2, 2, 4, 3);
      px(c, '#2e8b57', 1, 5, 6, 4);
      px(c, '#f4a261', 1, 6, 6, 1);
      px(c, '#f2c9a0', f ? 0 : 7, f ? 5 : 6, 1, 2);
      px(c, '#2b2d42', 2, 9, 2, 3);
      px(c, '#2b2d42', 4, 9, 2, 3);
    });
  }
}
