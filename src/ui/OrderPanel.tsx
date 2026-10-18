import type { GameController } from '../core/controller';
import { CATEGORIES, type Category } from '../data/categories';
import { dayLabel, isWeekend } from '../sim/calendar';
import { forecastFor } from '../sim/forecast';
import { stockOf, weatherOf } from '../sim/simulation';
import { num, pct, weatherText, yen } from './format';

function History({ c, cat }: { c: GameController; cat: Category }) {
  const rs = c.state.reports.slice(-7);
  if (!rs.length) return <p class="hint">実績はまだありません。</p>;
  const max = Math.max(1, ...rs.map((r) => Math.max(r.cats[cat.id].demand, r.cats[cat.id].delivered)));
  return (
    <div class="hist" aria-label="過去7日の需要と販売">
      {rs.map((r) => {
        const s = r.cats[cat.id];
        return (
          <div class="hist-col" key={r.day} title={`${dayLabel(r.day)} 需要${s.demand} 販売${s.sold} 廃棄${s.wasted}`}>
            <div class="hist-bars">
              <span class="hb demand" style={{ height: `${(s.demand / max) * 100}%` }} />
              <span class="hb sold" style={{ height: `${(s.sold / max) * 100}%` }} />
              {s.wasted > 0 && <span class="hb waste" style={{ height: `${(s.wasted / max) * 100}%` }} />}
            </div>
            <span class={`tick ${isWeekend(r.day) ? 'we' : ''}`}>{dayLabel(r.day).replace(/^\d+\//, '').replace('（', '').replace('）', '')}</span>
          </div>
        );
      })}
    </div>
  );
}

export function OrderPanel({ c }: { c: GameController }) {
  const day = c.clock.day + 1;
  const w = weatherOf(c.state, day);
  const forecasts = CATEGORIES.map((cat) => forecastFor(c.state, cat.id));
  const total = CATEGORIES.reduce((a, cat) => a + c.state.orders[cat.id] * cat.cost, 0);
  const setAll = () => forecasts.forEach((f) => c.dispatch({ type: 'setOrder', category: f.category, qty: f.recommended }));

  return (
    <div class="panel-body">
      <section class="card tomorrow">
        <div>
          <span class="k">明日の発注</span>
          <b class="big">{dayLabel(day)}</b>
          {isWeekend(day) && <span class="tag">週末</span>}
        </div>
        <div class="forecast-weather">
          <span class="k">天気予報</span>
          <b>{weatherText(w)}</b>
        </div>
        <p class="hint">明朝6:00に納品されます。おにぎり・弁当とホットスナックは翌朝6:00に期限切れ（廃棄）、飲料は日持ちします。</p>
      </section>

      {CATEGORIES.map((cat, i) => {
        const f = forecasts[i];
        const qty = c.state.orders[cat.id];
        const margin = cat.price - cat.cost;
        const set = (v: number) => c.dispatch({ type: 'setOrder', category: cat.id, qty: v });
        const diff = qty - f.recommended;
        return (
          <section class="card order" key={cat.id}>
            <div class="order-head">
              <span class="cat big">
                {cat.icon} {cat.name}
              </span>
              <span class="unit">
                売価{yen(cat.price)}・原価{yen(cat.cost)}・<b>粗利率{pct(margin / cat.price)}</b>
              </span>
            </div>
            <History c={c} cat={cat} />
            <div class="legend">
              <i class="demand" />
              需要 <i class="sold" />
              販売 <i class="waste" />
              廃棄
            </div>
            <div class="order-grid">
              <div>
                <span class="k">明日の需要予測</span>
                <b>{num(f.forecast)}</b>
              </div>
              {cat.lifeDays > 1 && (
                <div>
                  <span class="k">明朝の残り在庫(見込)</span>
                  <b>{num(f.carryOver)}</b>
                </div>
              )}
              <div>
                <span class="k">推奨発注</span>
                <b>{num(f.recommended)}</b>
              </div>
              <div>
                <span class="k">現在の在庫</span>
                <b>{num(stockOf(c.state, cat.id))}</b>
              </div>
            </div>
            <div class="stepper">
              <button onClick={() => set(qty - 10)} aria-label={`${cat.name}を10減らす`}>
                −10
              </button>
              <input type="number" inputMode="numeric" min={0} max={2000} value={qty} aria-label={`${cat.name}の発注数`} onChange={(e) => set(+(e.target as HTMLInputElement).value)} />
              <button onClick={() => set(qty + 10)} aria-label={`${cat.name}を10増やす`}>
                ＋10
              </button>
              <button class="ghost" onClick={() => set(f.recommended)}>
                推奨
              </button>
            </div>
            <p class="hint">
              {diff === 0 ? '推奨どおり。' : `推奨より${diff > 0 ? '+' : ''}${num(diff)}。`}
              売り逃し1個の損 {yen(margin)} ／ 廃棄1個の損 {yen(cat.cost)}
              {cat.lifeDays === 1 && (margin > cat.cost ? ' → 多めが得' : ' → 控えめが得')}
            </p>
          </section>
        );
      })}

      <section class="card order-total">
        <div>
          <span class="k">明日の仕入代金</span>
          <b class="big">{yen(total)}</b>
        </div>
        <button class="primary" onClick={setAll}>
          すべて推奨値にする
        </button>
        <p class="hint">推奨値は「過去の実績＋天気の経験則」による予測です。外れることもあります。</p>
      </section>
    </div>
  );
}
