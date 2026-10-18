import type { GameController, Speed } from '../core/controller';
import { dayLabel, timeLabel } from '../sim/calendar';
import { weatherOf } from '../sim/simulation';
import { WEATHER_ICON, yen } from './format';

const SPEEDS: Array<{ s: Speed; label: string; title: string }> = [
  { s: 0, label: '❚❚', title: '一時停止' },
  { s: 1, label: '▶', title: '1倍速' },
  { s: 3, label: '▶▶', title: '3倍速' },
  { s: 10, label: '▶▶▶', title: '10倍速' },
];

export function Hud({ c }: { c: GameController }) {
  const clock = c.clock;
  const w = weatherOf(c.state, clock.day);
  const night = clock.hour < 6 || clock.hour >= 19;
  return (
    <header class="hud">
      <div class="hud-brand">
        <span class="hud-logo">まちかど<b>マート</b></span>
      </div>
      <div class="hud-clock">
        <span class="hud-day">{clock.day}日目</span>
        <span class="hud-date">{dayLabel(clock.day)}</span>
        <span class="hud-time">
          {night ? '🌙' : '🕒'} {timeLabel(clock)}
        </span>
        <span class="hud-weather" title="今日の天気">
          {WEATHER_ICON[w.kind]} {w.temp}℃
        </span>
      </div>
      <div class="hud-cash">
        <span class="k">現金</span>
        <span class={`v ${c.state.cash < 200000 ? 'warn' : ''}`}>{yen(c.state.cash)}</span>
      </div>
      <div class="hud-speed" role="group" aria-label="ゲーム速度">
        {SPEEDS.map((x) => (
          <button key={x.s} class={c.speed === x.s ? 'on' : ''} title={x.title} aria-label={x.title} aria-pressed={c.speed === x.s} onClick={() => c.setSpeed(x.s)}>
            {x.label}
          </button>
        ))}
      </div>
    </header>
  );
}
