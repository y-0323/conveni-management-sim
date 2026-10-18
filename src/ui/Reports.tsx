import { useState } from 'preact/hooks';
import type { GameController } from '../core/controller';
import { CATEGORIES } from '../data/categories';
import { SITE_BY_ID, type SiteId } from '../data/sites';
import { dayLabel } from '../sim/calendar';
import type { CompanyDay, DayReport } from '../sim/types';
import { num, pct, sign, weatherText, yen } from './format';

export function ReportView({ r }: { r: DayReport }) {
  const rows: Array<[string, number, string?]> = [
    ['売上高', r.sales, 'strong'],
    ['　売上原価', -r.cogs],
    ['　廃棄ロス', -r.waste],
    ['売上総利益（粗利）', r.grossProfit, 'sub'],
    ['　人件費', -r.labor],
    ['　家賃', -r.rent],
    ...(r.depreciation ? ([['　減価償却費（出店費用）', -r.depreciation]] as Array<[string, number]>) : []),
    ['営業利益', r.operatingProfit, 'total'],
  ];
  return (
    <div class="report">
      <div class="kpis four">
        <div>
          <span class="k">来店数</span>
          <span class="v">{num(r.visits)}人</span>
        </div>
        <div>
          <span class="k">売上</span>
          <span class="v">{yen(r.sales)}</span>
        </div>
        <div>
          <span class="k">粗利率</span>
          <span class="v">{r.sales ? pct(r.grossProfit / r.sales) : '−'}</span>
        </div>
        <div>
          <span class="k">営業利益</span>
          <span class={`v ${sign(r.operatingProfit)}`}>{yen(r.operatingProfit)}</span>
        </div>
      </div>

      <table class="cat-table">
        <thead>
          <tr>
            <th />
            <th>納品</th>
            <th>販売</th>
            <th>売り逃し</th>
            <th>廃棄</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((c) => {
            const s = r.cats[c.id];
            return (
              <tr key={c.id}>
                <th>
                  {c.icon} {c.name}
                </th>
                <td>{num(s.delivered)}</td>
                <td>{num(s.sold)}</td>
                <td class={s.lost ? 'neg' : ''}>{num(s.lost)}</td>
                <td class={s.wasted ? 'warn' : ''}>{num(s.wasted)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul class="mentor">
        {r.comments.map((m, i) => (
          <li key={i} class={m.tone}>
            <b>{m.title}</b>
            <p>{m.body}</p>
          </li>
        ))}
      </ul>

      <details class="pl">
        <summary>損益計算書（P/L）を見る</summary>
        <table class="fs">
          <tbody>
            {rows.map(([k, v, cls]) => (
              <tr key={k} class={cls}>
                <th>{k}</th>
                <td class={v < 0 ? 'neg' : ''}>{yen(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="hint">
          仕入代金 {yen(r.purchases)} は納品時に支払い、売れ残って日持ちする分は在庫（{yen(r.inventoryValue)}）として残ります。
          {r.depreciation > 0 && ' 出店費用は2年に分けて費用にします（減価償却）。現金は出店時に払い済みです。'}
        </p>
      </details>
    </div>
  );
}

function CompanySummary({ company, reports }: { company: CompanyDay; reports: DayReport[] }) {
  return (
    <section class="company">
      <div class="kpis four">
        <div>
          <span class="k">全店の売上</span>
          <span class="v">{yen(company.sales)}</span>
        </div>
        <div>
          <span class="k">全店の営業利益</span>
          <span class={`v ${sign(company.operatingProfit)}`}>{yen(company.operatingProfit)}</span>
        </div>
        <div>
          <span class="k">現金（前日比）</span>
          <span class={`v ${sign(company.cashEnd - company.cashStart)}`}>{yen(company.cashEnd - company.cashStart)}</span>
        </div>
        <div>
          <span class="k">現金残高</span>
          <span class="v">{yen(company.cashEnd)}</span>
        </div>
      </div>
      {reports.length > 1 && (
        <table class="cat-table">
          <thead>
            <tr>
              <th />
              <th>売上</th>
              <th>営業利益</th>
              <th>売り逃し</th>
              <th>廃棄</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.siteId}>
                <th>{SITE_BY_ID[r.siteId].name}</th>
                <td>{yen(r.sales)}</td>
                <td class={sign(r.operatingProfit)}>{yen(r.operatingProfit)}</td>
                <td>{num(CATEGORIES.reduce((a, c) => a + r.cats[c.id].lost, 0))}</td>
                <td>{num(CATEGORIES.reduce((a, c) => a + r.cats[c.id].wasted, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {company.investment > 0 && <p class="hint">出店費用 {yen(company.investment)} を支払ったため、現金が大きく減っています（利益には2年かけて少しずつ反映）。</p>}
    </section>
  );
}

function StoreChips({ reports, value, onChange }: { reports: DayReport[]; value: SiteId; onChange: (s: SiteId) => void }) {
  if (reports.length < 2) return null;
  return (
    <div class="chips" role="tablist">
      {reports.map((r) => (
        <button key={r.siteId} role="tab" aria-selected={value === r.siteId} class={value === r.siteId ? 'on' : ''} onClick={() => onChange(r.siteId)}>
          {SITE_BY_ID[r.siteId].name}
        </button>
      ))}
    </div>
  );
}

export function ReportModal({ c }: { c: GameController }) {
  const p = c.pending;
  const [site, setSite] = useState<SiteId | null>(null);
  if (!p) return null;
  const selected = p.reports.find((r) => r.siteId === (site ?? c.selectedSite)) ?? p.reports[0];
  const close = () => {
    setSite(null);
    c.closeReport();
  };
  return (
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div class="modal-head">
          <span class="badge">日報</span>
          <h2 id="report-title">{dayLabel(p.company.day)}</h2>
          <span class="weather">{weatherText(selected.weather)}</span>
        </div>
        <div class="modal-scroll">
          <CompanySummary company={p.company} reports={p.reports} />
          <StoreChips reports={p.reports} value={selected.siteId} onChange={setSite} />
          <ReportView r={selected} />
        </div>
        <div class="modal-foot">
          <button
            class="ghost"
            onClick={() => {
              c.selectStore(selected.siteId);
              c.setTab('order');
              c.setSpeed(0);
              close();
            }}
          >
            止めて発注を見直す
          </button>
          <button class="primary" onClick={close}>
            次の日へ ▶
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportsPanel({ c }: { c: GameController }) {
  const [open, setOpen] = useState<number | null>(null);
  const days = c.state.companyReports;
  if (!days.length) return <div class="panel-body"><p class="empty">1日の営業が終わると、ここに日報がたまります。</p></div>;
  const last = days.slice(-14);
  const max = Math.max(1, ...last.map((r) => r.sales));
  const minP = Math.min(0, ...last.map((r) => r.operatingProfit));
  const total = days.reduce((a, r) => a + r.operatingProfit, 0);
  const store = c.store;
  const selected = open !== null ? store.reports.find((r) => r.day === open) : null;

  return (
    <div class="panel-body">
      <section class="card">
        <h3>全店の売上と営業利益（直近14日）</h3>
        <div class="trend">
          {last.map((r) => (
            <button class={`trend-col ${open === r.day ? 'on' : ''}`} key={r.day} onClick={() => setOpen(r.day)} title={`${dayLabel(r.day)} 売上${yen(r.sales)} 営業利益${yen(r.operatingProfit)}`}>
              <span class="bar sales" style={{ height: `${(r.sales / (max - minP)) * 100}%` }} />
              <span class={`bar profit ${r.operatingProfit < 0 ? 'neg' : ''}`} style={{ height: `${(Math.abs(r.operatingProfit) / (max - minP)) * 100}%` }} />
              <span class="tick">{r.day}</span>
              {r.investment > 0 && <span class="invest" title="出店">🏪</span>}
            </button>
          ))}
        </div>
        <p class="hint">
          累計の営業利益 <b class={sign(total)}>{yen(total)}</b>（{days.length}日間）。棒をタップすると、{SITE_BY_ID[store.siteId].name}のその日の日報を表示します。
        </p>
      </section>
      {open !== null && !selected && <p class="empty">{SITE_BY_ID[store.siteId].name}はこの日まだ営業していません。</p>}
      {selected && (
        <section class="card">
          <h3>
            {dayLabel(selected.day)} {SITE_BY_ID[store.siteId].name} <small>{weatherText(selected.weather)}</small>
          </h3>
          <ReportView r={selected} />
        </section>
      )}
    </div>
  );
}
