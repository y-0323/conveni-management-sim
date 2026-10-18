import Phaser from 'phaser';
import { controller } from '../core/controller';
import { StoreScene } from './StoreScene';
import { TownScene } from './TownScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#3b2f2a',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    input: { touch: { capture: true } },
    scene: [StoreScene, TownScene],
    banner: false,
  });

  // 時間を進めるのはここ1か所（どちらの画面を見ていても進む）
  game.events.on(Phaser.Core.Events.STEP, (_time: number, delta: number) => controller.update(delta));

  // 店内／街の切り替え。見ていない方は眠らせる（更新も描画もしない）
  let current = '';
  const sync = () => {
    const show = controller.view === 'interior' ? 'store' : 'town';
    const hide = show === 'store' ? 'town' : 'store';
    if (show === current) return;
    const sm = game.scene;
    // シーンの create が終わるまで待つ
    const ready = (k: string) => sm.isActive(k) || sm.isSleeping(k);
    if (!ready(show) || !ready(hide)) {
      setTimeout(sync, 50);
      return;
    }
    current = show;
    if (sm.isSleeping(show)) sm.wake(show);
    if (sm.isActive(hide)) sm.sleep(hide);
  };
  game.events.once(Phaser.Core.Events.READY, () => {
    // 両方のシーンを一度作ってから切り替える
    setTimeout(sync, 0);
  });
  controller.subscribe(sync);
  return game;
}
