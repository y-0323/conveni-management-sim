import type { CategoryId } from './categories';

// 客層の定義。来店数は「1日の基本来店数 × 時間帯の分布 × 曜日・天気・評判」で決まる
export type SegmentId = 'worker' | 'student' | 'resident';

export interface Segment {
  id: SegmentId;
  name: string;
  /** 平日の1日あたり基本来店数 */
  dailyVisits: number;
  /** 0-23時の来店分布（合計で正規化して使う） */
  hourly: number[];
  /** 土日の来店倍率 */
  weekendFactor: number;
  /** 雨の日の来店倍率 */
  rainFactor: number;
  /** 価格への敏感さ（1 = 平均。大きいほど値上げで買わなくなる） */
  priceSensitivity: number;
  /** 1回の来店でそのカテゴリを買う確率 */
  buyProb: Record<CategoryId, number>;
  /** 街マップでどの建物から来るか */
  origin: 'office' | 'school' | 'house';
  color: number;
}

//              0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
const WORKER = [0, 0, 0, 0, 0, 1, 3, 8, 10, 4, 3, 9, 14, 6, 3, 3, 3, 4, 8, 7, 4, 2, 1, 0];
const STUDENT = [0, 0, 0, 0, 0, 0, 1, 6, 6, 1, 1, 2, 4, 3, 3, 5, 9, 8, 5, 3, 2, 2, 1, 1];
const RESIDENT = [1, 1, 0, 0, 0, 1, 2, 3, 3, 4, 5, 6, 6, 5, 5, 5, 6, 8, 9, 8, 6, 4, 3, 2];

export const SEGMENTS: Segment[] = [
  {
    id: 'worker',
    name: '会社員',
    dailyVisits: 380,
    hourly: WORKER,
    weekendFactor: 0.3,
    rainFactor: 0.95,
    priceSensitivity: 0.65,
    buyProb: { bento: 0.5, drink: 0.5, hotsnack: 0.2 },
    origin: 'office',
    color: 0x3b5b92,
  },
  {
    id: 'student',
    name: '学生',
    dailyVisits: 170,
    hourly: STUDENT,
    weekendFactor: 0.5,
    rainFactor: 0.85,
    priceSensitivity: 1.5,
    buyProb: { bento: 0.25, drink: 0.6, hotsnack: 0.4 },
    origin: 'school',
    color: 0xd9822b,
  },
  {
    id: 'resident',
    name: '近所の住民',
    dailyVisits: 300,
    hourly: RESIDENT,
    weekendFactor: 1.3,
    rainFactor: 0.75,
    priceSensitivity: 1.05,
    buyProb: { bento: 0.3, drink: 0.4, hotsnack: 0.15 },
    origin: 'house',
    color: 0x4f8a5b,
  },
];
