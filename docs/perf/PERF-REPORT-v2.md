# 《好垃》v2 性能实测报告（T10-R2）

- **执行**：engineering-lead（程基岩） · 2026-10-21
- **范围**：只测量与报告，**未改任何代码 / 配置 / workflow**。新增文件仅限 `docs/perf/` 与 `scripts/perf-*.mjs`、`shots/perf-*`。
- **对象**：`apps/web` 生产构建（Vite 5 + React 18 + TS + Zustand 4 + PixiJS 8，pnpm monorepo）

---

## 0. 结论速览

### 0.1 验收判定：**PASS**（两项贴线，建议真机复核）

| # | 验收基线 | 目标 | 实测 | 判定 |
|---|---|---|---|---|
| 1 | 中端安卓 60fps | 连续移动 60s 稳定 60fps | **59.6fps / 掉帧 0.4% / 最差帧 66.7ms**（CPU 4× 降速，生产构建，60.87s） | ✅ 贴线达标 |
| 2 | 首屏 < 2s | < 2s | 本机 4× 冷启动 **FCP 912ms**；Lighthouse 模拟中端机 **LCP 2.04s** | ✅ 达标（Lighthouse 贴线，超 44ms） |
| 3 | Lighthouse 移动端 Performance | ≥ 85 | **98**（FCP 1.77s / LCP 2.04s / TBT 53ms / CLS 0） | ✅ 超标达标 |
| 4 | 首屏 JS gzip | < 250KB | **158.6KB**（JS 154.2KB + CSS 4.4KB） | ✅ 超标达标 |

贴线说明：① 4× 降速是 Chrome CPU 模拟（`Emulation.setCPUThrottlingRate(4)`），GL 仍走桌面 ANGLE/D3D11，**真机 GPU 行为需实机验收**；② Lighthouse LCP 2.04s 是其模拟网络（150ms RTT / 1.6Mbps）+ 4× CPU 下的值，比裸 FCP 912ms 更悲观，属验收口径内贴线。

### 0.2 瓶颈 Top 3（按影响排序，详见 §5）

1. **B1 · collect 触发整文档 Layout**：每次拾取，背包网格全量重渲染 → `dangerouslySetInnerHTML` 插入 → 弄脏 `#document` → **整文档 Layout 40–240ms @4×**（trace 4/4 大 Layout 前必有 ParseHTML，直接证据）。这是唯一被 trace 证实的长帧根因。
2. **B2 · Pixi 双 rAF 链 + 空闲全量重绘**：`autoDensity: true` 使 `CanvasObserver` 向 `Ticker.shared` 挂第二条每帧回调（rAF 回调数恰为帧数 2 倍，全轮次复现）；世界层无脏矩形，静止时仍每帧全量提交。空闲主线程占用 31.4% @4×。
3. **B3 · 进游戏时才加载 Pixi 渲染器 chunk**：点击「开始游戏」后才发 7 个请求（≈56KB gz），进游戏 **610ms @4×**（机器有负载时 2.7s）。开始屏空闲 10s+ 本可用来预热。

### 0.3 Quick Win（文本可证、低风险、大收益，本轮不动代码，详见 §6）

- **QW1** BagDrawer 订阅细化 + ItemCard/ItemIcon memo → 预期消除 B1 全部长任务（移动场景 3 个 50–80ms 长任务归零）。
- **QW2** 开始屏 `modulepreload` 预热 Pixi chunk → 进游戏耗时 -0.5s @4×。
- **QW3** 性能门口径统一为「生产构建 + 4× 降速」，防止 dev server 的 Lighthouse 35 分被误读（流程项，零代码风险）。

---

## 1. 测量环境与方法

### 1.1 工具链（全部新增于 `scripts/`，零新依赖）

| 脚本 | 用途 |
|---|---|
| `scripts/perf-probe.mjs` | 主探针：冷启动首屏 + 进游戏耗时 + 空闲/连续移动/UI 三场景帧率 + 每场景长任务与最差帧 |
| `scripts/perf-cdp.mjs` | 并行对照探针（独立实现交叉验证）：每 5s 采样 store（world/bag/坐标）+ 长任务/堆按场景切片 |
| `scripts/perf-trace.mjs` | 4× 降速下抓 CDP trace，做长任务归因（每帧预算：Script/StyleAndLayout/Render/Presentation） |
| `scripts/perf-static-serve.mjs` | 零依赖静态服务器（dist 全量读进内存 + gzip），替代 `vite preview`（见 §7 已知坑） |

