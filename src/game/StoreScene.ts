// 店内の様子：棚の商品が売れて減り、お客さんが棚→レジ→出口と歩く
import Phaser from 'phaser';
import { controller } from '../core/controller';
import { CATEGORY_BY_ID, type CategoryId } from '../data/categories';
import { SEGMENTS } from '../data/segments';
import { CLERKS, DOOR, ENTRY, IN_H, IN_W, REGISTER, route, SHELVES, shelfSpot, type P } from '../data/interior';
import { shelfRatio, stockOf } from '../sim/simulation';
import type { VisitEvent } from '../sim/types';
import { buildWalkerTextures } from './art';
import { buildInteriorTextures } from './interiorArt';

const T = 16;
const W = IN_W * T;
const H = IN_H * T;
const FONT = '"DotGothic16", monospace';
const MAX_CUSTOMERS = 22;
export const LOW_STOCK = 0.25;

interface Step {
  kind: 'walk' | 'shelf' | 'pay' | 'exit';
  to?: P;
  cat?: CategoryId;
  wait?: number;
}

interface Customer {
  sprite: Phaser.GameObjects.Sprite;
  key: string;
  pos: P;
  queue: P[];
  steps: Step[];
  wait: number;
  visit: VisitEvent;
  animT: number;
  paid: boolean;
}

interface ShelfView {
  category: CategoryId;
  items: Phaser.GameObjects.Image[];
  tag: Phaser.GameObjects.Text;
  shown: number;
}

export class StoreScene extends Phaser.Scene {
  private customers: Customer[] = [];
  private shelves: ShelfView[] = [];
  private clerks: Phaser.GameObjects.Sprite[] = [];
  private windowShade!: Phaser.GameObjects.Rectangle;
  private storeId = '';
  private unsub: Array<() => void> = [];
  private blink = 0;

  constructor() {
    super('store');
  }

