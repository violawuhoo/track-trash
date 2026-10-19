/**
 * 五层容器：bg / ground / items / actors / fx。
 *
 * 契约见 `docs/CONTRACT-v2.md` §4.2。
 * ⚠️ 实现由 T3 完成。层顺序固定，不得调换或合并。
 */

export type LayerName = 'bg' | 'ground' | 'items' | 'actors' | 'fx';

export const LAYER_ORDER: readonly LayerName[] = [
  'bg',
  'ground',
  'items',
  'actors',
  'fx',
] as const;

/** 创建五层并挂到根容器；返回句柄，供 update / destroy 使用 */
export function createLayers(): never {
  throw new Error('T3 未实现：createLayers');
}
