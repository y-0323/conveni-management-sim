import type { CategoryId } from '../data/categories';
import type { SegmentId } from '../data/segments';

export type WeatherKind = 'sunny' | 'cloudy' | 'rain';

export interface WeatherDay {
  kind: WeatherKind;
  temp: number;
}

/** 在庫のかたまり。expireDay の営業開始（6:00）時点で廃棄される */
export interface Lot {
  qty: number;
  expireDay: number;
}

export interface CategoryStats {
  delivered: number;
  sold: number;
  /** 欠品で売れなかった数（機会損失） */
  lost: number;
  wasted: number;
  /** 本当の需要 = sold + lost */
  demand: number;
}

export interface DayStats {
  day: number;
  dow: number;
  weather: WeatherDay;
  visits: number;
  visitsBySegment: Record<SegmentId, number>;
  cats: Record<CategoryId, CategoryStats>;
  hourlySales: number[];
  sales: number;
  cogs: number;
  waste: number;
  purchases: number;
}

export interface MentorComment {
  tone: 'good' | 'info' | 'warn' | 'bad';
  title: string;
  body: string;
}

export interface DayReport extends DayStats {
  labor: number;
  rent: number;
  grossProfit: number;
  operatingProfit: number;
  cashStart: number;
  cashEnd: number;
  inventoryValue: number;
  reputationBefore: number;
  reputationAfter: number;
  comments: MentorComment[];
}

export interface SimState {
  version: 1;
  seed: number;
  rng: number;
  /** ゲーム開始（1日目 6:00）からの経過刻み数 */
  tick: number;
  cash: number;
  reputation: number;
  inventory: Record<CategoryId, Lot[]>;
  /** 明朝6:00に納品される発注数 */
  orders: Record<CategoryId, number>;
  /** weather[day - 1]。今日と明日の分が常に存在する */
  weather: WeatherDay[];
  today: DayStats;
  /** 当日の営業開始時点の現金 */
  cashAtDayStart: number;
  reports: DayReport[];
  bankrupt: boolean;
}

export interface VisitEvent {
  segment: SegmentId;
  bought: CategoryId[];
  /** 欲しかったが欠品で買えなかった */
  missed: CategoryId[];
}

export interface TickResult {
  visits: VisitEvent[];
  /** 営業日が終わった場合、その日の日報 */
  report: DayReport | null;
}

export type Command = { type: 'setOrder'; category: CategoryId; qty: number };
