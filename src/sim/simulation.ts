// シミュレーション本体。描画・ブラウザに依存しない純粋なロジック
import { CATEGORIES, CATEGORY_BY_ID, type CategoryId } from '../data/categories';
import { SEGMENTS, type SegmentId } from '../data/segments';
import { defaultOrders, SITE_BY_ID, SITES, type SiteId } from '../data/sites';
import { clockOf, dowOf, isWeekend, TICKS_PER_DAY, TICK_MINUTES } from './calendar';
import { mentorComments } from './mentor';
import { nextRandom, poisson } from './rng';
import type { CategoryStats, Command, CompanyDay, DayReport, DayStats, SimState, StoreState, TickResult, VisitEvent, WeatherDay } from './types';

export const ECONOMY = {
  startCash: 1_000_000,
  laborPerDay: 30_000,
  reputationMin: 0.8,
  reputationMax: 1.15,
  newStoreReputation: 0.9,
  initialDrinkStock: 250,
  /** 出店費用の償却日数（2年） */
  depreciationDays: 730,
  /** 緊急補充：発注から届くまでの刻み数（2時間）と、1回あたりの配送料 */
  rush: { leadTicks: 8, fee: 2_000, maxQty: 300, lastOrderTick: 64 /* 22:00 */ },
  /** 出店の条件 */
  expansion: { minDays: 7, profitDays: 7, minProfit: 150_000 },
};

const HOURLY_SUM = Object.fromEntries(SEGMENTS.map((s) => [s.id, s.hourly.reduce((a, b) => a + b, 0)])) as Record<SegmentId, number>;

function emptyCats(): Record<CategoryId, CategoryStats> {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, { startStock: 0, delivered: 0, sold: 0, lost: 0, wasted: 0, demand: 0 }])) as Record<CategoryId, CategoryStats>;
}

function emptyDay(day: number, weather: WeatherDay): DayStats {
  return {
    day,
    dow: dowOf(day),
    weather,
    visits: 0,
    visitsBySegment: { worker: 0, student: 0, resident: 0 },
    cats: emptyCats(),
    hourlySales: new Array(24).fill(0),
    sales: 0,
    cogs: 0,
    waste: 0,
    purchases: 0,
    rushFees: 0,
    rushCount: 0,
  };
}

/** 春（4月）の天気。気温は日を追うごとに少しずつ上がる */
function rollWeather(state: SimState, day: number): WeatherDay {
  const r = nextRandom(state);
  const kind = r < 0.5 ? 'sunny' : r < 0.78 ? 'cloudy' : 'rain';
  const seasonal = 15 + day * 0.15;
  const noise = (nextRandom(state) - 0.5) * 8;
  const temp = Math.round(seasonal + noise + (kind === 'sunny' ? 2 : kind === 'rain' ? -3 : 0));
  return { kind, temp };
}

export function weatherOf(state: SimState, day: number): WeatherDay {
  return state.weather[day - 1];
}

export function stockOf(store: StoreState, id: CategoryId): number {
  return store.inventory[id].reduce((a, l) => a + l.qty, 0);
}

/** 棚の充足率（営業開始時の在庫に対する残り。0〜1） */
export function shelfRatio(store: StoreState, id: CategoryId): number {
  const start = store.today.cats[id].startStock;
  if (start <= 0) return 0;
  return Math.min(1, stockOf(store, id) / start);
}

export function inventoryValue(store: StoreState): number {
  return CATEGORIES.reduce((a, c) => a + stockOf(store, c.id) * c.cost, 0);
}

export function storeOf(state: SimState, siteId: SiteId): StoreState | undefined {
  return state.stores.find((s) => s.siteId === siteId);
}

export function isOpen(store: StoreState, day: number): boolean {
  return store.openDay <= day;
}