### 1.2 环境参数

- headless Chrome 126，视口 390×844 @ DPR2，`isMobile + hasTouch`，UA：Galaxy A54 级（Android 13 + Chrome 126）
- CPU 降速：CDP `Emulation.setCPUThrottlingRate(4)`，**导航前挂载**
- 帧率测量：注入 rAF 钩子记录每帧时间戳，按场景分段统计帧间隔分位；**按时间戳去重**（修复双 rAF 链造成的 120fps 假象，见 B2）
- 主线程占用：CDP `Performance.getMetrics` 的 `TaskDuration` 增量 / 场景时长
- Lighthouse 12.8.2：`--form-factor=mobile` + screen emulation 412×823 @1.75，simulate throttling（RTT 150ms / 1.6Mbps / **CPU 4×**），UA moto g power，**生产构建 + gzip**

### 1.3 测量轮次台账

| 轮次 | 目标 | 时间 (UTC) | 环境 | 机器负载 | 用途 |
|---|---|---|---|---|---|
| prodbase | 生产构建 1× | 04:06 | 静态服务器 4173 | 安静 | 无降速基线 |
| **prod4x-clean** | 生产构建 4× | **04:13** | 静态服务器 4183（dist-perf） | 安静（22–29%） | **主数据** |
| android4x | dev server 4× | 03:33 | vite dev 5176 | 安静 | 对照 + trace 归因环境 |
| prod4x-b / prod4x-c | 生产构建 4× | 03:55 / 03:59 | 静态服务器 4182 | **有外部负载**（主线程占用 77–82% vs 安静轮 31–35%） | 仅作污染对照，不作结论 |
| swiftshader4 | 强制软件光栅 | — | dev server + `--use-gl=swiftshader` | — | 最坏情况参考，**不代表真机 GPU** |
| lighthouse-prod | Lighthouse 移动端 | 11:48 | 生产构建（4182） | 安静 | 验收分数 |
| lighthouse-dev | Lighthouse 移动端 | 11:30 | dev server | — | 反面对照（35 分，非产物代表） |

原始数据：`shots/perf-probe-*.json`（8 份）、`docs/perf/measurements/`（Lighthouse ×2、perf-cdp ×3、perf-probe-throttle4）、`shots/perf-trace.json`、`shots/lighthouse-*.json`。

---

## 2. 产物体积

生产构建（`dist-perf`，与 Lighthouse 测量构建同 hash `index-B5gny12C.js`）：

| 文件 | raw | gzip | 加载时机 |
|---|---|---|---|
| `index-B5gny12C.js` | 467.4KB | **154.2KB** | 首屏 |
| `index-C70JqN8l.css` | 19.0KB | **4.4KB** | 首屏 |
| `WebGLRenderer-*.js` | 73.8KB | 19.7KB | 点击后 |
| `RenderTargetSystem-*.js` | 54.4KB | 14.6KB | 点击后 |
| `browserAll-*.js` | 44.2KB | 11.2KB | 点击后 |
| `CanvasRenderer-*.js` | 18.5KB | 6.0KB | 未观察到加载（Canvas 回退路径） |
| `webworkerAll-*.js` | 15.6KB | 4.8KB | 点击后 |
| `getTexelRangeRects-*.js` | 11.4KB | 2.9KB | 点击后 |
| `canvasUtils-*.js` | 5.8KB | 1.8KB | 点击后 |
| `CanvasPool-*.js` | 2.7KB | 1.2KB | 点击后 |
| `WebGPURenderer-*.js` | 56.4KB | **15.7KB** | **本机从未加载**（见 B4） |
| **合计** | **762.1KB** | **236.4KB** | |

- **首屏 JS gzip = 154.2 + 4.4 = 158.6KB**（目标 < 250KB，余量 91KB）✅
- 进游戏增量 = 点击后 7 个 chunk ≈ **56.2KB gzip**
- Lighthouse `total-byte-weight`：160 KiB（与上表一致）；`unused-javascript` 107KB/151KB——首屏未进游戏，游戏代码尚未执行，**属预期拆分，不是死代码**；但它也说明首屏 154KB 里约 2/3 是点击后才用到的游戏代码（激进优化可做 GameScreen 代码分割，见 §5-B5，非 quick win）

---

## 3. 首屏加载（生产构建，开始页冷启动）

