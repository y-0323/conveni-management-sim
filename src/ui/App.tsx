import { Component } from 'preact';
import type Phaser from 'phaser';
import type { GameController, Tab } from '../core/controller';
import { createGame } from '../game';
import { yen } from './format';
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
  { id: 'reports', label: '日報', icon: '📊' },
];

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
            あなたは駅前のコンビニ「<b>まちかどマート</b>」の新人オーナー。街の人たちがやってきて、商品が売れていきます。
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
          </ol>
          <p class="goal">🎯 廃棄と売り逃しを減らして、利益を積み上げよう。平日と週末、晴れと雨でお客さんは変わります。</p>
          <p class="hint">操作：街はドラッグで移動、ピンチ（PCはホイール）で拡大。お店をタップすると店舗情報。右上のボタンで一時停止・倍速。</p>
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
  if (!c.state.bankrupt || c.pendingReport) return null;
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
        <MapView />
        <aside class="side">
          <nav class="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={c.tab === t.id} class={c.tab === t.id ? 'on' : ''} onClick={() => c.setTab(t.id)}>
                <span aria-hidden="true">{t.icon}</span> {t.label}
              </button>
            ))}
          </nav>
          {c.tab === 'store' && <StorePanel c={c} />}
          {c.tab === 'order' && <OrderPanel c={c} />}
          {c.tab === 'reports' && <ReportsPanel c={c} />}
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
