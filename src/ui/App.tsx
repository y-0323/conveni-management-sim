import { Component } from 'preact';
import type Phaser from 'phaser';
import type { GameController, Tab } from '../core/controller';
import { CATEGORIES } from '../data/categories';
import { SITE_BY_ID, SITES } from '../data/sites';
import { createGame } from '../game';
import { LOW_STOCK } from '../game/StoreScene';
import { canOpen, isOpen, shelfRatio, stockOf } from '../sim/simulation';
import { ExpandPanel } from './ExpandPanel';
import { PricePanel } from './PricePanel';
import { num, yen } from './format';
import { useController } from './hooks';
import { Hud } from './Hud';
import { OrderPanel } from './OrderPanel';
import { ReportModal, ReportsPanel } from './Reports';
import { StorePanel } from './StorePanel';

/** Phaser のキャンバスを置く場所。Preact には再描画させない */
class MapView extends Component {
  private game: Phaser.Game | null = null;
  private el: HTMLDivElement | null = null;
  componentDidMount() {
    if (this.el) this.game = createGame(this.el);
  }
  componentWillUnmount() {
    this.game?.destroy(true);
  }
  shouldComponentUpdate() {
    return false;
  }
  render() {
    return <div class="map" ref={(el) => { this.el = el; }} aria-label="街マップ（ドラッグで移動、ピンチ・ホイールで拡大）" />;
  }
}

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'store', label: '店舗', icon: '🏪' },
  { id: 'order', label: '発注', icon: '📦' },
  { id: 'price', label: '価格', icon: '💴' },
  { id: 'reports', label: '日報', icon: '📊' },
  { id: 'expand', label: '出店', icon: '🏗' },
];

/** 地図の上に重ねる表示：店内／街の切り替え、店名、品薄の警告 */
function MapOverlay({ c }: { c: GameController }) {
  const store = c.store;
  const open = isOpen(store, c.clock.day);
  const alerts = open
    ? CATEGORIES.filter((cat) => store.today.cats[cat.id].startStock > 0)
        .map((cat) => ({ cat, stock: stockOf(store, cat.id), ratio: shelfRatio(store, cat.id) }))
        .filter((a) => a.stock <= 0 || a.ratio < LOW_STOCK)
    : [];
  // 他の店の品薄
  const others = c.state.stores.filter(
    (s) => s.siteId !== store.siteId && isOpen(s, c.clock.day) && CATEGORIES.some((cat) => s.today.cats[cat.id].startStock > 0 && shelfRatio(s, cat.id) < LOW_STOCK),
  );
  return (
    <div class="map-overlay">
      <div class="view-toggle" role="group" aria-label="表示の切り替え">
        <button class={c.view === 'interior' ? 'on' : ''} aria-pressed={c.view === 'interior'} onClick={() => c.setView('interior')}>
          🏪 店内
        </button>
        <button class={c.view === 'town' ? 'on' : ''} aria-pressed={c.view === 'town'} onClick={() => c.setView('town')}>
          🗺 街
        </button>
      </div>
      {c.view === 'interior' && (
        <div class="store-name">
          {SITE_BY_ID[store.siteId].name}
          {!open && <small>開店準備中</small>}
        </div>
      )}
      <div class="alerts" aria-live="polite">
        {alerts.map(({ cat, stock }) => (
          <button key={cat.id} class={`alert-pill ${stock <= 0 ? 'empty' : 'low'}`} onClick={() => c.setTab('order')}>
            {cat.icon} {stock <= 0 ? '品切れ' : `残り${num(stock)}`}
          </button>
        ))}
        {others.map((s) => (
          <button key={s.siteId} class="alert-pill low" onClick={() => c.selectStore(s.siteId, 'interior')}>
            ⚠ {SITE_BY_ID[s.siteId].name}が品薄
          </button>
        ))}
      </div>
    </div>
  );
}

