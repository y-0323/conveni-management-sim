// 時刻の扱い：1刻み = 15分、1営業日 = 6:00〜翌6:00 の96刻み
export const TICK_MINUTES = 15;
export const TICKS_PER_DAY = (24 * 60) / TICK_MINUTES;
export const DAY_START_HOUR = 6;
/** 1日目の曜日（0=日曜）。4月1日（水）始まり */
export const START_DOW = 3;
export const START_MONTH = 4;
export const START_DATE = 1;

export const DOW_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export interface Clock {
  day: number;
  /** 0:00 からの分（0-1439） */
  minuteOfDay: number;
  hour: number;
  minute: number;
  dow: number;
  /** 営業日の何刻み目か（0-95） */
  tickInDay: number;
}

export function clockOf(tick: number): Clock {
  const day = Math.floor(tick / TICKS_PER_DAY) + 1;
  const tickInDay = tick % TICKS_PER_DAY;
  const minuteOfDay = (DAY_START_HOUR * 60 + tickInDay * TICK_MINUTES) % 1440;
  return {
    day,
    minuteOfDay,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    dow: dowOf(day),
    tickInDay,
  };
}

export function dowOf(day: number): number {
  return (START_DOW + day - 1) % 7;
}

export function isWeekend(day: number): boolean {
  const d = dowOf(day);
  return d === 0 || d === 6;
}

/** 4月1日を1日目としたときの月日（M1では30日・31日の月を簡易計算） */
export function dateOf(day: number): { month: number; date: number } {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let month = START_MONTH;
  let date = START_DATE + day - 1;
  while (date > lengths[month - 1]) {
    date -= lengths[month - 1];
    month = (month % 12) + 1;
  }
  return { month, date };
}

export function dayLabel(day: number): string {
  const { month, date } = dateOf(day);
  return `${month}/${date}（${DOW_NAMES[dowOf(day)]}）`;
}

export function timeLabel(c: Clock): string {
  return `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}
