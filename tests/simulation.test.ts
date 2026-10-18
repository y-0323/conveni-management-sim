import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../src/data/categories';
import { SITE_BY_ID } from '../src/data/sites';
import { clockOf, TICKS_PER_DAY } from '../src/sim/calendar';
import { forecastFor } from '../src/sim/forecast';
import { canOpen, dispatch, ECONOMY, expansionChecks, inventoryValue, newGame, rushQuote, shelfRatio, step, stockOf, storeOf } from '../src/sim/simulation';
import type { CompanyDay, DayReport, SimState } from '../src/sim/types';

interface DayResult {
  reports: DayReport[];
  company: CompanyDay;
}

function runDays(state: SimState, days: number, onDay?: (s: SimState) => void): DayResult[] {
  const out: DayResult[] = [];
  for (let i = 0; i < days * TICKS_PER_DAY; i++) {
    const r = step(state);
    if (r.reports && r.company) {
      out.push({ reports: r.reports, company: r.company });
      onDay?.(state);
    }
  }
  return out;
}

const main = (s: SimState) => storeOf(s, 'main')!;

/** 全店で推奨発注どおりに発注する */
function autoOrder(s: SimState) {
  for (const store of s.stores) for (const c of CATEGORIES) dispatch(s, { type: 'setOrder', siteId: store.siteId, category: c.id, qty: forecastFor(s, store, c.id).recommended });
}

describe('時計', () => {
  it('1日目は6:00に始まり、96刻みで翌日6:00になる', () => {
    expect(clockOf(0)).toMatchObject({ day: 1, hour: 6, minute: 0 });
    expect(clockOf(72)).toMatchObject({ day: 1, hour: 0, minute: 0 });
    expect(clockOf(TICKS_PER_DAY)).toMatchObject({ day: 2, hour: 6 });
  });
});

describe('シミュレーション', () => {
  it('同じシードなら同じ結果になる（再現性）', () => {
    const a = runDays(newGame(42), 5).map((d) => d.company.sales);
    const b = runDays(newGame(42), 5).map((d) => d.company.sales);
    expect(a).toEqual(b);
    expect(runDays(newGame(43), 5).map((d) => d.company.sales)).not.toEqual(a);
  });

  it('売れた数 + 廃棄 + 残り在庫 = 納品数 + 前日在庫', () => {
    const s = newGame(1);
    const before = Object.fromEntries(CATEGORIES.map((c) => [c.id, stockOf(main(s), c.id) - main(s).today.cats[c.id].delivered]));
    const [{ reports }] = runDays(s, 1);
    const r = reports[0];
    for (const c of CATEGORIES) {
      const cs = r.cats[c.id];
      const after = stockOf(main(s), c.id) - main(s).today.cats[c.id].delivered;
      expect(before[c.id] + cs.delivered).toBe(cs.sold + cs.wasted + after);
    }
  });

  it('お金の計算が合う：現金の増減 = 売上 − 仕入 − 人件費 − 家賃、利益 = 現金増減 + 在庫の増減', () => {
    const s = newGame(7);
    const invStart = inventoryValue(main(s)) - main(s).today.purchases; // 1日目の納品前
    const [{ reports, company }] = runDays(s, 1);
    const r = reports[0];
    expect(company.cashEnd - company.cashStart).toBe(r.sales - r.purchases - r.labor - r.rent);
    expect(r.operatingProfit).toBe(company.cashEnd - company.cashStart + (r.inventoryValue - invStart));
  });

  it('期限1日の商品は翌日に持ち越されず廃棄される', () => {
    const s = newGame(3);
    dispatch(s, { type: 'setOrder', siteId: 'main', category: 'bento', qty: 2000 });
    const days = runDays(s, 2);
    expect(days[1].reports[0].cats.bento.wasted).toBeGreaterThan(1000);
    expect(days[1].reports[0].cats.bento.lost).toBe(0);
  });

  it('発注ゼロなら全部が機会損失になり、評判が下がる', () => {
    const s = newGame(5);
    runDays(s, 1);
    dispatch(s, { type: 'setOrder', siteId: 'main', category: 'bento', qty: 0 });
    dispatch(s, { type: 'setOrder', siteId: 'main', category: 'hotsnack', qty: 0 });
    const days = runDays(s, 3);
    const last = days[2].reports[0];
    expect(last.cats.bento.sold).toBe(0);
    expect(last.cats.bento.lost).toBe(last.cats.bento.demand);
    expect(last.reputationAfter).toBeLessThan(days[0].reports[0].reputationBefore);
  });

  it('棚の充足率は、売れるほど下がり、品切れで0になる', () => {
    const s = newGame(11);
    expect(shelfRatio(main(s), 'bento')).toBe(1);
    for (let i = 0; i < 40; i++) step(s);
    const mid = shelfRatio(main(s), 'bento');
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(0);
    dispatch(s, { type: 'setOrder', siteId: 'main', category: 'bento', qty: 0 });
    runDays(s, 2);
    for (let i = 0; i < 40; i++) step(s);
    expect(shelfRatio(main(s), 'bento')).toBe(0);
  });

  it('推奨発注どおりに30日経営すると黒字で、品切れも極端にならない', () => {
    const s = newGame(2026);
    const days = runDays(s, 30, autoOrder);
    const reports = days.flatMap((d) => d.reports);
    expect(reports.reduce((a, r) => a + r.operatingProfit, 0)).toBeGreaterThan(0);
    for (const c of CATEGORIES) {
      const demand = reports.reduce((a, r) => a + r.cats[c.id].demand, 0);
      const lost = reports.reduce((a, r) => a + r.cats[c.id].lost, 0);
      expect(lost / demand).toBeLessThan(0.15);
    }
    expect(s.cash).toBeGreaterThan(ECONOMY.startCash);
  });

  it('発注を変えずに放置すると、推奨発注より利益が少ない', () => {
    const lazy = runDays(newGame(99), 30).reduce((a, d) => a + d.company.operatingProfit, 0);
    const smart = runDays(newGame(99), 30, autoOrder).reduce((a, d) => a + d.company.operatingProfit, 0);
    expect(smart).toBeGreaterThan(lazy);
  });
});

