/**
 * 世界层运行时计数 —— **只给开发期验证用**，生产环境没有读取方。
 *
 * 存在的唯一理由：React 18 StrictMode 会把 `useEffect` 挂载两次，
 * "有没有泄漏 canvas / ticker"是肉眼看不出来的，必须有可断言的数字。
 * `preview.tsx` 把它挂到 `window.__t3.stats()` 上，由验收脚本读取。
 */
export const WORLD_STATS = {
  /** effect 运行次数（StrictMode 下正常值是 2） */
  mounts: 0,
  /** 清理函数运行次数（正常值与 mounts 相等） */
  teardowns: 0,
  /** 当前活着的 Application 数（应当 0 或 1，永远不该是 2） */
  liveApps: 0,
  /** 当前挂在 ticker 上的帧回调数（应当 0 或 1） */
  liveTickers: 0,
  /** 当前播放的走路帧（0–5）。reduced-motion 下恒为 2 */
  currentStep: 2,
  /** 采样窗口内见过的帧号集合，用于断言"走路循环真的在动" */
  stepsSeen: new Set<number>(),
};
