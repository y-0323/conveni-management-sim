import { useState } from 'preact/hooks';
import type { GameController } from '../core/controller';
import { CATEGORIES } from '../data/categories';
import { dayLabel } from '../sim/calendar';
import type { DayReport } from '../sim/types';
import { num, pct, sign, weatherText, yen } from './format';

export function ReportView({ r }: { r: DayReport }) {
  const rows: Array<[string, number, string?]> = [
    ['売上高', r.sales, 'strong'],
    ['　売上原価', -r.cogs],
    ['　廃棄ロス', -r.waste],
    ['売上総利益（粗利）', r.grossProfit, 'sub'],
    ['　人件費', -r.labor],
    ['　家賃', -r.rent],
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
          現金 {yen(r.cashStart)} → {yen(r.cashEnd)}。仕入代金 {yen(r.purchases)} は納品時に支払い、売れ残った分は在庫（{yen(r.inventoryValue)}）として残ります。
        </p>
      </details>
    </div>
  );
}

export function ReportModal({ c }: { c: GameController }) {
  const r = c.pendingReport;
  if (!r) return null;
  return (
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div class="modal-head">
          <span class="badge">日報</span>
          <h2 id="report-title">{dayLabel(r.day)}</h2>
          <span class="weather">{weatherText(r.weather)}</span>
        </div>
        <div class="modal-scroll">
          <ReportView r={r} />
        </div>
        <div class="modal-foot">
          <button
            class="ghost"
            onClick={() => {
              c.setTab('order');
              c.closeReport();
              c.setSpeed(0);
            }}
          >
            止めて発注を見直す
          </button>
          <button class="primary" onClick={() => c.closeReport()}>
            次の日へ ▶
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportsPanel({ c }: { c: GameController }) {
  const [open, setOpen] = useState<number | null>(null);
  const rs = c.state.reports;
  if (!rs.length) return <div class="panel-body"><p class="empty">1日の営業が終わると、ここに日報がたまります。</p></div>;
  const last = rs.slice(-14);
  const max = Math.max(1, ...last.map((r) => r.sales));
  const minP = Math.min(0, ...last.map((r) => r.operatingProfit));
  const total = rs.reduce((a, r) => a + r.operatingProfit, 0);
  const selected = open !== null ? rs.find((r) => r.day === open) : null;

  return (
    <div class="panel-body">
      <section class="card">
        <h3>売上と営業利益（直近14日）</h3>
        <div class="trend">
          {last.map((r) => (
            <button class={`trend-col ${open === r.day ? 'on' : ''}`} key={r.day} onClick={() => setOpen(r.day)} title={`${dayLabel(r.day)} 売上${yen(r.sales)} 営業利益${yen(r.operatingProfit)}`}>
              <span class="bar sales" style={{ height: `${(r.sales / (max - minP)) * 100}%` }} />
              <span class={`bar profit ${r.operatingProfit < 0 ? 'neg' : ''}`} style={{ height: `${(Math.abs(r.operatingProfit) / (max - minP)) * 100}%` }} />
              <span class="tick">{r.day}</span>
            </button>
          ))}
        </div>
        <p class="hint">
          累計の営業利益 <b class={sign(total)}>{yen(total)}</b>（{rs.length}日間）。棒をタップすると、その日の日報を表示します。
        </p>
      </section>
      {selected && (
        <section class="card">
          <h3>
            {dayLabel(selected.day)} の日報 <small>{weatherText(selected.weather)}</small>
          </h3>
          <ReportView r={selected} />
        </section>
      )}
    </div>
  );
}