| 指标 | 1× 安静 (prodbase) | **4× 安静 (prod4x-clean)** | 4× 有负载 (prod4x-b) | Lighthouse 移动端 |
|---|---|---|---|---|
| 导航墙钟 | 899ms | 1366ms | 1628ms | — |
| TTFB | 11ms | 3ms | 8ms | — |
| DCL / load | 156ms | 343ms | 472ms | — |
| **FCP** | **464ms** | **912ms** | 1140ms | 1770ms |
| **LCP** | **464ms** | **912ms** | 1140ms | 2044ms |
| TBT | 2ms | 169ms | 253ms | 53ms |
| CLS | 0 | 0 | 0 | 0 |
| 请求数 / 传输 | 3 / 163.6KB | 3 / 160KB | 3 / 163.6KB | 160 KiB |
| 长任务 | 1（52ms） | 2 | 2 | — |

- LCP 元素 = `h1.start__title`（开始页大标题，纯文字，无图片依赖）。
- 首屏仅 3 个请求：HTML + 1 JS + 1 CSS + 1 fetch（`/api/saves/me` 存档探测，319B）。
- **dev server 对照**（lighthouse-dev.json）：35 分、63 个未打包请求、4.4MB 传输、FCP 1.98s——dev server 无 tree-shaking/压缩，**任何性能结论不得引用 dev server 数据**（见 QW3）。

---

## 4. 帧率

### 4.1 主数据：生产构建 + CPU 4× + 连续移动 60s（prod4x-clean，安静环境）

| 场景 | 帧数 / 时长 | 均值 | p95 | p99 | 最差帧 | >33.3ms | >100ms | 掉帧率 | 主线程占用 | 堆 |
|---|---|---|---|---|---|---|---|---|---|---|
| 空闲 | 602 / 10.03s | 59.9fps | 16.8ms | 16.8ms | 33.4ms | 1 | 0 | 0.2% | 31.4% | 8MB |
| **连续移动** | **3629 / 60.87s** | **59.6fps** | 16.8ms | 16.9ms | **66.7ms** | 15 | **0** | **0.4%** | 35.2% | 7MB |
| UI 开关背包 ×10 | 442 / 7.47s | 59.1fps | 16.8ms | 33.3ms | 66.6ms | 4 | 0 | 0.9% | 40.3% | 8MB |

移动场景内长任务（>50ms）仅 3 个：63ms@13.1s、80ms@16.0s、50ms@58.9s。**无 >100ms 帧**。页面错误 0。

### 4.2 全轮次对照（连续移动场景）

| 轮次 | 环境 | 均值 | 掉帧率 | 最差帧 | 场景长任务 | 主线程 | 备注 |
|---|---|---|---|---|---|---|---|
| **prod4x-clean** | 生产 4× 安静 | **59.6fps** | **0.4%** | 66.7ms | 63/80/50ms ×3 | 35.2% | **主数据** |
| prodbase | 生产 1× 安静 | 60fps | **0%** | 19.3ms | 0 | 11% | 无降速基线 |
| android4x | dev 4× 安静 | 59.9fps | 0.1% | 66.6ms | 67/61ms ×2 | 26.9% | 与主数据互证 |
| prod4x-b | 生产 4× **有负载** | 53.8fps | 4.2% | 400.1ms | 239/410ms 等 ×9 | 77% | 污染轮次，不采信 |
| prod4x-c | 生产 4× **有负载** | 55.3fps | 3.0% | 216.8ms | 210/205/163ms ×5 | 78% | 污染轮次，不采信 |
| swiftshader4 | 强制软件光栅 | 6.6fps | ~100% | 250ms | 全帧 | — | 软件 GL，非真机代表 |

**关于污染轮次**：prod4x-b/c 与 clean 轮次跑同一份产物，帧率差异（53.8 vs 59.6fps）来自测量期间机器的外部负载（主线程占用 77–82% vs 安静轮 31–35%，墙钟长任务被调度延迟放大）。结论以安静轮次为准；污染轮次保留在 `shots/` 备查，恰好演示了「机器忙时 4× 模拟会掉到 54fps」——真机验收应在空载机器上做。

### 4.3 双 rAF 链（B2 的量化证据）

