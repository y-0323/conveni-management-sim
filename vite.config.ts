import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// GitHub Pages ではリポジトリ名のパス配下で配信される
export default defineConfig({
  base: '/conveni-management-sim/',
  plugins: [preact()],
  build: {
    chunkSizeWarningLimit: 1600, // Phaser 本体が大きいため
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
