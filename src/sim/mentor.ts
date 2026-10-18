// 日報に添えるメンター（エリアマネージャー）の講評
import { CATEGORIES } from '../data/categories';
import { isWeekend } from './calendar';
import type { DayReport, MentorComment } from './types';

const yen = (n: number) => `${n < 0 ? '−' : ''}¥${Math.abs(Math.round(n)).toLocaleString('ja-JP')}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function mentorComments(r: DayReport, history: DayReport[]): MentorComment[] {
  const out: MentorComment[] = [];

  for (const c of CATEGORIES) {
    const s = r.cats[c.id];
    const margin = c.price - c.cost;
    const available = s.sold + s.wasted;
    const wasteRate = available ? s.wasted / available : 0;
    if (c.lifeDays === 1 && wasteRate >= 0.15) {
      out.push({
        tone: 'warn',
        title: `${c.icon} ${c.name}の廃棄が多い`,
        body: `${s.wasted}個（${pct(wasteRate)}）を廃棄し、原価 ${yen(s.wasted * c.cost)} を捨てました。売れ残り1個の損は原価の ${yen(c.cost)}。発注を需要に近づけましょう。`,
      });
    }
    const lostRate = s.demand ? s.lost / s.demand : 0;
    if (lostRate >= 0.08) {
      out.push({
        tone: 'bad',
        title: `${c.icon} ${c.name}が品切れ`,
        body: `${s.lost}個の売り逃し（機会損失 ${yen(s.lost * margin)}）。売り逃し1個の損は粗利の ${yen(margin)}${margin > c.cost ? 'で、廃棄1個の損より大きい。この商品は多めに発注するのが得策です' : '。品切れはお客さんの評判も下げます'}。`,
      });
    }
  }

  if (r.weather.kind === 'rain') {
    out.push({ tone: 'info', title: '☔ 雨の日', body: `雨で来店が減りました（来店 ${r.visits}人）。特に近所の住民は雨だと外出を控えます。天気予報を見て発注を調整しましょう。` });
  }

  const prev = history[history.length - 1];
  if (prev && isWeekend(r.day) !== isWeekend(prev.day)) {
    out.push({
      tone: 'info',
      title: isWeekend(r.day) ? '📅 週末は客層が変わる' : '📅 平日に戻った',
      body: isWeekend(r.day)
        ? `会社員 ${r.visitsBySegment.worker}人（前日 ${prev.visitsBySegment.worker}人）、近所の住民 ${r.visitsBySegment.resident}人（前日 ${prev.visitsBySegment.resident}人）。土日はオフィス街のお客さんが減り、住民が増えます。`
        : `会社員が戻ってきました（${r.visitsBySegment.worker}人）。昼のおにぎり・弁当の需要が増えます。`,
    });
  }

  if (out.filter((c) => c.tone !== 'info').length === 0) {
    const gm = r.sales ? r.grossProfit / r.sales : 0;
    out.push({
      tone: r.operatingProfit >= 0 ? 'good' : 'warn',
      title: r.operatingProfit >= 0 ? '👍 安定した1日' : '固定費をまかなえていない',
      body:
        r.operatingProfit >= 0
          ? `粗利率 ${pct(gm)}、営業利益 ${yen(r.operatingProfit)}。廃棄も品切れも少ない、良い発注でした。`
          : `粗利 ${yen(r.grossProfit)} では人件費・家賃 ${yen(r.labor + r.rent)} をまかなえません。売上を増やすか粗利率の高い商品を伸ばしましょう。`,
    });
  }
  return out.slice(0, 4);
}