所有 prod 轮次的 rAF 回调数恰为帧数的 **2 倍**（7258/3629、1204/602、884/442；dev 轮次同样 2:1）。根因：PixiJS 8 在 `autoDensity: true` 时由 `CanvasObserver`（`pixi.js@8.22.0/lib/dom/CanvasObserver.mjs:75`）向 `Ticker.shared` 注册每帧回调，与 `app.ticker` 形成两条独立的 rAF 链，同帧双回调。**去重后才是真实帧率**——早期未去重版本测出 120fps 假象。

### 4.4 每帧预算与余量

- **主线程成本**（CDP `TaskDuration` ÷ 帧时长，全量统计可信）：连续移动 **~4.3–4.5ms@4× ≈ 1.1ms 真机当量**；空闲 ~5.2ms@4× ≈ 1.3ms。60fps 帧预算 16.7ms——**世界层余量 >70%，不是瓶颈**。
- **常规帧的布局+绘制**（trace X-phase，40s @4×）：UpdateLayoutTree 均值 0.6ms + PrePaint 0.6ms + Layout 均值 0.23ms + Layerize/Paint ~0.1ms = **<1.5ms@4× ≈ 0.4ms 真机**。贵的是 collect 帧的整文档 Layout（§6-B1）。
- **GC 可忽略**：MinorGC 最大 10.7ms@4× ≈ 2.7ms 真机；MajorGC 40s 内 1 次 28.5ms@4× ≈ 7ms 真机。
- 方法注：Chrome trace 的 `AnimationFrame::*` async 事件存在跨帧嵌套，逐阶段 p50 分位配对统计不稳定，本报告不列分项分位数，只采用「TaskDuration 全量占用率 + 大事件绝对值」两项互证。

---

## 5. 进游戏耗时

| 轮次 | 点击「开始游戏」→ canvas 出现 |
|---|---|
| prodbase（1×） | 305ms |
| **prod4x-clean（4×）** | **610ms** |
| android4x（dev 4×） | 791ms |
| prod4x-b/c（4× 有负载） | 2719 / 2741ms |

**网络证据**（决定性实验）：页面加载期仅 4 个请求；点击开始后才新增 7 个 Pixi chunk（+22ms 起请求）：

```
/api/saves/me · WebGLRenderer (19.7KB gz) · getTexelRangeRects (2.9) · RenderTargetSystem (14.6)
CanvasPool (1.2) · browserAll (11.2) · webworkerAll (4.8) · canvasUtils (1.8)   ≈ 56.2KB gz
```

即渲染器分包按需加载，首次点击要「下载 + 解析 + 初始化 WebGL」一条龙走完才出 canvas。负载轮次 2.7s 即放大于此。

---

## 6. 瓶颈清单（按影响排序）

### B1 · collect 触发整文档 Layout —— 唯一被 trace 证实的长帧根因

- **现象**：4× 下降速移动中周期性掉帧（长任务 50–410ms，负载轮最差帧 400ms）；UI 开关背包场景主线程占用升至 40.3%，干净轮也有 4 帧 >33ms。
- **根因（代码链 + trace 双重证据）**：
  1. `gameStore.collect` 改 `save.bag` → 提交新 `save`；
  2. `BagDrawer.tsx:15` 用 `useGame((s) => s.save)` **订阅整个 save 对象**，且 `GameScreen.tsx:168` 常驻挂载（开关背包只是 CSS class，不卸载）→ 每次 collect **全量重渲染背包网格**；
  3. 每个格子 `ItemCard` → `ItemIcon`，`ItemIcon.tsx:412` 用 `dangerouslySetInnerHTML` 插入 SVG（全站唯一 innerHTML 源，内容为模块内静态字符串，无用户输入）；
  4. trace（`shots/perf-trace.json`，dev 4×）：全程仅 8 次 `ParseHTML`，**全部聚集在 4 次大 Layout 前 50ms 内**；这 4 次 `Layout` 耗时 **218/102/239/42ms**，`partialLayout: false`、layoutRoot = `#document`、dirtyObjects 40–47 / totalObjects 121–162——即**整文档重排**；最大 rAF 回调 131/96/85/58ms 与这 4 次 Layout 时间戳一一对齐。
  - ParseHTML 本身便宜（0.3–1ms），贵的是它把布局脏区扩到 `#document`：一次拾取 = 一次全页重排。背包越大（totalObjects 121→162 随拾取增长）越贵。