function StoreSwitcher({ c }: { c: GameController }) {
  const canExpand = SITES.some((s) => canOpen(c.state, s.id));
  return (
    <div class="store-switch" role="tablist" aria-label="店舗の切り替え">
      {c.state.stores.map((s) => (
        <button key={s.siteId} role="tab" aria-selected={c.selectedSite === s.siteId} class={c.selectedSite === s.siteId ? 'on' : ''} onClick={() => c.selectStore(s.siteId)}>
          {SITE_BY_ID[s.siteId].name}
        </button>
      ))}
      <button class={`add ${canExpand ? 'ready' : ''}`} onClick={() => c.showExpansion(null)}>
        ＋出店{canExpand && '！'}
      </button>
    </div>
  );
}

function Intro({ c }: { c: GameController }) {
  if (!c.showIntro) return null;
  return (
    <div class="modal-backdrop">
      <div class="modal intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <div class="modal-scroll">
          <div class="intro-hero" aria-hidden="true">
            🏪
          </div>
          <h2 id="intro-title">まちかどマートへようこそ</h2>
          <p>
            あなたは駅前のコンビニ「<b>まちかどマート</b>」の新人オーナー。お客さんが棚から商品を取り、レジで会計していきます。
          </p>
          <ol class="steps">
            <li>
              <b>📦 発注</b>：明日の朝に届く商品の数を決める。天気予報と過去の売れ方がヒント
            </li>
            <li>
              <b>🏪 営業</b>：時間が流れ、お客さんが来店。品切れすると売り逃し、余ると翌朝に廃棄
            </li>
            <li>
              <b>📊 日報</b>：毎朝6時に前日の結果とエリアマネージャーの講評が届く
            </li>
            <li>
              <b>🏗 出店</b>：お店が軌道に乗ったら、街の空き物件に2号店・3号店を出せる
            </li>
          </ol>
          <p class="goal">🎯 廃棄と売り逃しを減らして、利益を積み上げよう。平日と週末、晴れと雨でお客さんは変わります。</p>
          <p class="hint">操作：左上の「店内／街」で表示を切り替え。棚の商品が減ると「残りわずか」「品切れ」の札が出ます。街はドラッグで移動、ピンチ（PCはホイール）で拡大。右上で一時停止・倍速。</p>
        </div>
        <div class="modal-foot">
          <button class="primary big" onClick={() => c.closeIntro()}>
            開店する
          </button>
        </div>
      </div>
    </div>
  );
}

function Bankrupt({ c }: { c: GameController }) {
  if (!c.state.bankrupt || c.pending) return null;
  return (
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-scroll">
          <h2>資金が尽きました…</h2>
          <p>現金が {yen(c.state.cash)} になり、仕入代金や人件費を払えなくなりました。売れ残りの多い発注や、売り逃しの多い発注が続かなかったか、日報で振り返ってみましょう。</p>
        </div>
        <div class="modal-foot">
          <button class="primary" onClick={() => c.restart()}>
            最初からやり直す
          </button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const c = useController();
  return (
    <div class="app">
      <Hud c={c} />
      <main class="main">
        <div class="map-wrap">
          <MapView />
          <MapOverlay c={c} />
        </div>
        <aside class="side">
          <StoreSwitcher c={c} />
          <nav class="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={c.tab === t.id} class={c.tab === t.id ? 'on' : ''} onClick={() => c.setTab(t.id)}>
                <span aria-hidden="true">{t.icon}</span> {t.label}
                {t.id === 'expand' && SITES.some((s) => canOpen(c.state, s.id)) && <span class="dot" aria-label="出店できます" />}
              </button>
            ))}
          </nav>
          {c.tab === 'store' && <StorePanel c={c} />}
          {c.tab === 'order' && <OrderPanel c={c} />}
          {c.tab === 'price' && <PricePanel c={c} />}
          {c.tab === 'reports' && <ReportsPanel c={c} />}
          {c.tab === 'expand' && <ExpandPanel c={c} />}
          <div class="side-foot">
            <button
              class="link"
              onClick={() => {
                if (confirm('最初からやり直しますか？今の進行状況は消えます。')) c.restart();
              }}
            >
              最初からやり直す
            </button>
          </div>
        </aside>
      </main>
      <Intro c={c} />
      <ReportModal c={c} />
      <Bankrupt c={c} />
    </div>
  );
}
