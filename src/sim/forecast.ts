// 発注の推奨値。実際のコンビニの自動発注と同じく「過去の実績＋天気の経験則」で作る。
// シミュレーションの内部モデルは使わないので、外れることもある（それが学び）
import { CATEGORIES, CATEGORY_BY_ID, priceDemandFactor, type CategoryId } from '../data/categories';
import { SEGMENTS } from '../data/segments';
import { hqEstimate, SITE_BY_ID } from '../data/sites';
import { clockOf, DAY_START_HOUR, isWeekend } from './calendar';
import { priceImageFactor, stockOf, weatherOf } from './simulation';
import type { DayReport, SimState, StoreState, WeatherDay } from './types';

/** 店長の経験則：雨なら1割5分減、気温でカテゴリごとに増減 */
export function weatherFactor(id: CategoryId, w: WeatherDay): number {
  const c = CATEGORY_BY_ID[id];
  const temp = 1 + c.tempSensitivity * (w.temp - c.tempBase);
  return temp * (w.kind === 'rain' ? 0.85 : 1);
}

// 営業開始（6時）からの経過に対して、1日の来店の何割が済んだか
const HOUR_WEIGHTS = new Array(24).fill(0).map((_, h) => SEGMENTS.reduce((a, s) => a + (s.dailyVisits * s.hourly[h]) / s.hourly.reduce((x, y) => x + y, 0), 0));
const TOTAL_WEIGHT = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);

export function elapsedShare(minuteOfDay: number): number {
  let acc = 0;
  const elapsedMinutes = (minuteOfDay - DAY_START_HOUR * 60 + 1440) % 1440;
  for (let m = 0; m < elapsedMinutes; m += 60) {
    const h = (DAY_START_HOUR + m / 60) % 24;
    acc += HOUR_WEIGHTS[h] * Math.min(1, (elapsedMinutes - m) / 60);
  }
  return acc / TOTAL_WEIGHT;
}

export interface Forecast {
  category: CategoryId;
  /** 明日の需要予測 */
  forecast: number;
  /** 推奨発注数 */
  recommended: number;
  /** 根拠の説明 */
  basis: string;
  /** 明日の朝に残っていそうな在庫（日持ちする商品のみ） */
  carryOver: number;
}

/** その日に実際についた平均売価 */
export function avgPrice(r: DayReport, id: CategoryId): number {
  const s = r.cats[id];
  return s.sold > 0 && s.revenue > 0 ? s.revenue / s.sold : (r.prices?.[id] ?? CATEGORY_BY_ID[id].price);
}

/** 天気と価格の影響を取り除いた「標準の条件での需要」 */
function normalizedDemand(r: DayReport, id: CategoryId): number {
  const c = CATEGORY_BY_ID[id];
  return r.cats[id].demand / weatherFactor(id, r.weather) / priceDemandFactor(c, avgPrice(r, id)) / (r.priceImage ?? 1);
}

function demandEstimate(state: SimState, store: StoreState, id: CategoryId, day: number): { value: number; basis: string } {
  const site = SITE_BY_ID[store.siteId];
  const weekend = isWeekend(day);
  const past = store.reports.filter((r) => r.day < day);
  const same = past.filter((r) => isWeekend(r.day) === weekend).slice(-3);
  let base: number;
  let basis: string;
  if (same.length) {
    base = same.reduce((a, r) => a + normalizedDemand(r, id), 0) / same.length;
    basis = `過去${same.length}日分の${weekend ? '土日' : '平日'}の需要（売り逃し分を含む）の平均を、天気と売価で補正`;
  } else if (past.length) {
    const recent = past.slice(-3);
    // 平日と土日の差は、本部の商圏調査の比率で推測する
    const ratio = recent.reduce((a, r) => a + hqEstimate(site, id, weekend) / hqEstimate(site, id, isWeekend(r.day)), 0) / recent.length;
    base = (recent.reduce((a, r) => a + normalizedDemand(r, id), 0) / recent.length) * ratio;
    basis = `${weekend ? '土日' : '平日'}の実績がまだないため、直近の実績と本部の商圏調査から推測`;
  } else {
    base = hqEstimate(site, id, weekend) * store.reputation;
    basis = '実績がまだないため、本部の商圏調査による標準値';
  }
  const priceF = priceDemandFactor(CATEGORY_BY_ID[id], store.prices[id]) * priceImageFactor(store);
  return { value: base * weatherFactor(id, weatherOf(state, day)) * priceF, basis };
}

export function forecastFor(state: SimState, store: StoreState, id: CategoryId): Forecast {
  const c = CATEGORY_BY_ID[id];
  const clock = clockOf(state.tick);
  const target = Math.max(clock.day + 1, store.openDay);
  const est = demandEstimate(state, store, id, target);
  const forecast = Math.round(est.value);

  let carryOver = 0;
  let recommended = forecast;
  if (c.lifeDays > 1) {
    let remaining = 0;
    if (store.openDay <= clock.day) {
      // 今日の残り需要：今日の予測と、ここまでの実績からの見込みを、経過割合で混ぜる
      const share = elapsedShare(clock.minuteOfDay);
      const soFar = store.today.cats[id].demand;
      const planned = demandEstimate(state, store, id, clock.day).value;
      const pace = share > 0 ? soFar / share : planned;
      const todayTotal = planned * (1 - share) + pace * share;
      remaining = Math.max(0, todayTotal - soFar);
    }
    carryOver = Math.max(0, Math.round(stockOf(store, id) - remaining));
    recommended = Math.max(0, Math.round(forecast * 1.1 - carryOver));
  }
  return { category: id, forecast, recommended, basis: est.basis, carryOver };
}

export function allForecasts(state: SimState, store: StoreState): Forecast[] {
  return CATEGORIES.map((c) => forecastFor(state, store, c.id));
}