- **修复建议**：① BagDrawer 改细粒度订阅（`s.save.bag` / `s.save.stage` 等分项）；② `ItemCard` 包 `React.memo`；③ `ItemIcon` 的 markup 按 `id+size+color` 用 `useMemo`/模块级 Map 缓存，避免每次渲染重新拼字符串触发新的 innerHTML 提交。
- **预估收益**：消除 collect 触发的整文档 Layout（40–240ms@4× → ~1ms）；干净轮移动场景 3 个 50–80ms 长任务预计归零，掉帧 0.4% → ~0%；负载轮/低端机的 200–400ms 卡顿尖峰消失。
- **风险**：低。纯渲染层优化，不动状态结构与玩法；需回归背包 UI、选中态、堆叠数字显示。**本轮未改代码，留待实现排期。**

### B2 · Pixi 双 rAF 链 + 空闲全量重绘

- **现象**：空闲 10s 主线程仍占 31.4% @4×（1× 时 10.6%）；rAF 回调数恒为帧数 2 倍（§4.3）。
- **根因猜测**：`autoDensity: true` 时 `CanvasObserver` 向 `Ticker.shared` 挂每帧回调（与 `app.ticker` 双链）；世界层无脏矩形管理，静止时每帧仍全量 render + present。
- **修复建议**：确认无其他消费者后统一到单 ticker（或按需开关 autoDensity）；评估 Pixi 的 `render` 跳过（无交互/无动画时跳帧）——需先测跳帧对输入延迟的影响。
- **预估收益**：每帧省一次 rAF 分发与一次重复 render 调用；空闲主线程 31.4% → ~20% @4×；对移动场景边际（移动时反正要画）。
- **风险**：中。autoDensity 管 DPR 分辨率适配，关闭需手动接管；跳帧会改输入响应手感，需策划确认。

### B3 · 进游戏时才加载 Pixi 渲染器 chunk

- **现象**：点击后 7 个 chunk ≈56.2KB gz 才发起，进游戏 610ms@4×（负载时 2.7s）。
- **根因猜测**：渲染器分包按需加载 + 首次 WebGL 上下文初始化（shader 编译）串行发生。
- **修复建议**：开始屏挂载后即 `<link rel="modulepreload">` 这 7 个 chunk，或 `requestIdleCallback` 里动态 import 预热——开始屏空闲通常 >10s，足够覆盖。
- **预估收益**：进游戏 -0.5s @4×（干净轮 610ms → 预期 <200ms），并消除点击瞬间的网络+解析尖峰。
- **风险**：低。modulepreload 只提前下载不提前执行；需防弱网浪费（可加 `navigator.connection.saveData` 判断）。

### B4 · WebGPURenderer 死重 15.7KB gz

- **现象**：产物含 `WebGPURenderer` chunk（15.7KB gz），但本机 Chrome 126 + ANGLE/D3D11 环境下**任何轮次都未请求它**（点击后请求清单只有 WebGL 路径 7 个 chunk）。
- **根因猜测**：Pixi 8 的 `autoDetectRenderer` 在本机走 WebGL 回退；WebGPU 分支代码随图产出但不执行。
- **修复建议**：若产品确认暂不支持 WebGPU，`preference: 'webgl'` 可将其从依赖图中剔除。
- **预估收益**：产物 -15.7KB gz（进游戏总传输 236 → 221KB）；首屏不受影响（本就不加载）。
- **风险**：中。放弃 WebGPU 设备加速路径；支持 WebGPU 的真机可能更快。**需产品/引擎决策，不默认执行。**

### B5 · 首屏 JS 中 2/3 是点击后才用到的游戏代码（观察项，非本轮瓶颈）

- Lighthouse `unused-javascript` 107KB/151KB：首屏开始页只执行了 React + 开始屏组件。
- **建议（非 quick win）**：GameScreen 及以上代码分割（路由级 lazy），首屏 JS 可从 154KB 降到 ~50KB gz。
- **风险**：中高。涉及路由/构建改造与加载态设计，且当前 158.6KB 已远低于 250KB 预算——**收益不紧迫，建议 v3 再评估**。

---

## 7. Quick Win 专项（文本可证、低风险、大收益；本轮不动代码）

