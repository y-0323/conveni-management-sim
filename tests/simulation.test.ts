import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../src/data/categories';
import { clockOf, TICKS_PER_DAY } from '../src/sim/calendar';
import { forecastFor } from '../src/sim/forecast';
import { dispatch, ECONOMY, inventoryValue, newGame, step, stockOf } from '../src/sim/simulation';
import type { DayReport, SimState } from '../src/sim/types';

function runDays(state: SimState, days: number, onDay?: (s: SimState) => void): DayReport[] {
  const reports: DayReport[] = [];
  for (let i = 0; i < days * TICKS_PER_DAY; i++) {
    const r = step(state);
    if (r.report) {
      reports.push(r.report);
      onDay?.(state);
    }
  }
  return reports;
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
    const a = runDays(newGame(42), 5);
    const b = runDays(newGame(42), 5);
    expect(a.map((r) => r.sales)).toEqual(b.map((r) => r.sales));
    const c = runDays(newGame(43), 5);
    expect(c.map((r) => r.sales)).not.toEqual(a.map((r) => r.sales));
  });

  it('売れた数 + 廃棄 + 残り在庫 = 納品数 + 前日在庫', () => {
    const s = newGame(1);
    const before = Object.fromEntries(CATEGORIES.map((c) => [c.id, stockOf(s, c.id) - s.today.cats[c.id].delivered]));
    const [r] = runDays(s, 1);
    for (const c of CATEGORIES) {
      const cs = r.cats[c.id];
      // 翌日分の納品を除いた、日報時点の残り在庫
      const after = stockOf(s, c.id) - s.today.cats[c.id].delivered;
      expect(before[c.id] + cs.delivered).toBe(cs.sold + cs.wasted + after);
    }
  });

  it('お金の計算が合う：現金の増減 = 売上 − 仕入 − 人件費 − 家賃、利益 = 現金増減 + 在庫の増減', () => {
    const s = newGame(7);
    const invStart = inventoryValue(s) - s.today.purchases; // 1日目の納品前
    const [r] = runDays(s, 1);
    expect(r.cashEnd - r.cashStart).toBe(r.sales - r.purchases - r.labor - r.rent);
    // 日報時点の在庫評価額（翌日の納品前）
    expect(r.operatingProfit).toBe(r.cashEnd - r.cashStart + (r.inventoryValue - invStart));
  });

  it('期限1日の商品は翌日に持ち越されず廃棄される', () => {
    const s = newGame(3);
    dispatch(s, { type: 'setOrder', category: 'bento', qty: 2000 });
    const reports = runDays(s, 2);
    expect(reports[1].cats.bento.wasted).toBeGreaterThan(1000);
    expect(reports[1].cats.bento.lost).toBe(0);
  });

  it('発注ゼロなら全部が機会損失になり、評判が下がる', () => {
    const s = newGame(5);
    runDays(s, 1);
    dispatch(s, { type: 'setOrder', category: 'bento', qty: 0 });
    dispatch(s, { type: 'setOrder', category: 'hotsnack', qty: 0 });
    // 2日目の朝に納品済みなので、3日目から品切れ
    const reports = runDays(s, 3);
    const last = reports[2];
    expect(last.cats.bento.sold).toBe(0);
    expect(last.cats.bento.lost).toBe(last.cats.bento.demand);
    expect(last.reputationAfter).toBeLessThan(reports[0].reputationBefore);
  });

  it('推奨発注どおりに30日経営すると黒字で、廃棄も品切れも極端にならない', () => {
    const s = newGame(2026);
    const reports = runDays(s, 30, (st) => {
      for (const c of CATEGORIES) dispatch(st, { type: 'setOrder', category: c.id, qty: forecastFor(st, c.id).recommended });
    });
    const profit = reports.reduce((a, r) => a + r.operatingProfit, 0);
    expect(profit).toBeGreaterThan(0);
    for (const c of CATEGORIES) {
      const demand = reports.reduce((a, r) => a + r.cats[c.id].demand, 0);
      const lost = reports.reduce((a, r) => a + r.cats[c.id].lost, 0);
      expect(lost / demand).toBeLessThan(0.15);
    }
    expect(s.cash).toBeGreaterThan(ECONOMY.startCash);
  });

  it('発注を変えずに放置すると、推奨発注より利益が少ない', () => {
    const lazy = runDays(newGame(99), 30).reduce((a, r) => a + r.operatingProfit, 0);
    const s = newGame(99);
    const smart = runDays(s, 30, (st) => {
      for (const c of CATEGORIES) dispatch(st, { type: 'setOrder', category: c.id, qty: forecastFor(st, c.id).recommended });
    }).reduce((a, r) => a + r.operatingProfit, 0);
    expect(smart).toBeGreaterThan(lazy);
  });
});
