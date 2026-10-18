// シミュレーション本体。描画・ブラウザに依存しない純粋なロジック
import { CATEGORIES, CATEGORY_BY_ID, type CategoryId } from '../data/categories';
import { SEGMENTS, type SegmentId } from '../data/segments';
import { clockOf, dowOf, isWeekend, TICKS_PER_DAY, TICK_MINUTES } from './calendar';
import { mentorComments } from './mentor';
import { nextRandom, poisson } from './rng';
import type { CategoryStats, Command, DayReport, DayStats, SimState, TickResult, VisitEvent, WeatherDay } from './types';

export const ECONOMY = {
  startCash: 1_000_000,
  laborPerDay: 30_000,
  rentPerDay: 10_000,
  reputationMin: 0.8,
  reputationMax: 1.15,
  defaultOrders: { bento: 320, drink: 250, hotsnack: 160 } as Record<CategoryId, number>,
  initialDrinkStock: 250,
};

const HOURLY_SUM = Object.fromEntries(SEGMENTS.map((s) => [s.id, s.hourly.reduce((a, b) => a + b, 0)])) as Record<SegmentId, number>;

function emptyCats(): Record<CategoryId, CategoryStats> {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, { delivered: 0, sold: 0, lost: 0, wasted: 0, demand: 0 }])) as Record<CategoryId, CategoryStats>;
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

export function stockOf(state: SimState, id: CategoryId): number {
  return state.inventory[id].reduce((a, l) => a + l.qty, 0);
}

export function inventoryValue(state: SimState): number {
  return CATEGORIES.reduce((a, c) => a + stockOf(state, c.id) * c.cost, 0);
}

export function newGame(seed = 20260401): SimState {
  const state: SimState = {
    version: 1,
    seed,
    rng: seed,
    tick: 0,
    cash: ECONOMY.startCash,
    reputation: 1,
    inventory: { bento: [], drink: [{ qty: ECONOMY.initialDrinkStock, expireDay: 1 + CATEGORY_BY_ID.drink.lifeDays }], hotsnack: [] },
    orders: { ...ECONOMY.defaultOrders },
    weather: [],
    today: null as unknown as DayStats,
    cashAtDayStart: ECONOMY.startCash,
    reports: [],
    bankrupt: false,
  };
  state.weather.push(rollWeather(state, 1), rollWeather(state, 2));
  startDay(state, 1);
  return state;
}

/** 営業開始（6:00）：納品して、今日の集計を始める */
function startDay(state: SimState, day: number) {
  if (!state.weather[day]) state.weather[day] = rollWeather(state, day + 1);
  state.today = emptyDay(day, weatherOf(state, day));
  state.cashAtDayStart = state.cash;
  for (const c of CATEGORIES) {
    const qty = Math.max(0, Math.round(state.orders[c.id]));
    if (qty > 0) {
      state.inventory[c.id].push({ qty, expireDay: day + c.lifeDays });
      state.today.cats[c.id].delivered = qty;
      const cost = qty * c.cost;
      state.today.purchases += cost;
      state.cash -= cost;
    }
  }
}

/** 営業終了（翌6:00）：期限切れを廃棄し、人件費・家賃を払い、日報を作る */
function endDay(state: SimState): DayReport {
  const t = state.today;
  const nextDay = t.day + 1;
  for (const c of CATEGORIES) {
    const keep = [];
    for (const lot of state.inventory[c.id]) {
      if (lot.expireDay <= nextDay) {
        t.cats[c.id].wasted += lot.qty;
        t.waste += lot.qty * c.cost;
      } else keep.push(lot);
    }
    state.inventory[c.id] = keep;
  }
  const labor = ECONOMY.laborPerDay;
  const rent = ECONOMY.rentPerDay;
  state.cash -= labor + rent;

  // 評判：欠品が多いと下がり、品切れがほぼなければ少しずつ上がる
  const demand = CATEGORIES.reduce((a, c) => a + t.cats[c.id].demand, 0);
  const lost = CATEGORIES.reduce((a, c) => a + t.cats[c.id].lost, 0);
  const lostRate = demand ? lost / demand : 0;
  const before = state.reputation;
  const delta = lostRate < 0.05 ? 0.01 : -0.25 * lostRate;
  state.reputation = Math.min(ECONOMY.reputationMax, Math.max(ECONOMY.reputationMin, before + delta));

  const grossProfit = t.sales - t.cogs - t.waste;
  const report: DayReport = {
    ...t,
    labor,
    rent,
    grossProfit,
    operatingProfit: grossProfit - labor - rent,
    cashStart: state.cashAtDayStart,
    cashEnd: state.cash,
    inventoryValue: inventoryValue(state),
    reputationBefore: before,
    reputationAfter: state.reputation,
    comments: [],
  };
  report.comments = mentorComments(report, state.reports);
  state.reports.push(report);
  if (state.cash < 0) state.bankrupt = true;
  return report;
}

function takeFromStock(state: SimState, id: CategoryId): boolean {
  const lots = state.inventory[id];
  // 期限が近いものから売る（先入れ先出し）
  for (const lot of lots) {
    if (lot.qty > 0) {
      lot.qty -= 1;
      if (lot.qty === 0) lots.splice(lots.indexOf(lot), 1);
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

/** 15分進める */
export function step(state: SimState): TickResult {
  const clock = clockOf(state.tick);
  const t = state.today;
  const weekend = isWeekend(clock.day);
  const visits: VisitEvent[] = [];

  for (const seg of SEGMENTS) {
    const share = seg.hourly[clock.hour] / HOURLY_SUM[seg.id];
    const perTick = share * (TICK_MINUTES / 60);
    const lambda =
      seg.dailyVisits * perTick * (weekend ? seg.weekendFactor : 1) * (t.weather.kind === 'rain' ? seg.rainFactor : 1) * state.reputation;
    const n = poisson(state, lambda);
    for (let i = 0; i < n; i++) {
      const v: VisitEvent = { segment: seg.id, bought: [], missed: [] };
      for (const c of CATEGORIES) {
        if (nextRandom(state) >= buyProbability(c.id, seg.buyProb[c.id], clock.hour, t.weather.temp)) continue;
        const cs = t.cats[c.id];
        cs.demand += 1;
        if (takeFromStock(state, c.id)) {
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

  state.tick += 1;
  let report: DayReport | null = null;
  if (state.tick % TICKS_PER_DAY === 0) {
    report = endDay(state);
    startDay(state, clockOf(state.tick).day);
  }
  return { visits, report };
}

export function dispatch(state: SimState, cmd: Command) {
  switch (cmd.type) {
    case 'setOrder':
      state.orders[cmd.category] = Math.max(0, Math.min(2000, Math.round(cmd.qty)));
      break;
  }
}