function newStore(state: SimState, siteId: SiteId, openDay: number): StoreState {
  const store: StoreState = {
    siteId,
    rush: [],
    openDay,
    reputation: siteId === 'main' ? 1 : ECONOMY.newStoreReputation,
    inventory: { bento: [], drink: [], hotsnack: [] },
    orders: defaultOrders(SITE_BY_ID[siteId]),
    today: emptyDay(openDay, weatherOf(state, openDay) ?? { kind: 'sunny', temp: 18 }),
    reports: [],
  };
  return store;
}

export function newGame(seed = 20260401): SimState {
  const state: SimState = {
    version: 2,
    seed,
    rng: seed,
    tick: 0,
    cash: ECONOMY.startCash,
    stores: [],
    weather: [],
    cashAtDayStart: ECONOMY.startCash,
    investmentToday: 0,
    companyReports: [],
    bankrupt: false,
  };
  state.weather.push(rollWeather(state, 1), rollWeather(state, 2));
  const main = newStore(state, 'main', 1);
  main.inventory.drink.push({ qty: ECONOMY.initialDrinkStock, expireDay: 1 + CATEGORY_BY_ID.drink.lifeDays });
  state.stores.push(main);
  startDay(state, 1);
  return state;
}

/** 営業開始（6:00）：各店に納品して、今日の集計を始める */
function startDay(state: SimState, day: number) {
  if (!state.weather[day]) state.weather[day] = rollWeather(state, day + 1);
  state.cashAtDayStart = state.cash;
  state.investmentToday = 0;
  for (const store of state.stores) {
    store.today = emptyDay(day, weatherOf(state, day));
    if (!isOpen(store, day)) continue;
    for (const c of CATEGORIES) {
      const qty = Math.max(0, Math.round(store.orders[c.id]));
      if (qty > 0) {
        store.inventory[c.id].push({ qty, expireDay: day + c.lifeDays });
        store.today.cats[c.id].delivered = qty;
        const cost = qty * c.cost;
        store.today.purchases += cost;
        state.cash -= cost;
      }
      store.today.cats[c.id].startStock = stockOf(store, c.id);
    }
  }
}

function endStoreDay(state: SimState, store: StoreState): DayReport {
  const t = store.today;
  const nextDay = t.day + 1;
  for (const c of CATEGORIES) {
    const keep = [];
    for (const lot of store.inventory[c.id]) {
      if (lot.expireDay <= nextDay) {
        t.cats[c.id].wasted += lot.qty;
        t.waste += lot.qty * c.cost;
      } else keep.push(lot);
    }
    store.inventory[c.id] = keep;
  }
  const site = SITE_BY_ID[store.siteId];
  const labor = ECONOMY.laborPerDay;
  const rent = site.rentPerDay;
  const depreciation = Math.round(site.openCost / ECONOMY.depreciationDays);
  state.cash -= labor + rent;

  // 評判：欠品が少なければ少しずつ上がり、多いと下がる
  const demand = CATEGORIES.reduce((a, c) => a + t.cats[c.id].demand, 0);
  const lost = CATEGORIES.reduce((a, c) => a + t.cats[c.id].lost, 0);
  const lostRate = demand ? lost / demand : 0;
  const before = store.reputation;
  const delta = lostRate < 0.05 ? 0.01 : -0.25 * lostRate;
  store.reputation = Math.min(ECONOMY.reputationMax, Math.max(ECONOMY.reputationMin, before + delta));

  state.cash -= t.rushFees;
  const grossProfit = t.sales - t.cogs - t.waste;
  const report: DayReport = {
    ...t,
    siteId: store.siteId,
    labor,
    rent,
    depreciation,
    grossProfit,
    operatingProfit: grossProfit - labor - rent - depreciation - t.rushFees,
    inventoryValue: inventoryValue(store),
    reputationBefore: before,
    reputationAfter: store.reputation,
    comments: [],
  };
  report.comments = mentorComments(report, store.reports);
  store.reports.push(report);
  return report;
}

