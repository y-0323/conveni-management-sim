import { describe, expect, it } from 'vitest';
import { BUILDINGS, findPath, STORE, walkable } from '../src/data/town';

describe('街マップ', () => {
  it('すべての出入口の前は歩道で、お店まで歩いて行ける', () => {
    for (const bl of BUILDINGS.filter((x) => x.front)) {
      expect(walkable(bl.front!.x, bl.front!.y), `${bl.id} の前が歩道でない`).toBe(true);
      expect(findPath(bl.front!, STORE.front!), `${bl.id} からお店に行けない`).not.toBeNull();
    }
  });

  it('建物どうしが重ならず、道路にはみ出さない', () => {
    const used = new Map<string, string>();
    for (const bl of BUILDINGS) {
      for (let x = bl.x; x < bl.x + bl.w; x++) {
        for (let y = bl.y; y < bl.y + bl.h; y++) {
          const k = `${x},${y}`;
          expect(used.get(k), `${bl.id} と ${used.get(k)} が重なっている`).toBeUndefined();
          expect(walkable(x, y), `${bl.id} が歩道にはみ出している`).toBe(false);
          used.set(k, bl.id);
        }
      }
    }
  });
});
