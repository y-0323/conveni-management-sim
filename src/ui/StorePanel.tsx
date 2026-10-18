import type { GameController } from '../core/controller';
import { CATEGORIES } from '../data/categories';
import { DAY_START_HOUR } from '../sim/calendar';
import { ECONOMY, stockOf } from '../sim/simulation';
import { num, pct, sign, yen } from './format';

export function StorePanel({ c }: { c: GameController }) {
  const t = c.state.today;
  const gross = t.sales - t.cogs;
  const maxHour = Math.max(1, ...t.hourlySales);
  const hours = Array.from({ length: 24 }, (_, i) => (DAY_START_HOUR + i) % 24);
  const rep = (c.state.reputation - ECONOMY.reputationMin) / (ECONOMY.reputationMax - ECONOMY.reputationMin);

  return (
    <div class="panel-body">
      <section class="card">
        <h3>今日の営業（6:00〜）</h3>
        <div class="kpis">
          <div>
            <span class="k">来店数</span>
            <span class="v">{num(t.visits)}人</span>
          </div>
          <div>
            <span class="k">売上</span>
            <span class="v">{yen(t.sales)}</span>
          </div>
          <div>
            <span class="k">粗利（廃棄前）</span>
            <span class={`v ${sign(gross)}`}>{yen(gross)}</span>
          </div>
        </div>
        <div class="hourly" aria-label="時間帯別の売上">
          {hours.map((h) => (
            <div class="bar-col" key={h} title={`${h}時 ${yen(t.hourlySales[h])}`}>
              <span class="bar" style={{ height: `${(t.hourlySales[h] / maxHour) * 100}%` }} />
              <span class="tick">{h % 6 === 0 ? h : ''}</span>
            </div>
          ))}
        </div>
      </section>

      <section class="card">
        <h3>売り場の在庫</h3>
        <ul class="stock-list">
          {CATEGORIES.map((cat) => {
            const s = t.cats[cat.id];
            const stock = stockOf(c.state, cat.id);
            const base = Math.max(1, s.delivered + (cat.lifeDays > 1 ? stock + s.sold - s.delivered : 0));
            const ratio = Math.min(1, stock / base);
            return (
              <li key={cat.id}>
                <div class="stock-head">
                  <span class="cat">
                    {cat.icon} {cat.name}
                  </span>
                  <span class={`stock-n ${stock === 0 ? 'neg' : ''}`}>{stock === 0 ? '品切れ！' : `残り ${num(stock)}`}</span>
                </div>
                <div class="meter">
                  <span class={ratio < 0.15 ? 'low' : ''} style={{ width: `${ratio * 100}%` }} />
                </div>
                <div class="stock-meta">
                  販売 {num(s.sold)}
                  {s.lost > 0 && <span class="neg"> ／ 売り逃し {num(s.lost)}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section class="card">
        <h3>お店の評判</h3>
        <div class="meter big">
          <span style={{ width: `${rep * 100}%` }} />
        </div>
        <p class="hint">品切れが少ないと少しずつ上がり、多いと下がります。評判は来店数に直接影響します（現在 来店数 ×{pct(c.state.reputation)}）。</p>
      </section>
    </div>
  );
}
