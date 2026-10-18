// 出店できる場所（1号店＋空き物件）。商圏の客層の違いが店の個性になる
import { CATEGORIES, CATEGORY_BY_ID, priceDemandFactor, type CategoryId } from './categories';
import { SEGMENTS, type SegmentId } from './segments';

export type SiteId = 'main' | 'office' | 'school' | 'home';

export interface Site {
  id: SiteId;
  buildingId: string;
  name: string;
  area: string;
  /** 出店費用（内装・設備）。2年で減価償却 */
  openCost: number;
  rentPerDay: number;
  /** 客層ごとの来店倍率（1号店 = 1） */
  segmentMult: Record<SegmentId, number>;
  description: string;
}

export const SITES: Site[] = [
  {
    id: 'main',
    buildingId: 'store',
    name: '駅前通り店',
    area: '駅・オフィス・住宅のまんなか',
    openCost: 0,
    rentPerDay: 10_000,
    segmentMult: { worker: 1, student: 1, resident: 1 },
    description: 'あなたの1号店。いろいろなお客さんが来るバランス型。',
  },
  {
    id: 'office',
    buildingId: 'lot-office',
    name: 'オフィス街店',
    area: 'オフィスビルの足元',
    openCost: 1_200_000,
    rentPerDay: 9_000,
    segmentMult: { worker: 1.35, student: 0.3, resident: 0.4 },
    description: '平日の昼は会社員で大混雑。ただし土日はガラガラになりがち。',
  },
  {
    id: 'school',
    buildingId: 'lot-school',
    name: '学校前店',
    area: '高校と駅のあいだ',
    openCost: 1_000_000,
    rentPerDay: 7_000,
    segmentMult: { worker: 0.4, student: 1.7, resident: 0.6 },
    description: '登下校の時間に学生が集中。飲料とホットスナックが売れる。',
  },
  {
    id: 'home',
    buildingId: 'lot-home',
    name: '住宅街店',
    area: 'マンションが並ぶ住宅街',
    openCost: 900_000,
    rentPerDay: 6_000,
    segmentMult: { worker: 0.3, student: 0.45, resident: 1.65 },
    description: '家賃が安く、夕方と週末に強い。雨の日は客足が落ちやすい。',
  },
];

export const SITE_BY_ID = Object.fromEntries(SITES.map((s) => [s.id, s])) as Record<SiteId, Site>;

/** 本部の商圏調査による、そのカテゴリの1日あたり需要の目安（天気・評判は考慮しない） */
export function hqEstimate(site: Site, cat: CategoryId, weekend: boolean): number {
  return SEGMENTS.reduce((a, s) => a + s.dailyVisits * site.segmentMult[s.id] * (weekend ? s.weekendFactor : 1) * s.buyProb[cat], 0);
}

/** 売価を変えた場合の需要の目安（客層ごとの価格への敏感さを反映） */
export function hqEstimateAt(site: Site, cat: CategoryId, weekend: boolean, price: number): number {
  const c = CATEGORY_BY_ID[cat];
  return SEGMENTS.reduce(
    (a, s) => a + s.dailyVisits * site.segmentMult[s.id] * (weekend ? s.weekendFactor : 1) * s.buyProb[cat] * priceDemandFactor(c, price, s.priceSensitivity),
    0,
  );
}

/** この店の客層の、価格への敏感さ（来店数で加重平均） */
export function siteSensitivity(site: Site): number {
  const total = SEGMENTS.reduce((a, s) => a + s.dailyVisits * site.segmentMult[s.id], 0);
  return SEGMENTS.reduce((a, s) => a + s.dailyVisits * site.segmentMult[s.id] * s.priceSensitivity, 0) / total;
}

/** 本部の商圏調査による1日の来店数の目安（平日） */
export function hqVisits(site: Site): number {
  return SEGMENTS.reduce((a, s) => a + s.dailyVisits * site.segmentMult[s.id], 0);
}

export function defaultOrders(site: Site): Record<CategoryId, number> {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, Math.round(hqEstimate(site, c.id, false) / 10) * 10])) as Record<CategoryId, number>;
}
