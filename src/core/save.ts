// セーブ（M1 は localStorage。設計書どおり、M2 以降で IndexedDB＋複数スロットに移行予定）
import type { SimState } from '../sim/types';

const KEY = 'conveni-sim-save';
const CURRENT_VERSION = 1;

export function saveGame(state: SimState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // プライベートモードなどで保存できなくても遊べるようにする
  }
}

export function loadGame(): SimState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SimState;
    if (data.version !== CURRENT_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
