import type { WeatherDay } from '../sim/types';

export const yen = (n: number) => `${n < 0 ? '−' : ''}¥${Math.abs(Math.round(n)).toLocaleString('ja-JP')}`;
export const num = (n: number) => Math.round(n).toLocaleString('ja-JP');
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const sign = (n: number) => (n < 0 ? 'neg' : 'pos');

export const WEATHER_ICON = { sunny: '☀️', cloudy: '☁️', rain: '☔' } as const;
export const WEATHER_NAME = { sunny: '晴れ', cloudy: 'くもり', rain: '雨' } as const;
export const weatherText = (w: WeatherDay) => `${WEATHER_ICON[w.kind]} ${WEATHER_NAME[w.kind]} ${w.temp}℃`;
