// 店内のレイアウト（タイル単位、1タイル = 16px）。描画とお客さんの動線の両方で使う
import type { CategoryId } from './categories';

export const IN_W = 20;
export const IN_H = 14;

export interface P {
  x: number;
  y: number;
}

/** 商品を並べる棚の位置。slots は商品1個ぶんの表示位置（ピクセル） */
export interface ShelfDef {
  category: CategoryId;
  /** 棚の範囲（タイル） */
  x: number;
  y: number;
  w: number;
  h: number;
  slots: P[];
  /** 「残りわずか」などの札を出す位置（ピクセル） */
  tag: P;
}

function grid(x0: number, y0: number, cols: number, rows: number, dx: number, dy: number): P[] {
  const out: P[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: x0 + c * dx, y: y0 + r * dy });
  return out;
}

export const SHELVES: ShelfDef[] = [
  // 奥の壁：飲料の冷蔵ケース（ガラス扉12枚 × 3段）
  { category: 'drink', x: 2, y: 0, w: 12, h: 2, slots: grid(2 * 16 + 3, 6, 24, 3, 8, 8), tag: { x: 8 * 16, y: 34 } },
  // 左の壁：おにぎり・弁当のオープンケース（3列 × 8段）
  { category: 'bento', x: 0, y: 3, w: 2, h: 8, slots: grid(2, 3 * 16 + 3, 3, 16, 9, 8), tag: { x: 40, y: 3 * 16 - 6 } },
  // レジ横：ホットスナックの保温ケース
  { category: 'hotsnack', x: 13, y: 8, w: 2, h: 1, slots: grid(13 * 16 + 3, 8 * 16 + 3, 4, 2, 7, 6), tag: { x: 14 * 16, y: 7 * 16 + 2 } },
];

export const DOOR: P = { x: 10, y: 13.6 };
export const ENTRY: P = { x: 10, y: 11.6 };
/** 棚の間の通路 */
const RIGHT_AISLE_X = 11.3;
const TOP_AISLE_Y = 2.75;
const BOTTOM_AISLE_Y = 10.4;
const LEFT_AISLE_X = 2.7;
/** レジ前（お客さんが並ぶ位置） */
export const REGISTER: P = { x: 15.5, y: 10.5 };
export const CLERKS: P[] = [
  { x: 15.5, y: 7.4 },
  { x: 17.5, y: 7.4 },
];

/** 棚の前の立ち位置（タイル） */
export function shelfSpot(cat: CategoryId, r: number): P {
  if (cat === 'drink') return { x: 3 + r * 10, y: TOP_AISLE_Y };
  if (cat === 'bento') return { x: LEFT_AISLE_X, y: 3.5 + r * 7 };
  return { ...REGISTER, x: REGISTER.x - 1.4 };
}

/** 現在地から目的地までの経路（通路だけを通る折れ線） */
export function route(from: P, to: P): P[] {
  const pts: P[] = [];
  const atRight = Math.abs(from.x - RIGHT_AISLE_X) < 0.01;
  // まず右の通路に出る（入口・レジ前・棚の前から）
  if (!atRight) {
    if (from.y < TOP_AISLE_Y + 0.5) pts.push({ x: RIGHT_AISLE_X, y: from.y });
    else if (from.x < 3.5) {
      // 左の棚の前：近い方の通路を使う
      const y = from.y < 7 ? TOP_AISLE_Y : BOTTOM_AISLE_Y;
      pts.push({ x: from.x, y }, { x: RIGHT_AISLE_X, y });
    } else pts.push({ x: RIGHT_AISLE_X, y: from.y });
  }
  // 目的地へ
  if (to.y < TOP_AISLE_Y + 0.5) {
    pts.push({ x: RIGHT_AISLE_X, y: to.y }, to);
  } else if (to.x < 3.5) {
    const y = to.y < 7 ? TOP_AISLE_Y : BOTTOM_AISLE_Y;
    pts.push({ x: RIGHT_AISLE_X, y }, { x: to.x, y }, to);
  } else {
    pts.push({ x: RIGHT_AISLE_X, y: to.y }, to);
  }
  return pts;
}
