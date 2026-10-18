import Phaser from 'phaser';
import { TownScene } from './TownScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#5d8c45',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    input: { touch: { capture: true } },
    scene: [TownScene],
    banner: false,
  });
}
