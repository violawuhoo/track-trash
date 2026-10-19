/**
 * 物品贴纸 → Pixi 纹理。
 *
 * 契约见 `docs/CONTRACT-v2.md` §4.3 §5.2。
 * 唯一数据源是 `components/ItemIcon.tsx` 的 `itemSvgMarkup()`，
 * 禁止在这里另写一套 SVG 路径。⚠️ 实现由 T3 完成。
 */

/** 同一 itemId 只生成一次纹理，返回缓存 */
export function textureFor(_itemId: string): never {
  throw new Error('T3 未实现：textureFor');
}

/** 卸载时释放全部纹理，避免 WebGL 显存泄漏 */
export function disposeTextures(): void {
  throw new Error('T3 未实现：disposeTextures');
}