/** 営業終了（翌6:00）：期限切れを廃棄し、人件費・家賃を払い、日報を作る */
function endDay(state: SimState): { reports: DayReport[]; company: CompanyDay } {
  const day = clockOf(state.tick - 1).day;
  const reports = state.stores.filter((s) => isOpen(s, day)).map((s) => endStoreDay(state, s));
  const company: CompanyDay = {
    day,
    sales: reports.reduce((a, r) => a + r.sales, 0),
    operatingProfit: reports.reduce((a, r) => a + r.operatingProfit, 0),
    cashStart: state.cashAtDayStart,
    cashEnd: state.cash,
    investment: state.investmentToday,
    storeCount: reports.length,
  };
  state.companyReports.push(company);
  if (state.cash < 0) state.bankrupt = true;
  return { reports, company };
}

function takeFromStock(store: StoreState, id: CategoryId): boolean {
  const lots = store.inventory[id];
  // 期限が近いものから売る（先入れ先出し）
  for (let i = 0; i < lots.length; i++) {
    if (lots[i].qty > 0) {
      lots[i].qty -= 1;
      if (lots[i].qty === 0) lots.splice(i, 1);
      return true;
    }
  }
  return false;
}

function buyProbability(id: CategoryId, base: number, hour: number, temp: number): number {
  const c = CATEGORY_BY_ID[id];
  const tempF = 1 + c.tempSensitivity * (temp - c.tempBase);
  const hourF = c.hourBias?.[hour] ?? 1;
  return Math.min(0.95, Math.max(0, base * tempF * hourF));
}

export interface RushQuote {
  ok: boolean;
  reason?: string;
  /** 到着時刻（ゲーム開始からの刻み） */
  arriveTick: number;
  goodsCost: number;
  fee: number;
}

/** 緊急補充の見積もり。翌朝の納品までに届かない時間帯は受け付けない */
export function rushQuote(state: SimState, store: StoreState, id: CategoryId, qty: number): RushQuote {
  const r = ECONOMY.rush;
  const clock = clockOf(state.tick);
  const arriveTick = state.tick + r.leadTicks;
  const base = { arriveTick, goodsCost: qty * CATEGORY_BY_ID[id].cost, fee: r.fee };
  if (!isOpen(store, clock.day)) return { ...base, ok: false, reason: '開店前です' };
  if (clock.tickInDay >= r.lastOrderTick) return { ...base, ok: false, reason: '22時で受付終了（翌朝の納品を待ちましょう）' };
  if (qty <= 0 || qty > r.maxQty) return { ...base, ok: false, reason: `1回 ${r.maxQty}個まで` };
  return { ...base, ok: true };
}

function deliverRush(state: SimState, store: StoreState): TickResult['arrivals'] {
  const day = clockOf(state.tick).day;
  const arrived: TickResult['arrivals'] = [];
  store.rush = store.rush.filter((d) => {
    if (d.arriveTick > state.tick) return true;
    const c = CATEGORY_BY_ID[d.category];
    store.inventory[d.category].push({ qty: d.qty, expireDay: day + c.lifeDays });
    const cs = store.today.cats[d.category];
    cs.delivered += d.qty;
    // 棚の基準も補充分だけ増やす（補充直後は棚がいっぱいに見える）
    cs.startStock = Math.max(cs.startStock, stockOf(store, d.category));
    const cost = d.qty * c.cost;
    store.today.purchases += cost;
    state.cash -= cost;
    arrived.push({ siteId: store.siteId, category: d.category, qty: d.qty });
    return false;
  });
  return arrived;
}

