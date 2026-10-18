import type { GameController } from '../core/controller';
import { SEGMENTS } from '../data/segments';
import { hqVisits, SITES, SITE_BY_ID, type Site } from '../data/sites';
import { ECONOMY, canOpen, expansionChecks, storeOf } from '../sim/simulation';
import { num, yen } from './format';

function SegmentBars({ site }: { site: Site }) {
  const max = Math.max(...SEGMENTS.map((s) => s.dailyVisits * 1.7));
  return (
    <div class="seg-bars">
      {SEGMENTS.map((s) => {
        const v = s.dailyVisits * site.segmentMult[s.id];
        return (
          <div key={s.id} class="seg-row">
            <span class="seg-name">{s.name}</span>
            <span class="seg-bar">
              <span style={{ width: `${(v / max) * 100}%`, background: `#${s.color.toString(16).padStart(6, '0')}` }} />
            </span>
            <span class="seg-v">{num(v)}人</span>
          </div>
        );
      })}
    </div>
  );
}

export function ExpandPanel({ c }: { c: GameController }) {
  const candidates = SITES.filter((s) => s.id !== 'main');
  const target = c.expandTarget ? SITE_BY_ID[c.expandTarget] : null;
  const checks = expansionChecks(c.state, (target ?? candidates[0]).id).slice(0, 2);
  const ready = checks.every((x) => x.ok);

  const open = (site: Site) => {
    if (!confirm(`${site.name}を出店しますか？\n出店費用 ${yen(site.openCost)} を今すぐ支払い、明朝6:00に開店します。`)) return;
    c.dispatch({ type: 'openStore', siteId: site.id });
  };

  return (
    <div class="panel-body">
      <section class={`card expand-status ${ready ? 'ready' : ''}`}>
        <h3>{ready ? '🎉 出店できます！' : '🏗 出店の条件（お店が軌道に乗ったら）'}</h3>
        <ul class="checks">
          {checks.map((x) => (
            <li key={x.label} class={x.ok ? 'ok' : ''}>
              <span aria-hidden="true">{x.ok ? '✅' : '⬜'}</span> {x.label} <small>（{x.detail}）</small>
            </li>
          ))}
        </ul>
        <p class="hint">
          出店費用は今すぐ現金で払い、利益には{ECONOMY.depreciationDays / 365}年かけて少しずつ「減価償却費」として反映されます。お金が尽きると倒産するので、現金に余裕を持って出店しましょう。
        </p>
      </section>

      {candidates.map((site) => {
        const store = storeOf(c.state, site.id);
        const cashOk = c.state.cash >= site.openCost;
        const selected = target?.id === site.id;
        return (
          <section key={site.id} class={`card site ${selected ? 'selected' : ''}`} onClick={() => c.showExpansion(site.id)}>
            <div class="site-head">
              <span class="cat big">{site.name}</span>
              <span class="unit">{site.area}</span>
            </div>
            <p class="site-desc">{site.description}</p>
            <SegmentBars site={site} />
            <div class="order-grid">
              <div>
                <span class="k">出店費用</span>
                <b>{yen(site.openCost)}</b>
              </div>
              <div>
                <span class="k">家賃/日</span>
                <b>{yen(site.rentPerDay)}</b>
              </div>
              <div>
                <span class="k">来店予想(平日)</span>
                <b>{num(hqVisits(site))}人</b>
              </div>
            </div>
            {store ? (
              <button class="ghost wide" onClick={(e) => (e.stopPropagation(), c.selectStore(site.id, 'interior'))}>
                出店済み・店内を見る
              </button>
            ) : (
              <button class="primary wide" disabled={!canOpen(c.state, site.id)} onClick={(e) => (e.stopPropagation(), open(site))}>
                {canOpen(c.state, site.id) ? 'ここに出店する' : !ready ? '条件を満たすと出店できます' : !cashOk ? `現金が ${yen(site.openCost - c.state.cash)} 足りません` : '出店できません'}
              </button>
            )}
          </section>
        );
      })}
      <p class="hint">「来店予想」は本部の商圏調査による平日の目安です。1号店（駅前通り店）は約{num(hqVisits(SITE_BY_ID.main))}人。客層が違えば、売れる商品も、強い曜日も変わります。</p>
    </div>
  );
}
