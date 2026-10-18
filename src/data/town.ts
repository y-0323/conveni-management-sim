// 街マップの定義と歩行経路の計算（Phaser に依存しない）
export const TILE = 16;
export const MAP_W = 48;
export const MAP_H = 34;

export type Ground = 'grass' | 'road' | 'sidewalk' | 'crosswalk' | 'plaza' | 'rail';

export type BuildingKind = 'house' | 'apartment' | 'office' | 'station' | 'school' | 'store' | 'parking' | 'park';

export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 出入口のタイル（建物の外周） */
  door?: { x: number; y: number };
  /** 出入口の前の歩道タイル（歩行者の発着点） */
  front?: { x: number; y: number };
  label?: string;
  color?: number;
}

const ROAD_ROWS = [10, 11, 23, 24];
const ROAD_COLS = [14, 15, 33, 34];
const WALK_ROWS = [9, 12, 22, 25];
const WALK_COLS = [13, 16, 32, 35];

export function groundAt(x: number, y: number): Ground {
  if (y <= 1) return 'rail';
  const roadRow = ROAD_ROWS.includes(y);
  const roadCol = ROAD_COLS.includes(x);
  const walkRow = WALK_ROWS.includes(y);
  const walkCol = WALK_COLS.includes(x);
  if (roadRow && walkCol) return 'crosswalk';
  if (roadCol && walkRow) return 'crosswalk';
  if (roadRow || roadCol) return 'road';
  if (walkRow || walkCol) return 'sidewalk';
  if (x >= 36 && y >= 2 && y <= 8) return 'plaza';
  return 'grass';
}

function b(id: string, kind: BuildingKind, x: number, y: number, w: number, h: number, doorSide: 'top' | 'bottom' | 'none', extra: Partial<Building> = {}): Building {
  const bl: Building = { id, kind, x, y, w, h, ...extra };
  if (doorSide !== 'none') {
    const dx = x + Math.floor(w / 2);
    bl.door = { x: dx, y: doorSide === 'top' ? y : y + h - 1 };
    bl.front = { x: dx, y: doorSide === 'top' ? y - 1 : y + h };
  }
  return bl;
}

export const BUILDINGS: Building[] = [
  // 左上：住宅街（下向きの玄関）
  b('h1', 'house', 1, 5, 3, 4, 'bottom', { color: 0xc8553d }),
  b('h2', 'house', 5, 5, 3, 4, 'bottom', { color: 0x3d7fc8 }),
  b('h3', 'house', 9, 5, 3, 4, 'bottom', { color: 0x6a994e }),
  b('h4', 'house', 2, 2, 3, 3, 'none', { color: 0xbc6c25 }),
  b('h5', 'house', 7, 2, 3, 3, 'none', { color: 0x9c6644 }),
  // 中央上：オフィス街
  b('o1', 'office', 17, 2, 6, 7, 'bottom', { label: 'ABC商事' }),
  b('o2', 'office', 24, 1, 7, 8, 'bottom', { label: 'みらいビル' }),
  // 右上：駅
  b('st', 'station', 37, 3, 10, 6, 'bottom', { label: 'まちかど駅' }),
  // 左中：住宅街
  b('h6', 'house', 1, 13, 3, 4, 'top', { color: 0xe09f3e }),
  b('h7', 'house', 5, 13, 3, 4, 'top', { color: 0x8e7dbe }),
  b('h8', 'house', 9, 13, 3, 4, 'top', { color: 0x4f772d }),
  b('h9', 'house', 1, 18, 3, 4, 'bottom', { color: 0x3a86ff }),
  b('h10', 'house', 5, 18, 3, 4, 'bottom', { color: 0xd62828 }),
  b('h11', 'house', 9, 18, 3, 4, 'bottom', { color: 0x588157 }),
  // 中央：自分のお店・駐車場・公園
  b('store', 'store', 17, 13, 6, 4, 'top', { label: 'まちかどマート' }),
  b('parking', 'parking', 23, 13, 5, 4, 'none'),
  b('park', 'park', 17, 18, 14, 3, 'none'),
  b('o3', 'office', 28, 13, 3, 4, 'top', { label: '' }),
  // 右中：学校
  b('school', 'school', 36, 13, 11, 6, 'top', { label: 'まちかど高校' }),
  // 下：マンション
  b('a1', 'apartment', 1, 26, 5, 6, 'top', { color: 0xb08968 }),
  b('a2', 'apartment', 7, 26, 5, 6, 'top', { color: 0x8d99ae }),
  b('a3', 'apartment', 17, 26, 6, 6, 'top', { color: 0xa98467 }),
  b('a4', 'apartment', 25, 26, 6, 6, 'top', { color: 0x6c757d }),
  b('a5', 'apartment', 36, 26, 5, 6, 'top', { color: 0xc9ada7 }),
  b('a6', 'apartment', 42, 26, 5, 6, 'top', { color: 0x9a8c98 }),
];

export const STORE = BUILDINGS.find((x) => x.id === 'store')!;

/** 客層ごとの出発地 */
export const ORIGINS = {
  office: BUILDINGS.filter((x) => (x.kind === 'office' || x.kind === 'station') && x.front),
  school: BUILDINGS.filter((x) => (x.kind === 'school' || x.kind === 'station') && x.front),
  house: BUILDINGS.filter((x) => (x.kind === 'house' || x.kind === 'apartment') && x.front),
};

export const ALL_DOORS = BUILDINGS.filter((x) => x.front && x.kind !== 'store');

export function walkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  const g = groundAt(x, y);
  return g === 'sidewalk' || g === 'crosswalk';
}

export interface Pt {
  x: number;
  y: number;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 歩道上の最短経路（幅優先探索）。見つからなければ null */
export function findPath(from: Pt, to: Pt): Pt[] | null {
  if (!walkable(from.x, from.y) || !walkable(to.x, to.y)) return null;
  const key = (x: number, y: number) => y * MAP_W + x;
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  const start = key(from.x, from.y);
  prev[start] = start;
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    if (cur === key(to.x, to.y)) break;
    const cx = cur % MAP_W;
    const cy = Math.floor(cur / MAP_W);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      const k = key(nx, ny);
      if (prev[k] !== -1) continue;
      prev[k] = cur;
      queue.push(k);
    }
  }
  const goal = key(to.x, to.y);
  if (prev[goal] === -1) return null;
  const path: Pt[] = [];
  for (let k = goal; ; k = prev[k]) {
    path.push({ x: k % MAP_W, y: Math.floor(k / MAP_W) });
    if (k === start) break;
  }
  return path.reverse();
}
