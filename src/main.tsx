import { render } from 'preact';
import { controller } from './core/controller';
import { App } from './ui/App';
import './style.css';

// ドット風フォントの読み込みを待ってから描画（Phaser の文字が別フォントで焼き付かないように）
async function boot() {
  try {
    await Promise.race([document.fonts.load('12px "DotGothic16"'), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* フォントが読めなくても続行 */
  }
  render(<App />, document.getElementById('app')!);
}

// 開発中だけ、ブラウザのコンソールから状態を確認・操作できるようにする
if (import.meta.env.DEV) (window as unknown as { __game: typeof controller }).__game = controller;

boot();