describe('緊急補充', () => {
  it('営業中に発注すると2時間後に棚に届き、配送料が利益から引かれる', () => {
    const s = newGame(8);
    for (let i = 0; i < 24; i++) step(s); // 12:00
    const before = stockOf(main(s), 'hotsnack');
    dispatch(s, { type: 'rushOrder', siteId: 'main', category: 'hotsnack', qty: 50 });
    expect(main(s).rush).toHaveLength(1);
    for (let i = 0; i < ECONOMY.rush.leadTicks - 1; i++) step(s);
    expect(main(s).rush).toHaveLength(1); // まだ届かない
    const r = step(s);
    expect(r.arrivals).toEqual([{ siteId: 'main', category: 'hotsnack', qty: 50 }]);
    expect(main(s).rush).toHaveLength(0);
    expect(main(s).today.cats.hotsnack.delivered).toBeGreaterThan(50);
    // 届いた直後は在庫が増え、棚の基準も上がる
    expect(stockOf(main(s), 'hotsnack')).toBeGreaterThan(before - 30);
    expect(shelfRatio(main(s), 'hotsnack')).toBeGreaterThan(0.5);

    const days = runDays(s, 1);
    const rep = days[0].reports[0];
    expect(rep.rushFees).toBe(ECONOMY.rush.fee);
    expect(rep.operatingProfit).toBe(rep.grossProfit - rep.labor - rep.rent - rep.depreciation - rep.rushFees);
    expect(days[0].company.cashEnd - days[0].company.cashStart).toBe(rep.sales - rep.purchases - rep.labor - rep.rent - rep.rushFees);
  });

  it('深夜と開店前は受け付けない', () => {
    const s = newGame(9);
    for (let i = 0; i < 80; i++) step(s); // 2:00
    expect(rushQuote(s, main(s), 'bento', 30).ok).toBe(false);
    dispatch(s, { type: 'rushOrder', siteId: 'main', category: 'bento', qty: 30 });
    expect(main(s).rush).toHaveLength(0);
  });
});

describe('出店', () => {
  it('開業直後は出店できない（軌道に乗っていない）', () => {
    const s = newGame(1);
    expect(canOpen(s, 'home')).toBe(false);
    dispatch(s, { type: 'openStore', siteId: 'home' });
    expect(s.stores).toHaveLength(1);
  });

  it('利益が出続けると出店でき、翌朝に開店して客が来る。出店費用は現金から引かれる', () => {
    const s = newGame(2026);
    let day = 0;
    while (!canOpen(s, 'home') && day < 60) {
      runDays(s, 1, autoOrder);
      day++;
    }
    expect(canOpen(s, 'home'), JSON.stringify(expansionChecks(s, 'home'))).toBe(true);
    const cash = s.cash;
    dispatch(s, { type: 'openStore', siteId: 'home' });
    expect(s.cash).toBe(cash - SITE_BY_ID.home.openCost);
    expect(canOpen(s, 'home')).toBe(false);

    // 開店前の日は日報が出ない → 翌日から営業
    const [first, second] = runDays(s, 2, autoOrder);
    expect(first.reports.map((r) => r.siteId)).toEqual(['main']);
    expect(first.company.investment).toBe(SITE_BY_ID.home.openCost);
    const home = second.reports.find((r) => r.siteId === 'home')!;
    expect(home.visits).toBeGreaterThan(200);
    expect(home.depreciation).toBeGreaterThan(0);
    // 住宅街店は近所の住民が多い
    expect(home.visitsBySegment.resident).toBeGreaterThan(home.visitsBySegment.worker);
  });

  it('全店で推奨発注を続ければ、2店舗目も1か月で黒字になる', () => {
    const s = newGame(31);
    while (!canOpen(s, 'school')) runDays(s, 1, autoOrder);
    dispatch(s, { type: 'openStore', siteId: 'school' });
    const days = runDays(s, 30, autoOrder);
    const school = days.flatMap((d) => d.reports).filter((r) => r.siteId === 'school');
    expect(school.length).toBeGreaterThanOrEqual(29);
    expect(school.reduce((a, r) => a + r.operatingProfit, 0)).toBeGreaterThan(0);
  });
});
