// シード固定の乱数（mulberry32）。状態は数値1つなのでセーブに含められる
export function nextRandom(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** ポアソン分布（期待値が小さい前提の Knuth 法。大きい場合は正規近似） */
export function poisson(state: { rng: number }, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) {
    const u1 = Math.max(nextRandom(state), 1e-12);
    const u2 = nextRandom(state);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(lambda + z * Math.sqrt(lambda)));
  }
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= nextRandom(state);
  } while (p > l);
  return k - 1;
}
