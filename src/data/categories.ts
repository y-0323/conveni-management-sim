// 商品カテゴリ定義（M1は3カテゴリ）。数値は学習用に簡略化したモデル
export type CategoryId = 'bento' | 'drink' | 'hotsnack';

export interface Category {
  id: CategoryId;
  name: string;
  icon: string;
  price: number; // 平均売価
  cost: number; // 平均原価
  lifeDays: number; // 消費期限（納品から何日で廃棄か）
  /** 気温への反応：基準気温からの差1℃あたりの需要変化率 */
  tempSensitivity: number;
  tempBase: number;
  /** 時間帯（0-23時）ごとの買われやすさ補正 */
  hourBias?: Partial<Record<number, number>>;
  note: string;
}

export const CATEGORIES: Category[] = [
  {
    id: 'bento',
    name: 'おにぎり・弁当',
    icon: '🍙',
    price: 320,
    cost: 220,
    lifeDays: 1,
    tempSensitivity: 0,
    tempBase: 18,
    hourBias: { 11: 1.4, 12: 1.6, 18: 1.2, 19: 1.2 },
    note: '朝と昼に売れる主力。期限は1日で、売れ残りはすべて廃棄。',
  },
  {
    id: 'drink',
    name: '飲料',
    icon: '🥤',
    price: 160,
    cost: 96,
    lifeDays: 60,
    tempSensitivity: 0.04,
    tempBase: 18,
    note: '暑い日ほど売れる。日持ちするので売れ残っても翌日に回せる。',
  },
  {
    id: 'hotsnack',
    name: 'ホットスナック',
    icon: '🍗',
    price: 190,
    cost: 70,
    lifeDays: 1,
    tempSensitivity: -0.03,
    tempBase: 15,
    hourBias: { 7: 0.6, 8: 0.6, 16: 1.4, 17: 1.6, 18: 1.5 },
    note: '粗利率が高い稼ぎ頭。ただし作り置きはその日限り。寒い日・夕方に売れる。',
  },
];

/** 実績がない時に推奨発注で使う、本部の標準的な1日の需要 */
export const ECONOMY_FALLBACK: Record<CategoryId, number> = { bento: 330, drink: 380, hotsnack: 160 };

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>;
