// 実時間とシミュレーションをつなぐ進行役。UI（Preact）と描画（Phaser）の両方がこれを購読する
import type { SiteId } from '../data/sites';
import { clockOf } from '../sim/calendar';
import { dispatch, newGame, step, storeOf } from '../sim/simulation';
import type { Command, CompanyDay, DayReport, SimState, StoreState, TickResult, VisitEvent } from '../sim/types';
import { clearSave, loadGame, saveGame } from './save';

export type Speed = 0 | 1 | 3 | 10;
export type Tab = 'store' | 'order' | 'price' | 'reports' | 'expand';
export type View = 'interior' | 'town';

/** 1倍速で、ゲーム内15分 = 実時間1.5秒（1日 = 2分24秒） */
export const REAL_MS_PER_TICK = 1500;

type Listener = () => void;

export interface PendingDay {
  reports: DayReport[];
  company: CompanyDay;
}

export class GameController {
  state: SimState;
  speed: Speed = 1;
  /** 日報を見ている間は時間を止める */
  pending: PendingDay | null = null;
  showIntro: boolean;
  tab: Tab = 'store';
  view: View = 'interior';
  selectedSite: SiteId = 'main';
  /** 出店画面で選んでいる物件 */
  expandTarget: SiteId | null = null;
  /** 再描画の判定用。状態が変わるたびに増える */
  version = 0;

  private acc = 0;
  private listeners = new Set<Listener>();
  private visitListeners = new Set<(v: VisitEvent[]) => void>();
  private arrivalListeners = new Set<(a: TickResult['arrivals']) => void>();

  constructor() {
    const saved = loadGame();
    this.state = saved ?? newGame(Math.floor(Math.random() * 1e9));
    this.showIntro = !saved;
  }

  get clock() {
    return clockOf(this.state.tick);
  }

  get store(): StoreState {
    return storeOf(this.state, this.selectedSite) ?? this.state.stores[0];
  }

  get running() {
    return this.speed > 0 && !this.pending && !this.showIntro && !this.state.bankrupt;
  }

  /** 次の15分までどれだけ進んだか（0-1）。描画の補間に使う */
  get tickProgress() {
    return this.acc / REAL_MS_PER_TICK;
  }

  update(deltaMs: number) {
    if (!this.running) return;
    this.acc += Math.min(deltaMs, 250) * this.speed;
    let changed = false;
    while (this.acc >= REAL_MS_PER_TICK) {
      this.acc -= REAL_MS_PER_TICK;
      const r = step(this.state);
      changed = true;
      if (r.visits.length) this.visitListeners.forEach((fn) => fn(r.visits));
      if (r.arrivals.length) this.arrivalListeners.forEach((fn) => fn(r.arrivals));
      if (r.reports && r.company) {
        this.pending = { reports: r.reports, company: r.company };
        this.acc = 0;
        saveGame(this.state);
        break;
      }
    }
    if (changed) this.notify();
  }

  setSpeed(s: Speed) {
    this.speed = s;
    this.notify();
  }

  setTab(t: Tab) {
    this.tab = t;
    this.notify();
  }

  setView(v: View) {
    this.view = v;
    this.notify();
  }

  selectStore(siteId: SiteId, view?: View) {
    if (!storeOf(this.state, siteId)) return;
    this.selectedSite = siteId;
    if (view) this.view = view;
    this.notify();
  }

  showExpansion(siteId: SiteId | null) {
    this.expandTarget = siteId;
    this.tab = 'expand';
    this.notify();
  }

  dispatch(cmd: Command) {
    dispatch(this.state, cmd);
    if (cmd.type === 'openStore' && storeOf(this.state, cmd.siteId)) {
      this.selectedSite = cmd.siteId;
      this.expandTarget = null;
      this.tab = 'order';
    }
    saveGame(this.state);
    this.notify();
  }

  closeReport() {
    this.pending = null;
    this.notify();
  }

  closeIntro() {
    this.showIntro = false;
    this.notify();
  }

  restart() {
    clearSave();
    this.state = newGame(Math.floor(Math.random() * 1e9));
    this.pending = null;
    this.showIntro = true;
    this.speed = 1;
    this.acc = 0;
    this.selectedSite = 'main';
    this.view = 'interior';
    this.tab = 'store';
    this.notify();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onVisits(fn: (v: VisitEvent[]) => void) {
    this.visitListeners.add(fn);
    return () => this.visitListeners.delete(fn);
  }

  onArrivals(fn: (a: TickResult['arrivals']) => void) {
    this.arrivalListeners.add(fn);
    return () => this.arrivalListeners.delete(fn);
  }

  notify() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
}

export const controller = new GameController();
