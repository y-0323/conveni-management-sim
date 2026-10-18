import Phaser from 'phaser';
import { controller } from '../core/controller';
import { CATEGORY_BY_ID } from '../data/categories';
import { SEGMENTS, type SegmentId } from '../data/segments';
import { CATEGORIES } from '../data/categories';
import { SITE_BY_ID, SITES, type SiteId } from '../data/sites';
import { ALL_DOORS, BUILDINGS, buildingById, findPath, MAP_H, MAP_W, ORIGINS, STORE, TILE, type Building, type Pt } from '../data/town';
import { isOpen, shelfRatio, stockOf, storeOf, weatherOf } from '../sim/simulation';
import type { VisitEvent } from '../sim/types';
import { buildMiscTextures, buildShopTexture, buildTownTextures, buildWalkerTextures } from './art';
import { LOW_STOCK } from './StoreScene';

const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;
const MAX_WALKERS = 140;
const FONT = '"DotGothic16", monospace';

interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  key: string;
  path: Pt[];
  idx: number;
  t: number;
  jitter: { x: number; y: number };
  phase: 'toStore' | 'inside' | 'home' | 'stroll';
  wait: number;
  origin: Building;
  shop?: Building;
  visit?: VisitEvent;
  animT: number;
}

interface Car {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class TownScene extends Phaser.Scene {
  private walkers: Walker[] = [];
  private cars: Car[] = [];
  private night!: Phaser.GameObjects.Rectangle;
  private lit!: Phaser.GameObjects.Image;
  private glows: Phaser.GameObjects.Image[] = [];
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private train!: Phaser.GameObjects.Image;
  private trainTimer = 4000;
  private strollTimer = 0;
  private pinch: { dist: number; zoom: number } | null = null;
  private dragMoved = 0;
  private unsub: Array<() => void> = [];
  /** 店舗ごとの表示物（外観・看板・在庫警告） */
  private sites = new Map<SiteId, { shop?: Phaser.GameObjects.Image; lit?: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; badge: Phaser.GameObjects.Text; state: string }>();
  private blink = 0;

  constructor() {
    // 起動時から作っておき、見ていない間は眠らせる（index.ts で切り替え）
    super({ key: 'town', active: true });
  }

