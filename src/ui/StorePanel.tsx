import type { GameController } from '../core/controller';
import { CATEGORIES, type CategoryId } from '../data/categories';
import { SITE_BY_ID } from '../data/sites';
import { clockOf, DAY_START_HOUR, timeLabel } from '../sim/calendar';
import { ECONOMY, isOpen, rushQuote, shelfRatio, stockOf } from '../sim/simulation';
import { LOW_STOCK } from '../game/StoreScene';
import { num, pct, sign, yen } from './format';

function RushButtons({ c, cat }: { c: GameController; cat: CategoryId }) {
  const store = c.store;
  const options = cat === 'drink' ? [50, 100] : [20, 50];
  const q = rushQuote(c.state, store, cat, options[0]);
  return (
    <div class="rush-row">
      <span class="rush-label">🚚 緊急補充</span>
      {options.map((n) => {
        const quote = rushQuote(c.state, store, cat, n);
        return (
          <button
            key={n}
            disabled={!quote.ok}
            title={quote.ok ? `${timeLabel(clockOf(quote.arriveTick))}着・商品代¥${quote.goodsCost.toLocaleString('ja-JP')}＋配送料¥${quote.fee.toLocaleString('ja-JP')}` : quote.reason}
            onClick={() => c.dispatch({ type: 'rushOrder', siteId: store.siteId, category: cat, qty: n })}
          >
            +{n}
          </button>
        );
      })}
      <span class="rush-note">{q.ok ? `${timeLabel(clockOf(q.arriveTick))}着` : q.reason}</span>
    </div>
  );
}

export function StorePanel({ c }: { c: GameController }) {
  const store = c.store;
  const site = SITE_BY_ID[store.siteId];
  if (!isOpen(store, c.clock.day)) {
    return (
      <div class="panel-body">
        <section class="card">
          <h3>🚧 {site.name}は開店準備中</h3>
          <p>明朝6:00にオープンします。最初の納品は本部の標準発注です。「発注」タブで数を調整できます。</p>
        </section>
      </div>
    );
  }
  const t = store.today;
  const gross = t.sales - t.cogs;
  const maxHour = Math.max(1, ...t.hourlySales);
  const hours = Array.from({ length: 24 }, (_, i) => (DAY_START_HOUR + i) % 24);
  const rep = (store.reputation - ECONOMY.reputationMin) / (ECONOMY.reputationMax - ECONOMY.reputationMin);
  const setOrder = (id: CategoryId, qty: number) => c.dispatch({ type: 'setOrder', siteId: store.siteId, category: id, qty });

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
            const stock = stockOf(store, cat.id);
            const ratio = shelfRatio(store, cat.id);
            const level = stock <= 0 ? 'empty' : ratio < LOW_STOCK ? 'low' : 'ok';
            return (
              <li key={cat.id} class={`lvl-${level}`}>
                <div class="stock-head">
                  <span class="cat">
                    {cat.icon} {cat.name}
                  </span>
                  <span class="stock-n">{level === 'empty' ? '品切れ！' : level === 'low' ? `残りわずか ${num(stock)}` : `残り ${num(stock)}`}</span>
                </div>
                <div class="meter">
                  <span class={level} style={{ width: `${ratio * 100}%` }} />
                </div>
                <div class="stock-meta">
                  販売 {num(s.sold)}
                  {s.lost > 0 && <span class="neg"> ／ 売り逃し {num(s.lost)}</span>}
                  {store.rush
                    .filter((d) => d.category === cat.id)
                    .map((d, i) => (
                      <span key={i} class="rush-eta">
                        🚚 {timeLabel(clockOf(d.arriveTick))}着 ×{d.qty}
                      </span>
                    ))}
                </div>
                <RushButtons c={c} cat={cat.id} />
                <div class="next-order">
                  <span>明日の発注</span>
                  <button aria-label={`${cat.name}の明日の発注を10減らす`} onClick={() => setOrder(cat.id, store.orders[cat.id] - 10)}>
                    −10
                  </button>
                  <b>{num(store.orders[cat.id])}</b>
                  <button aria-label={`${cat.name}の明日の発注を10増やす`} onClick={() => setOrder(cat.id, store.orders[cat.id] + 10)}>
                    ＋10
                  </button>
                  <button class="link" onClick={() => c.setTab('order')}>
                    詳しく
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <p class="hint">
          朝の納品時を100%として、どれだけ残っているか。25%を切ると「残りわずか」、0で「品切れ」になり、店内の棚と街の店の上にも表示されます。
          <br />
          🚚 緊急補充：今すぐ発注すると{ECONOMY.rush.leadTicks / 4}時間後に届きます。1回 {`¥${ECONOMY.rush.fee.toLocaleString('ja-JP')}`} の配送料がかかり、22時で受付終了。
        </p>
      </section>

      <section class="card">
        <h3>お店の評判</h3>
        <div class="meter big">
          <span style={{ width: `${rep * 100}%` }} />
        </div>
        <p class="hint">品切れが少ないと少しずつ上がり、多いと下がります。評判は来店数に直接影響します（現在 来店数 ×{pct(store.reputation)}）。</p>
      </section>
    </div>
  );
}
