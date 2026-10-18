import type { CategoryId } from '../data/categories';
import type { SegmentId } from '../data/segments';
import type { SiteId } from '../data/sites';

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
  /** 営業開始時（納品後）の在庫。棚の充足率の基準 */
  startStock: number;
  delivered: number;
  sold: number;
  /** 欠品で売れなかった数（機会損失） */
  lost: number;
  wasted: number;
  /** 本当の需要 = sold + lost */
  demand: number;
  /** 売上金額（売価を途中で変えても正しく集計するため） */
  revenue: number;
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
  /** 緊急補充の配送料 */
  rushFees: number;
  /** 緊急補充の回数 */
  rushCount: number;
}

export interface MentorComment {
  tone: 'good' | 'info' | 'warn' | 'bad';
  title: string;
  body: string;
}

/** 店舗ごとの日報 */
export interface DayReport extends DayStats {
  siteId: SiteId;
  labor: number;
  rent: number;
  /** 出店費用の減価償却（現金は出ていかない） */
  depreciation: number;
  /** 閉店時点の売価と、店の価格イメージ（来店数の倍率） */
  prices: Record<CategoryId, number>;
  priceImage: number;
  grossProfit: number;
  operatingProfit: number;
  inventoryValue: number;
  reputationBefore: number;
  reputationAfter: number;
  comments: MentorComment[];
}

/** 会社全体の1日 */
export interface CompanyDay {
  day: number;
  sales: number;
  operatingProfit: number;
  cashStart: number;
  cashEnd: number;
  /** その日に支払った出店費用 */
  investment: number;
  storeCount: number;
}

/** 営業中の追加発注（緊急補充）。arriveTick に届く */
export interface RushDelivery {
  category: CategoryId;
  qty: number;
  arriveTick: number;
}

export interface StoreState {
  siteId: SiteId;
  rush: RushDelivery[];
  /** 営業を始める日（出店を決めた翌日） */
  openDay: number;
  reputation: number;
  inventory: Record<CategoryId, Lot[]>;
  /** 明朝6:00に納品される発注数 */
  orders: Record<CategoryId, number>;
  /** 売価 */
  prices: Record<CategoryId, number>;
  today: DayStats;
  reports: DayReport[];
}

export interface SimState {
  version: 2;
  seed: number;
  rng: number;
  /** ゲーム開始（1日目 6:00）からの経過刻み数 */
  tick: number;
  cash: number;
  stores: StoreState[];
  /** weather[day - 1]。今日と明日の分が常に存在する */
  weather: WeatherDay[];
  cashAtDayStart: number;
  investmentToday: number;
  companyReports: CompanyDay[];
  bankrupt: boolean;
}

export interface VisitEvent {
  siteId: SiteId;
  segment: SegmentId;
  bought: CategoryId[];
  /** 欲しかったが欠品で買えなかった */
  missed: CategoryId[];
  /** 支払った金額 */
  spent: number;
}

export interface TickResult {
  visits: VisitEvent[];
  /** この刻みに届いた緊急補充 */
  arrivals: Array<{ siteId: SiteId; category: CategoryId; qty: number }>;
  /** 営業日が終わった場合、全店の日報と会社全体の集計 */
  reports: DayReport[] | null;
  company: CompanyDay | null;
}

export type Command =
  | { type: 'setOrder'; siteId: SiteId; category: CategoryId; qty: number }
  | { type: 'openStore'; siteId: SiteId }
  | { type: 'rushOrder'; siteId: SiteId; category: CategoryId; qty: number }
  | { type: 'setPrice'; siteId: SiteId; category: CategoryId; price: number };