  create() {
    buildTownTextures(this);
    buildMiscTextures(this);
    for (const s of SEGMENTS) buildWalkerTextures(this, `w-${s.id}`, s.color, 0x2b2118);
    const ambient = [0x9d4edd, 0x6c757d, 0xe9c46a, 0x264653, 0xe76f51];
    ambient.forEach((c, i) => buildWalkerTextures(this, `w-amb${i}`, c, i % 2 ? 0x5a3e2b : 0x1b1b1b));

    this.add.image(0, 0, 'town').setOrigin(0).setDepth(0);
    this.addLabels();

    this.train = this.add.image(-200, 8, 'train').setOrigin(0, 0.5).setDepth(5);
    this.spawnCars();

    // 夜の暗さと、夜に光るもの
    this.night = this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x0b1440, 0).setOrigin(0).setDepth(9000);
    this.lit = this.add.image(0, 0, 'town-lit').setOrigin(0).setDepth(9001).setAlpha(0);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const lamp = (y === 9 || y === 12 || y === 22 || y === 25) && x % 7 === 3;
        if (lamp) this.glows.push(this.add.image(x * TILE + 8, y * TILE + 8, 'glow').setDepth(9002).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
      }
    }
    this.glows.push(
      this.add
        .image(STORE.x * TILE + (STORE.w * TILE) / 2, STORE.y * TILE, 'glow')
        .setScale(4, 2)
        .setDepth(9002)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0),
    );

    this.rain = this.add
      .particles(0, 0, 'raindrop', {
        x: { min: 0, max: WORLD_W },
        y: { min: -20, max: WORLD_H },
        lifespan: 500,
        speedY: { min: 260, max: 320 },
        speedX: -30,
        quantity: 6,
        frequency: 16,
        alpha: { start: 0.8, end: 0.2 },
      })
      .setDepth(9100);
    this.rain.stop();

    this.setupCamera();

    // 店をタップしたら店内へ、空き物件をタップしたら出店画面へ
    for (const site of SITES) {
      const bl = buildingById(site.buildingId);
      const zone = this.add.zone(bl.x * TILE, bl.y * TILE, bl.w * TILE, bl.h * TILE).setOrigin(0).setInteractive({ cursor: 'pointer' });
      zone.on('pointerup', () => {
        if (this.dragMoved >= 6) return;
        if (storeOf(controller.state, site.id)) controller.selectStore(site.id, 'interior');
        else controller.showExpansion(site.id);
      });
      const label = this.add
        .text(bl.x * TILE + (bl.w * TILE) / 2, (bl.door!.y === bl.y ? bl.y * TILE + bl.h * TILE - 3 : bl.y * TILE + 2), '', {
          fontFamily: FONT,
          fontSize: '7px',
          color: '#1d3557',
          resolution: 4,
          backgroundColor: '#ffffffdd',
          padding: { x: 2, y: 0 },
        })
        .setOrigin(0.5, bl.door!.y === bl.y ? 1 : 0)
        .setDepth(9003);
      const badge = this.add
        .text(bl.x * TILE + bl.w * TILE - 2, bl.y * TILE - 2, '!', { fontFamily: FONT, fontSize: '10px', color: '#ffffff', resolution: 4, backgroundColor: '#e07a00', padding: { x: 3, y: 0 } })
        .setOrigin(0.5)
        .setDepth(9600)
        .setVisible(false);
      this.sites.set(site.id, { label, badge, state: '' });
    }
    this.refreshSites();

    this.unsub.push(controller.onVisits((v) => this.onVisits(v)));
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));
  }

  private addLabels() {
    for (const bl of BUILDINGS) {
      if (!bl.label) continue;
      if (bl.kind === 'store') continue; // 店名は refreshSites で表示
      const isStore = false;
      const y = isStore ? bl.y * TILE + 22 : bl.y * TILE + (bl.kind === 'station' ? 16 : bl.kind === 'school' ? bl.h * TILE - 3 : 6);
      this.add
        .text(bl.x * TILE + (bl.w * TILE) / 2, y, bl.label, {
          fontFamily: FONT,
          fontSize: '8px',
          color: isStore ? '#1d3557' : bl.kind === 'station' ? '#ffffff' : '#2b2d42',
          resolution: 4,
          backgroundColor: isStore ? '#ffffffcc' : undefined,
          padding: isStore ? { x: 2, y: 0 } : undefined,
        })
        .setOrigin(0.5, bl.kind === 'school' ? 1 : 0.5)
        .setDepth(isStore ? 9003 : 2);
    }
  }

  private spawnCars() {
    const lanes: Array<{ x: number; y: number; vx: number; vy: number; h: boolean }> = [
      { x: 0, y: 10 * TILE + 8, vx: -38, vy: 0, h: true },
      { x: 0, y: 11 * TILE + 8, vx: 34, vy: 0, h: true },
      { x: 0, y: 23 * TILE + 8, vx: -30, vy: 0, h: true },
      { x: 0, y: 24 * TILE + 8, vx: 40, vy: 0, h: true },
      { x: 14 * TILE + 8, y: 0, vx: 0, vy: 32, h: false },
      { x: 15 * TILE + 8, y: 0, vx: 0, vy: -36, h: false },
      { x: 33 * TILE + 8, y: 0, vx: 0, vy: -28, h: false },
      { x: 34 * TILE + 8, y: 0, vx: 0, vy: 30, h: false },
    ];
    lanes.forEach((l, li) => {
      for (let i = 0; i < 2; i++) {
        const sprite = this.add.image(0, 0, `car-${l.h ? 'h' : 'v'}-${(li + i * 3) % 6}`).setDepth(4);
        if (l.h) sprite.setPosition(Math.random() * WORLD_W, l.y).setFlipX(l.vx < 0);
        else sprite.setPosition(l.x, 2 * TILE + Math.random() * (WORLD_H - 2 * TILE)).setFlipY(l.vy < 0);
        this.cars.push({ sprite, vx: l.vx, vy: l.vy });
      }
    });
  }

  // ---------- カメラ（ドラッグで移動・ホイール／ピンチで拡大） ----------
  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(-WORLD_W, -WORLD_H, WORLD_W * 3, WORLD_H * 3);
    cam.setBackgroundColor('#5d8c45');
    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());
    this.input.addPointer(1);

    this.input.on('pointerdown', () => {
      this.dragMoved = 0;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (!this.pinch) this.pinch = { dist, zoom: cam.zoom };
        else this.setZoom(this.pinch.zoom * (dist / this.pinch.dist));
        this.dragMoved += 10;
        return;
      }
      this.pinch = null;
      if (!p.isDown) return;
      const dx = p.x - p.prevPosition.x;
      const dy = p.y - p.prevPosition.y;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.clampCamera();
    });
    this.input.on('pointerup', () => {
      if (!this.input.pointer1.isDown || !this.input.pointer2.isDown) this.pinch = null;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.setZoom(cam.zoom * (dy > 0 ? 0.9 : 1.1));
    });
  }

  private minZoom() {
    const cam = this.cameras.main;
    return Math.min(cam.width / WORLD_W, cam.height / WORLD_H);
  }

  private fitCamera() {
    const cam = this.cameras.main;
    // お店を中心に、街の幅いっぱい（狭い画面なら少し寄る）
    const zoom = Math.max(this.minZoom(), Math.min(3, cam.width / (WORLD_W * 0.62)));
    cam.setZoom(zoom);
    cam.centerOn(STORE.x * TILE + STORE.w * 8, STORE.y * TILE + 20);
    this.clampCamera();
  }

  private setZoom(z: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(z, this.minZoom(), 5));
    this.clampCamera();
  }

  private clampCamera() {
    const cam = this.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const cx = Phaser.Math.Clamp(cam.midPoint.x, Math.min(viewW / 2, WORLD_W / 2), Math.max(WORLD_W - viewW / 2, WORLD_W / 2));
    const cy = Phaser.Math.Clamp(cam.midPoint.y, Math.min(viewH / 2, WORLD_H / 2), Math.max(WORLD_H - viewH / 2, WORLD_H / 2));
    cam.centerOn(cx, cy);
  }

  // ---------- 歩く人 ----------
  private onVisits(visits: VisitEvent[]) {
    if (this.sys.isSleeping() || !this.sys.isVisible()) return;
    // 倍速時は間引いて「代表者」だけ歩かせる
    const rate = 1 / Math.max(1, controller.speed);
    for (const v of visits) {
      if (Math.random() > rate) continue;
      if (this.walkers.length >= MAX_WALKERS) return;
      this.spawnVisitor(v);
    }
  }

  private spawnVisitor(v: VisitEvent) {
    const seg = SEGMENTS.find((s) => s.id === v.segment)!;
    const shop = buildingById(SITE_BY_ID[v.siteId].buildingId);
    // 近い建物から来やすい（商圏）：候補から3つ選んで一番近いところ
    const cands = [pick(ORIGINS[seg.origin]), pick(ORIGINS[seg.origin]), pick(ORIGINS[seg.origin])];
    const dist = (b: Building) => Math.abs(b.front!.x - shop.front!.x) + Math.abs(b.front!.y - shop.front!.y);
    const origin = cands.sort((a, b) => dist(a) - dist(b))[0];
    const path = findPath(origin.front!, shop.front!);
    if (!path) return;
    this.addWalker(`w-${v.segment as SegmentId}`, origin, path, 'toStore', v, shop);
  }

  private spawnStroller() {
    const a = pick(ALL_DOORS);
    let b = pick(ALL_DOORS);
    if (a === b) b = pick(ALL_DOORS);
    const path = findPath(a.front!, b.front!);
    if (!path) return;
    this.addWalker(`w-amb${Math.floor(Math.random() * 5)}`, a, path, 'stroll');
  }

  private addWalker(key: string, origin: Building, path: Pt[], phase: Walker['phase'], visit?: VisitEvent, shop?: Building) {
    const sprite = this.add.sprite(0, 0, `${key}-0`).setOrigin(0.5, 1);
    const w: Walker = {
      sprite,
      key,
      path,
      idx: 0,
      t: 0,
      jitter: { x: Math.round((Math.random() - 0.5) * 8), y: Math.round((Math.random() - 0.5) * 6) },
      phase,
      wait: 0,
      origin,
      shop,
      visit,
      animT: Math.random() * 200,
    };
    this.placeWalker(w);
    this.walkers.push(w);
  }

  private placeWalker(w: Walker) {
    const a = w.path[w.idx];
    const b = w.path[Math.min(w.idx + 1, w.path.length - 1)];
    const x = Phaser.Math.Linear(a.x, b.x, w.t) * TILE + 8 + w.jitter.x;
    const y = Phaser.Math.Linear(a.y, b.y, w.t) * TILE + 12 + w.jitter.y;
    w.sprite.setPosition(Math.round(x), Math.round(y)).setDepth(10 + y);
    if (b.x !== a.x) w.sprite.setFlipX(b.x < a.x);
  }

  private popup(text: string, x: number, y: number, color: string, size = 8) {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, resolution: 4, stroke: '#ffffff', strokeThickness: 2 })
      .setOrigin(0.5, 1)
      .setDepth(9500);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 1400, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  private finishShopping(w: Walker) {
    const v = w.visit!;
    const shop = w.shop ?? STORE;
    const x = shop.front!.x * TILE + 8;
    const y = shop.front!.y * TILE + (shop.door!.y === shop.y ? 14 : 2);
    if (v.bought.length) {
      const yen = v.spent;
      this.popup(`+¥${yen}`, x + 14, y - 4, '#2a7a3b');
      this.popup(v.bought.map((id) => CATEGORY_BY_ID[id].icon).join(''), w.sprite.x, w.sprite.y - 12, '#000000', 9);
    }
    if (v.missed.length) {
      this.popup(`${v.missed.map((id) => CATEGORY_BY_ID[id].icon).join('')}品切れ…`, w.sprite.x - 6, w.sprite.y - 22, '#c1121f');
    }
  }

  private updateWalkers(dt: number) {
    const speed = controller.running ? controller.speed : 0;
    const tilesPerSec = 3.2 * Math.sqrt(Math.max(speed, 0));
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      if (speed === 0) continue;
      if (w.phase === 'inside') {
        w.wait -= dt * speed;
        if (w.wait <= 0) {
          w.sprite.setVisible(true);
          this.finishShopping(w);
          w.phase = 'home';
          w.path = [...w.path].reverse();
          w.idx = 0;
          w.t = 0;
        }
        continue;
      }
      w.t += (tilesPerSec * dt) / 1000;
      while (w.t >= 1) {
        w.t -= 1;
        w.idx += 1;
        if (w.idx >= w.path.length - 1) break;
      }
      if (w.idx >= w.path.length - 1) {
        if (w.phase === 'toStore') {
          w.phase = 'inside';
          w.wait = 1500 + Math.random() * 2000;
          w.sprite.setVisible(false);
          w.idx = w.path.length - 1;
          w.t = 0;
          continue;
        }
        w.sprite.destroy();
        this.walkers.splice(i, 1);
        continue;
      }
      w.animT += dt * Math.sqrt(speed);
      w.sprite.setTexture(`${w.key}-${Math.floor(w.animT / 180) % 2}`);
      this.placeWalker(w);
    }
  }

  // ---------- 1フレームごと ----------
  update(_time: number, delta: number) {
    const speed = controller.running ? controller.speed : 0;
    const dt = Math.min(delta, 100);

    this.updateWalkers(dt);

    // 散歩する人（来店しない通行人）
    const clock = controller.clock;
    const busy = clock.hour >= 7 && clock.hour <= 21 ? 1 : 0.2;
    this.strollTimer -= dt * speed;
    if (speed > 0 && this.strollTimer <= 0 && this.walkers.length < MAX_WALKERS) {
      this.spawnStroller();
      this.strollTimer = (1800 / busy) * (0.5 + Math.random());
    }

    // 車と電車
    const k = (dt / 1000) * Math.sqrt(speed);
    for (const c of this.cars) {
      c.sprite.x += c.vx * k;
      c.sprite.y += c.vy * k;
      if (c.sprite.x < -20) c.sprite.x = WORLD_W + 20;
      if (c.sprite.x > WORLD_W + 20) c.sprite.x = -20;
      if (c.sprite.y < 2 * TILE - 20) c.sprite.y = WORLD_H + 20;
      if (c.sprite.y > WORLD_H + 20) c.sprite.y = 2 * TILE - 20;
    }
    this.trainTimer -= dt * speed;
    if (this.trainTimer <= 0 && speed > 0) {
      this.train.x = WORLD_W + 10;
      this.tweens.add({ targets: this.train, x: -110, duration: 5000 / Math.sqrt(speed), ease: 'Linear' });
      this.trainTimer = 20000;
    }

    this.updateLighting();
    this.refreshSites(dt);
  }

  /** 出店状況に合わせて外観・看板を更新し、品薄の店に「!」を出す */
  private refreshSites(dt = 0) {
    this.blink += dt;
    const day = controller.clock.day;
    for (const site of SITES) {
      const v = this.sites.get(site.id)!;
      const store = storeOf(controller.state, site.id);
      const bl = buildingById(site.buildingId);
      const state = !store ? 'vacant' : isOpen(store, day) ? 'open' : 'preparing';
      if (state !== v.state) {
        v.state = state;
        if (store && site.id !== 'main' && !v.shop) {
          const key = buildShopTexture(this, bl);
          v.shop = this.add.image(bl.x * TILE, bl.y * TILE, key).setOrigin(0).setDepth(3);
          v.lit = this.add.image(bl.x * TILE, bl.y * TILE, `${key}-lit`).setOrigin(0).setDepth(9001).setAlpha(this.lit.alpha);
        }
        v.label
          .setText(state === 'vacant' ? `空き物件 ${Math.round(site.openCost / 10000)}万円` : state === 'preparing' ? '開店準備中' : site.name)
          .setColor(state === 'vacant' ? '#7a4b00' : '#1d3557');
      }
      v.lit?.setAlpha(this.lit.alpha);
      let alert: 'empty' | 'low' | null = null;
      if (store && state === 'open') {
        for (const c of CATEGORIES) {
          if (store.today.cats[c.id].startStock <= 0) continue;
          if (stockOf(store, c.id) <= 0) alert = 'empty';
          else if (!alert && shelfRatio(store, c.id) < LOW_STOCK) alert = 'low';
        }
      }
      v.badge
        .setVisible(!!alert && (alert === 'low' || Math.floor(this.blink / 400) % 2 === 0))
        .setBackgroundColor(alert === 'empty' ? '#c1121f' : '#e07a00');
    }
  }

  private updateLighting() {
    const clock = controller.clock;
    const m = clock.minuteOfDay + controller.tickProgress * 15;
    // 0（昼）〜1（夜）：5時から7時に明け、17時から19時に暮れる
    let dark: number;
    if (m < 5 * 60) dark = 1;
    else if (m < 7 * 60) dark = 1 - (m - 300) / 120;
    else if (m < 17 * 60) dark = 0;
    else if (m < 19 * 60) dark = (m - 1020) / 120;
    else dark = 1;
    const weather = weatherOf(controller.state, clock.day);
    const rainy = weather.kind === 'rain';
    const cloudy = weather.kind === 'cloudy';
    this.night.setFillStyle(rainy ? 0x1d2840 : 0x0b1440, Math.max(dark * 0.62, rainy ? 0.22 : cloudy ? 0.08 : 0));
    this.lit.setAlpha(Math.min(1, dark * 1.2 + (rainy ? 0.15 : 0)));
    for (const g of this.glows) g.setAlpha(dark * 0.85);
    if (rainy && controller.running) {
      if (!this.rain.emitting) this.rain.start();
    } else if (this.rain.emitting) this.rain.stop();
  }
}