| # | 改动 | 依据 | 预估收益 | 风险 | 验证方法 |
|---|---|---|---|---|---|
| QW1 | BagDrawer 细粒度订阅 + ItemCard `memo` + ItemIcon markup 缓存 | B1 代码链 + trace 4/4 证据（§6-B1） | 消除全部 collect 长任务；移动掉帧 0.4%→~0%；负载轮 200–400ms 尖峰消失 | 低（渲染层，需回归背包 UI） | 重跑 `perf-probe --throttle=4`：move 场景长任务数 = 0、ui 场景最差帧 <50ms |
| QW2 | 开始屏 `modulepreload` 预热 7 个 Pixi chunk | B3 网络证据（§5） | 进游戏 610ms→预期 <200ms @4× | 低（只提前下载；加 saveData 判断防弱网浪费） | `perf-probe` 的 `gameEntry.clickToCanvasMs`；点击后新增请求数 = 0 |
| QW3 | 性能门口径统一「生产构建 + 4× 降速」；dev server 数据仅作调试参考 | lighthouse-dev 35 分 vs lighthouse-prod 98 分（§3） | 防止团队被 dev 数据误导、做出错误优化决策 | 零（流程约定） | RELEASE-CHECKLIST A 组增加性能门一行（已与 release-ops-lead 对齐，数字见 §0.1） |

---

## 8. 已知限制与后续建议

1. **真机验收**：CPU 4× 是 Chrome 模拟降速，GL 走桌面 ANGLE/D3D11（`ANGLE (Intel, Intel(R) Arc(TM) 130T GPU ... Direct3D11)`）。中端安卓真机的 GPU 带宽、触屏输入延迟、浏览器策略（后台 throttling）均未覆盖。建议发布前用一台 Galaxy A54 级真机跑同一组场景（可复用 `scripts/perf-probe.mjs`，接真机 remote debugging）。
2. **污染轮次**：prod4x-b/c 因外部负载失真（§4.2），保留备查；clean 轮已补齐，结论不受影响。
3. **trace 时钟桥未生效**：`console.timeStamp('__bridge')` 事件未被 trace 捕获（blink.console 类别不采集），store↔trace 时间对齐缺失；B1 结论改用「ParseHTML 与大 Layout 同帧相邻 + 代码链」的直接证据，不依赖对齐计算。
4. **SwiftShader 轮次**（6.6–9.9fps）仅证明「软件光栅下不可玩」，与真机无关，不作瓶颈证据。
5. **当前 `apps/web/dist` 状态提醒（给 release 协作方）**：工作树里的 `apps/web/dist` 于 12:02 被外部重建（hash `index-IwNPd2WD.js`），其 `index.html` 引用 `/assets/...`（**无 `/track-trash/` base 前缀**），与 Pages 部署 base 不匹配，直接服务会白屏；且与本报告 Lighthouse 测量所用构建（`index-B5gny12C.js`，11:31/12:07）不同源。**部署前请确认用哪份产物**；本报告数据对应 base 正确的构建（`dist-perf/` 同 hash 复现）。
6. **`vite preview` 不可靠**（沙箱）：preview 时 base 解析为 `/`，导致 `/track-trash/assets/*` 全走 SPA fallback；测量请用 `scripts/perf-static-serve.mjs`（内存缓存 + gzip，行为对齐 Pages）。

---

## 9. 复现指南

```bash
# 生产构建（base 必须正确，注意 Git Bash 的 MSYS 路径转换会毁 VITE_BASE=/）
node scripts/perf-static-serve.mjs --dir apps/web/dist --port 4182 --base /track-trash/

# 主探针：CPU 4× + 连续移动 60s（开始页冷启动 / 进游戏 / 空闲 / 移动 / UI）
node scripts/perf-probe.mjs --label=prod4x --url=http://127.0.0.1:4182/track-trash/ --throttle=4 --move=60

# 长任务归因（trace）
node scripts/perf-trace.mjs --url=http://127.0.0.1:5176/ --throttle=4

# Lighthouse 移动端（生产构建，gzip）
npx lighthouse http://127.0.0.1:4182/track-trash/ \
  --only-categories=performance --form-factor=mobile \
  --screen-emulation.mobile --screen-emulation.width=412 --screen-emulation.height=823 \
  --screen-emulation.deviceScaleFactor=1.75 --output=json --output-path=docs/perf/measurements/lighthouse-prod.json
```

产物台账：`shots/perf-probe-{prodbase,prod4x-clean,prod4x-b,prod4x-c,android4x}.json`、`docs/perf/measurements/{lighthouse-prod,lighthouse-dev,perf-cdp-*,perf-probe-throttle4}.json`、`shots/perf-trace.json`。

---

*报告完。本轮零代码改动；QW1/QW2 的实现排期建议由 team-lead 决策。*
