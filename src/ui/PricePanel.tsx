import type { GameController } from '../core/controller';
import { CATEGORIES, priceBounds, type Category, type CategoryId } from '../data/categories';
import { hqEstimateAt, siteSensitivity, SITE_BY_ID } from '../data/sites';
import { priceImageFactor } from '../sim/simulation';
import type { StoreState } from '../sim/types';
import { pct, yen } from './format';

/** 本部の試算：この商品をこの売価にしたときの、店全体の1日の粗利（平日・廃棄なしと仮定） */
function estimateGross(store: StoreState, cat: CategoryId, price: number): number {
  const site = SITE_BY_ID[store.siteId];
  const prices = { ...store.prices, [cat]: price };
  const image = priceImageFactor({ ...store, prices });
  return CATEGORIES.reduce((a, c) => a + hqEstimateAt(site, c.id, false, prices[c.id]) * image * store.reputation * (prices[c.id] - c.cost), 0);
}

function pricePoints(cat: Category): number[] {
  const { min, max } = priceBounds(cat);
  const step = Math.max(10, Math.round((cat.price * 0.1) / 10) * 10);
  const pts: number[] = [];
  for (let p = min; p <= max; p += step) pts.push(p);
  if (!pts.includes(cat.price)) pts.push(cat.price);
  return pts.sort((a, b) => a - b);
}

function PriceCard({ c, cat }: { c: GameController; cat: Category }) {
  const store = c.store;
  const price = store.prices[cat.id];
  const { min, max } = priceBounds(cat);
  const set = (p: number) => c.dispatch({ type: 'setPrice', siteId: store.siteId, category: cat.id, price: p });
  const site = SITE_BY_ID[store.siteId];
  const demandRatio = hqEstimateAt(site, cat.id, false, price) / hqEstimateAt(site, cat.id, false, cat.price);
  const points = pricePoints(cat);
  const gross = points.map((p) => ({ p, g: estimateGross(store, cat.id, p) }));
  const best = gross.reduce((a, b) => (b.g > a.g ? b : a));
  const maxG = Math.max(...gross.map((x) => x.g));
  const minG = Math.min(...gross.map((x) => x.g)) * 0.9;
  const current = estimateGross(store, cat.id, price);
  const atStd = estimateGross(store, cat.id, cat.price);

  return (
    <section class="card price-card">
      <div class="order-head">
        <span class="cat big">
          {cat.icon} {cat.name}
        </span>
        <span class="unit">
          本部の標準売価 {yen(cat.price)}・原価 {yen(cat.cost)}
        </span>
      </div>

      <div class="price-main">
        <button onClick={() => set(c.store.prices[cat.id] - 10)} disabled={price <= min} aria-label={`${cat.name}を10円値下げ`}>
          −10円
        </button>
        <div class="price-now">
          <b>{yen(price)}</b>
          <small class={price > cat.price ? 'up' : price < cat.price ? 'down' : ''}>標準の{pct(price / cat.price)}</small>
        </div>
        <button onClick={() => set(c.store.prices[cat.id] + 10)} disabled={price >= max} aria-label={`${cat.name}を10円値上げ`}>
          ＋10円
        </button>
      </div>

      <div class="order-grid">
        <div>
          <span class="k">1個の粗利</span>
          <b>{yen(price - cat.cost)}</b>
        </div>
        <div>
          <span class="k">粗利率</span>
          <b>{pct((price - cat.cost) / price)}</b>
        </div>
        <div>
          <span class="k">買う人(標準比)</span>
          <b class={demandRatio < 0.97 ? 'neg' : demandRatio > 1.03 ? 'pos' : ''}>{pct(demandRatio)}</b>
        </div>
      </div>

      <div class="gross-chart" role="group" aria-label="売価ごとの店全体の粗利の目安">
        {gross.map(({ p, g }) => (
          <button
            key={p}
            class={`gc-col ${p === price ? 'on' : ''} ${p === best.p ? 'best' : ''}`}
            onClick={() => set(p)}
            title={`${yen(p)}にすると、店全体の粗利は1日 約${yen(g)}`}
          >
            <span class="gc-bar" style={{ height: `${Math.max(4, ((g - minG) / (maxG - minG || 1)) * 100)}%` }} />
            <span class="tick">{p}</span>
          </button>
        ))}
      </div>
      <p class="hint">
        本部の試算（平日・売れ残りなし）：店全体の1日の粗利は 約{yen(current)}
        {price !== cat.price && <>（標準売価なら 約{yen(atStd)}、差 <b class={current >= atStd ? 'pos' : 'neg'}>{yen(current - atStd)}</b>）</>}。
        棒をタップするとその売価にします。{best.p !== price && `試算では ${yen(best.p)} あたりが最も粗利が大きくなります。`}
      </p>
      {price !== cat.price && (
        <button class="link" onClick={() => set(cat.price)}>
          標準売価に戻す
        </button>
      )}
    </section>
  );
}

export function PricePanel({ c }: { c: GameController }) {
  const store = c.store;
  const site = SITE_BY_ID[store.siteId];
  const image = priceImageFactor(store);
  const sens = siteSensitivity(site);
  return (
    <div class="panel-body">
      <section class="card">
        <h3>💴 {site.name}の値付け</h3>
        <div class="kpis">
          <div>
            <span class="k">店の価格イメージ</span>
            <span class={`v ${image < 0.98 ? 'neg' : image > 1.02 ? 'pos' : ''}`}>{image < 0.98 ? '割高' : image > 1.02 ? '割安' : 'ふつう'}</span>
          </div>
          <div>
            <span class="k">来店数への影響</span>
            <span class={`v ${image < 0.98 ? 'neg' : image > 1.02 ? 'pos' : ''}`}>×{pct(image)}</span>
          </div>
          <div>
            <span class="k">客層の価格感度</span>
            <span class="v">{sens < 0.9 ? '鈍感' : sens > 1.1 ? '敏感' : 'ふつう'}</span>
          </div>
        </div>
        <p class="hint">
          値上げすると1個の粗利は増えますが、買う人が減ります（価格弾力性）。どれだけ減るかは商品と客層しだい。会社員は価格に鈍感、学生は敏感です。全体的に高い店は「割高な店」と思われて来店そのものが減り、安い店は増えます。売価の変更はすぐに反映されます。
        </p>
      </section>
      {CATEGORIES.map((cat) => (
        <PriceCard key={cat.id} c={c} cat={cat} />
      ))}
    </div>
  );
}