  create() {
    buildInteriorTextures(this);
    for (const s of SEGMENTS) buildWalkerTextures(this, `w-${s.id}`, s.color, 0x2b2118);

    this.add.image(0, 0, 'interior').setOrigin(0).setDepth(0);
    // 外の明るさ（窓の色）
    this.windowShade = this.add.rectangle(T, 13 * T + 3, (IN_W - 2) * T, 10, 0x0b1440, 0).setOrigin(0).setDepth(1);

    for (const def of SHELVES) {
      const items = def.slots.map((p, i) => {
        const key = def.category === 'drink' ? `item-drink${(i * 7 + Math.floor(i / 24)) % 6}` : def.category === 'bento' ? (i % 3 === 2 ? 'item-bento' : 'item-onigiri') : 'item-chicken';
        return this.add.image(p.x, p.y, key).setOrigin(0).setDepth(2);
      });
      const tag = this.add
        .text(def.tag.x, def.tag.y, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', resolution: 4, padding: { x: 3, y: 1 } })
        .setOrigin(0.5)
        .setDepth(500)
        .setVisible(false);
      this.shelves.push({ category: def.category, items, tag, shown: items.length });
    }

    this.clerks = CLERKS.map((p) => this.add.sprite(p.x * T, p.y * T, 'clerk-0').setOrigin(0.5, 1).setDepth(10 + p.y * T));

    const cam = this.cameras.main;
    cam.setBackgroundColor('#3b2f2a');
    this.fit();
    this.scale.on('resize', () => this.fit());

    this.unsub.push(controller.onVisits((v) => this.onVisits(v)));
    this.unsub.push(
      controller.onArrivals((list) => {
        if (this.sys.isSleeping()) return;
        for (const a of list) {
          if (a.siteId !== controller.selectedSite) continue;
          const def = SHELVES.find((s) => s.category === a.category)!;
          this.bubble(`🚚 補充 +${a.qty}`, def.tag.x, def.tag.y + 14, '#1d3557');
          this.cameras.main.flash(120, 255, 255, 255, false);
        }
      }),
    );
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));
  }

  private fit() {
    const cam = this.cameras.main;
    const zoom = Math.min(cam.width / (W + 8), cam.height / (H + 8));
    cam.setZoom(zoom);
    cam.centerOn(W / 2, H / 2);
  }

  private onVisits(visits: VisitEvent[]) {
    if (this.sys.isSleeping() || !this.sys.isVisible()) return;
    const rate = 1 / Math.max(1, controller.speed);
    for (const v of visits) {
      if (v.siteId !== controller.selectedSite) continue;
      if (Math.random() > rate || this.customers.length >= MAX_CUSTOMERS) continue;
      this.spawn(v);
    }
  }

  private spawn(v: VisitEvent) {
    const key = `w-${v.segment}`;
    const steps: Step[] = [];
    const wants = [...v.bought.map((c) => ({ c, ok: true })), ...v.missed.map((c) => ({ c, ok: false }))]
      // ホットスナックはレジで買うので最後に
      .sort((a, b) => (a.c === 'hotsnack' ? 1 : 0) - (b.c === 'hotsnack' ? 1 : 0));
    for (const w of wants) {
      if (w.c === 'hotsnack') continue;
      steps.push({ kind: 'walk', to: shelfSpot(w.c, Math.random()) }, { kind: 'shelf', cat: w.c, wait: 600 + Math.random() * 600 });
    }
    // レジは2台。少しずらして並ぶ
    const reg = { x: REGISTER.x + (Math.random() < 0.5 ? 0 : 2) + (Math.random() - 0.5) * 0.6, y: REGISTER.y + Math.random() * 0.5 };
    if (v.bought.length) steps.push({ kind: 'walk', to: reg }, { kind: 'pay', wait: 900 });
    else if (v.missed.includes('hotsnack')) steps.push({ kind: 'walk', to: reg }, { kind: 'shelf', cat: 'hotsnack', wait: 700 });
    steps.push({ kind: 'walk', to: ENTRY }, { kind: 'exit' });

    const sprite = this.add.sprite(DOOR.x * T, DOOR.y * T, `${key}-0`).setOrigin(0.5, 1).setAlpha(0);
    this.tweens.add({ targets: sprite, alpha: 1, duration: 250 });
    const c: Customer = { sprite, key, pos: { ...DOOR }, queue: [{ ...ENTRY }], steps, wait: 0, visit: v, animT: 0, paid: false };
    this.customers.push(c);
  }

  private bubble(text: string, x: number, y: number, color = '#000000') {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '8px', color, resolution: 4, stroke: '#ffffff', strokeThickness: 2 })
      .setOrigin(0.5, 1)
      .setDepth(800);
    this.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: 1300, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  private nextStep(c: Customer) {
    const s = c.steps.shift();
    if (!s) return;
    if (s.kind === 'walk') c.queue = route(c.pos, s.to!);
    else if (s.kind === 'shelf') {
      c.wait = s.wait!;
      const cat = CATEGORY_BY_ID[s.cat!];
      const ok = c.visit.bought.includes(s.cat!);
      if (ok) this.bubble(cat.icon, c.sprite.x, c.sprite.y - 14);
      else this.bubble(`${cat.icon}…ない`, c.sprite.x, c.sprite.y - 14, '#c1121f');
    } else if (s.kind === 'pay') {
      c.wait = s.wait!;
      const yen = c.visit.spent;
      if (c.visit.bought.includes('hotsnack')) this.bubble('🍗', c.sprite.x - 10, c.sprite.y - 14);
      this.bubble(`+¥${yen}`, REGISTER.x * T + 14, REGISTER.y * T - 26, '#2a7a3b');
      const clerk = this.clerks[0];
      this.tweens.add({ targets: clerk, y: clerk.y - 2, yoyo: true, duration: 120, repeat: 2 });
    } else if (s.kind === 'exit') {
      c.queue = [{ ...DOOR }];
      c.paid = true;
    }
  }

  private updateCustomers(dt: number, speed: number) {
    const tilesPerSec = 2.6 * Math.sqrt(speed);
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i];
      if (c.wait > 0) {
        c.wait -= dt * Math.sqrt(speed);
        continue;
      }
      if (c.queue.length) {
        let move = (tilesPerSec * dt) / 1000;
        while (move > 0 && c.queue.length) {
          const target = c.queue[0];
          const dx = target.x - c.pos.x;
          const dy = target.y - c.pos.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= move) {
            c.pos = { ...target };
            c.queue.shift();
            move -= dist;
          } else {
            c.pos.x += (dx / dist) * move;
            c.pos.y += (dy / dist) * move;
            if (Math.abs(dx) > 0.01) c.sprite.setFlipX(dx < 0);
            move = 0;
          }
        }
        c.animT += dt * Math.sqrt(speed);
        c.sprite.setTexture(`${c.key}-${Math.floor(c.animT / 160) % 2}`);
        c.sprite.setPosition(Math.round(c.pos.x * T), Math.round(c.pos.y * T)).setDepth(10 + c.pos.y * T);
        continue;
      }
      if (c.paid && !c.steps.length) {
        c.sprite.destroy();
        this.customers.splice(i, 1);
        continue;
      }
      this.nextStep(c);
    }
  }

  private updateShelves(dt: number) {
    const store = controller.store;
    this.blink += dt;
    for (const sh of this.shelves) {
      const ratio = shelfRatio(store, sh.category);
      const stock = stockOf(store, sh.category);
      const n = stock <= 0 ? 0 : Math.max(1, Math.round(ratio * sh.items.length));
      if (n !== sh.shown) {
        sh.items.forEach((img, i) => img.setVisible(i < n));
        sh.shown = n;
      }
      const empty = stock <= 0 && store.openDay <= controller.clock.day;
      const low = !empty && ratio < LOW_STOCK && store.today.cats[sh.category].startStock > 0;
      if (empty || low) {
        sh.tag
          .setVisible(empty ? Math.floor(this.blink / 450) % 2 === 0 : true)
          .setText(empty ? `${CATEGORY_BY_ID[sh.category].icon}品切れ` : `残りわずか ${stock}`)
          .setBackgroundColor(empty ? '#c1121f' : '#e07a00');
      } else sh.tag.setVisible(false);
    }
  }

  update(_time: number, delta: number) {
    const speed = controller.running ? controller.speed : 0;
    const dt = Math.min(delta, 100);

    // 表示する店が変わったら、店内のお客さんを入れ替える
    if (controller.selectedSite !== this.storeId) {
      this.storeId = controller.selectedSite;
      this.customers.forEach((c) => c.sprite.destroy());
      this.customers = [];
    }
    if (speed > 0) this.updateCustomers(dt, speed);
    this.updateShelves(dt);

    // 店員の待機アニメ
    const f = Math.floor(this.time.now / 700) % 2;
    this.clerks.forEach((cl, i) => cl.setTexture(`clerk-${(f + i) % 2}`));

    // 窓の外の明るさ
    const m = controller.clock.minuteOfDay;
    const dark = m < 300 || m >= 1140 ? 1 : m < 420 ? 1 - (m - 300) / 120 : m >= 1020 ? (m - 1020) / 120 : 0;
    this.windowShade.setFillStyle(0x0b1440, dark * 0.8);
  }
}