/** 15分進める */
export function step(state: SimState): TickResult {
  const clock = clockOf(state.tick);
  const weekend = isWeekend(clock.day);
  const visits: VisitEvent[] = [];
  const arrivals: TickResult['arrivals'] = [];

  for (const store of state.stores) {
    if (!isOpen(store, clock.day)) continue;
    const t = store.today;
    const site = SITE_BY_ID[store.siteId];
    for (const seg of SEGMENTS) {
      const share = seg.hourly[clock.hour] / HOURLY_SUM[seg.id];
      const perTick = share * (TICK_MINUTES / 60);
      const lambda =
        seg.dailyVisits *
        site.segmentMult[seg.id] *
        perTick *
        (weekend ? seg.weekendFactor : 1) *
        (t.weather.kind === 'rain' ? seg.rainFactor : 1) *
        store.reputation;
      const n = poisson(state, lambda);
      for (let i = 0; i < n; i++) {
        const v: VisitEvent = { siteId: store.siteId, segment: seg.id, bought: [], missed: [] };
        for (const c of CATEGORIES) {
          if (nextRandom(state) >= buyProbability(c.id, seg.buyProb[c.id], clock.hour, t.weather.temp)) continue;
          const cs = t.cats[c.id];
          cs.demand += 1;
          if (takeFromStock(store, c.id)) {
            cs.sold += 1;
            t.sales += c.price;
            t.cogs += c.cost;
            t.hourlySales[clock.hour] += c.price;
            state.cash += c.price;
            v.bought.push(c.id);
          } else {
            cs.lost += 1;
            v.missed.push(c.id);
          }
        }
        t.visits += 1;
        t.visitsBySegment[seg.id] += 1;
        visits.push(v);
      }
    }
  }

  state.tick += 1;
  for (const store of state.stores) if (store.rush.length) arrivals.push(...deliverRush(state, store));
  if (state.tick % TICKS_PER_DAY === 0) {
    const { reports, company } = endDay(state);
    startDay(state, clockOf(state.tick).day);
    return { visits, arrivals, reports, company };
  }
  return { visits, arrivals, reports: null, company: null };
}

export interface ExpansionCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/** 出店できるか（「軌道に乗った」かどうか）の判定 */
export function expansionChecks(state: SimState, siteId: SiteId): ExpansionCheck[] {
  const site = SITE_BY_ID[siteId];
  const e = ECONOMY.expansion;
  const days = state.companyReports.length;
  const recent = state.companyReports.slice(-e.profitDays);
  const profit = recent.reduce((a, r) => a + r.operatingProfit, 0);
  const yen = (n: number) => `${n < 0 ? '−' : ''}¥${Math.abs(Math.round(n)).toLocaleString('ja-JP')}`;
  return [
    { label: `${e.minDays}日以上営業している`, ok: days >= e.minDays, detail: `${days}日営業` },
    { label: `直近${e.profitDays}日の営業利益が ${yen(e.minProfit)} 以上`, ok: days >= e.minDays && profit >= e.minProfit, detail: `現在 ${yen(profit)}` },
    { label: `出店費用 ${yen(site.openCost)} を払える現金がある`, ok: state.cash >= site.openCost, detail: `現金 ${yen(state.cash)}` },
  ];
}

export function canOpen(state: SimState, siteId: SiteId): boolean {
  return !storeOf(state, siteId) && expansionChecks(state, siteId).every((c) => c.ok);
}

export function dispatch(state: SimState, cmd: Command) {
  switch (cmd.type) {
    case 'setOrder': {
      const store = storeOf(state, cmd.siteId);
      if (store) store.orders[cmd.category] = Math.max(0, Math.min(2000, Math.round(cmd.qty)));
      break;
    }
    case 'rushOrder': {
      const store = storeOf(state, cmd.siteId);
      if (!store) return;
      const q = rushQuote(state, store, cmd.category, cmd.qty);
      if (!q.ok) return;
      store.rush.push({ category: cmd.category, qty: Math.round(cmd.qty), arriveTick: q.arriveTick });
      store.today.rushFees += q.fee;
      store.today.rushCount += 1;
      break;
    }
    case 'openStore': {
      if (!canOpen(state, cmd.siteId)) return;
      const site = SITE_BY_ID[cmd.siteId];
      const day = clockOf(state.tick).day;
      state.cash -= site.openCost;
      state.investmentToday += site.openCost;
      // 開店準備をして、翌朝6:00に開店（最初の納品は本部の標準発注）
      state.stores.push(newStore(state, cmd.siteId, day + 1));
      state.stores.sort((a, b) => SITES.findIndex((s) => s.id === a.siteId) - SITES.findIndex((s) => s.id === b.siteId));
      break;
    }
  }
}
