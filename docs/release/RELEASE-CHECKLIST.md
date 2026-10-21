# 《好垃》v2 上线检查清单（RELEASE-CHECKLIST）

- **版本**：v2.0.0（开放世界改造首发）
- **基线 commit**：`5882d30`（本地 main 与 origin/main 一致）
- **清单建立日**：2026-10-21
- **当前门判定**：🔴 **NO-GO** —— 阻塞项 **B1（GitHub Pages 站点未创建）** 未清，见 §B。

---

## A. 构建与质量门（自动，已过 ✅）

| # | 检查项 | 命令 / 依据 | 结果 |
|---|---|---|---|
| A1 | game-core 规则测试 | CI run `39535864070`（5882d30）`Test rules` step | ✅ 绿（5 文件 / 60 用例，GitHub runner 无沙箱 EPERM，权威） |
| A2 | game-core typecheck | CI `Typecheck core` step | ✅ 绿 |
| A3 | web typecheck | CI `Typecheck web` step | ✅ 绿 |
| A4 | web 生产构建 | CI `Build web` step（`VITE_BASE=/track-trash/`） | ✅ 绿 |
| A5 | 内容校验（80 物品 / 36 配方，无孤立物品、每标签 ≥2 来源） | `node scripts/check-content.mjs` | ✅ 全部通过 |
| A6 | 资产校验（80 件物品形状齐全、互不撞脸、色值同源） | `node scripts/check-assets.mjs` | ✅ 全部通过 |
| A7 | api 测试 | `pnpm --filter @haola/api test` | ✅ 9/9 |
| A8 | 生产构建性能门（Lighthouse + 帧率，T10-R2 定稿） | LH 移动端 Performance **98**（FCP 1.77s / LCP 2.04s / TBT 53ms / CLS 0，412×823@1.75 + 模拟 4× CPU + 1.6Mbps）；首屏 JS gzip **158.6KB**（JS 154.2 + CSS 4.4）；CPU 4× 降速连续移动 60.87s 均 **59.6fps**（3629 帧）/ 掉帧 **0.4%**（15 帧 >33.3ms，0 帧 >100ms，最差帧 66.7ms）/ 主线程 35.2% / 场景长任务 3 个（63/80/50ms）；冷启动本机 4× FCP 912ms | ✅ **PASS**（阈值：LH ≥85 ✅、JS gz <250KB ✅、60fps 贴线 ✅、首屏 <2s ✅）。数据源：`docs/perf/PERF-REPORT-v2.md`（T10-R2 已定稿，prod4x-clean 轮）。遗留已定位优化：拾取瞬间背包全量重渲染触发整文档重排（trace 有证，下轮修）。**真机未测 = 残余风险**（4× 为 CPU 模拟，GL 走桌面 ANGLE/D3D11，真机 GPU/触屏/调度未覆盖），列发布后观察。口径固定为「生产构建 + 4× 降速」 |

> ⚠️ 本地沙箱注意：本机跑 `game-core test` 会因 `EPERM` 静默丢 `world.test.ts`（只收 4 文件 / 39 用例，退出码仍可能为 0 或 1）。**验收以 CI 为准**，本机数字不得作为发布依据（`docs/TASKS-v2.md` §0.5 坑 #2）。

> ⚠️ 性能验收只认**生产构建**：dev server 的 Lighthouse 分数因 64 个未打包请求严重失真（实测 35–55），不能当验收数；帧率统计还需按时间戳去重，Pixi 8 存在 `app.ticker` + `CanvasObserver` 的 `Ticker.shared` 两条每帧 rAF 链，不去重会把帧数翻倍（伪影 119.7fps）。

---

## B. Pages 启用（阻塞项，需用户手动 🔴）

| # | 检查项 | 状态 |
|---|---|---|
| B1 | GitHub Pages 站点已创建（Source = **GitHub Actions**） | 🔴 **未启用**。`GET /repos/violawuhoo/track-trash/pages` → 404；线上 `https://violawuhoo.github.io/track-trash/` → 404 "Site not found" |
| B2 | 手动启用步骤已执行：仓库页 **Settings → Pages → Build and deployment → Source: GitHub Actions → Save** | ⬜ 待用户操作 |
| B3 | 启用后 Deploy Web 全链路绿 | ⬜ 待验证 |
| B4 | 部署产物唯一来源 = CI | `deploy-web.yml` 的 Build web step 硬编码 `VITE_BASE: /track-trash/`，且 `apps/web/vite.config.ts` 构建默认 base 同为 `/track-trash/`（env 丢失也不丢 base，双保险），Actions 产物是唯一合法部署源。**本地 `apps/web/dist` 与 `apps/web/dist-perf/` 均不是部署源**：本地 dist 刚被发现于 12:02 被外部重建为无 base 前缀版本（`index-IwNPd2WD.js`，`src="/assets/..."`，已作废，**勿手动部署**）；`dist-perf/` 为测量专用构建，同样不用于发布 |

**为什么 workflow 修不好自己**：`deploy-web.yml` 里 `configure-pages@v5` 带了 `enablement: true`，本意是「Pages 没开就自动创建」。实测（run `39535863980`，step 8）它先 `GET /pages` 得到 Not Found，再 `POST /pages` 创建时被 GitHub 拒绝：

```
##[warning]Get Pages site failed. Error: Not Found
##[error]Create Pages site failed. Error: Resource not accessible by integration
##[error]HttpError: Resource not accessible by integration
```

`Resource not accessible by integration` = GITHUB_TOKEN（即使有 `pages: write`）无权创建 Pages 站点，这是 GitHub 平台限制，不是配置笔误。**结论：B1 必须用户在网页 Settings 里点一次，任何 workflow 改动都替代不了。**（`enablement: true` 保留无害：站点经手动启用后，GET 会成功，不会再尝试 POST。）

---

## C. 部署后验证（B1 完成后执行）

| # | 检查项 | 方法 | 通过标准 |
|---|---|---|---|
| C0 | 线上产物 base 校验（防白屏，政策见 B4） | 部署完成后查看线上 `index.html` 源码 | 资源引用必须是 `/track-trash/assets/...`；若为 `/assets/...` 立即按 G 组回滚重部署。判识规则：`vite.config.ts` 构建默认 base 即 `/track-trash/`，任何本地产物若引用 `/assets/...`，必为显式 `VITE_BASE=/` 的构建（本地测量或自定义域名场景），对本仓库 Pages 部署即为误部署 |
| C1 | 启用 Pages 后触发一次部署 | Actions 页手动 **Re-run jobs** 任一失败的 Deploy Web run（如 `39535863980`），或 push 任意触发 `apps/web/**` 的 commit | build + deploy 两 job 全绿 |
| C2 | 首页可访问 | 浏览器开 `https://violawuhoo.github.io/track-trash/` | 200，出现开始页，不再是 404 |
| C3 | 刷新不 404 | 在游戏界面按 F5 / 手机端下拉刷新 | 仍返回 200（SPA 单入口，无子路由） |
| C4 | 部署 URL 与 README 一致 | 对照 README「在线玩」链接 | 一致 |
| C5 | 静态资源加载 | DevTools Network 无 404（js/css/字体/纹理） | 无红色失败请求 |

---

## D. 离线可玩冒烟（硬约束）

| # | 检查项 | 方法 | 通过标准 |
|---|---|---|---|
| D1 | 断网可完整通关 | DevTools → Offline → 刷新页面 → 从开始页走到结局 | 全流程可玩（云存档失败静默降级，不弹错、不卡界面） |
| D2 | 云存档降级路径 | Offline 状态下游玩 10 分钟，恢复网络 | 无 UI 阻塞；恢复后本地进度仍在 |
| D3 | 存档持久化 | 玩到第 2 天，刷新页面 | 进度保留（localStorage `haola.save.v2`） |
| D4 | 移动端viewport | 375×667 打开 | 无横向滚动，可点元素 ≥44×44 |

---

## E. 线上链接有效性

| # | 链接 | 状态 |
|---|---|---|
| E1 | README「在线玩」→ `https://violawuhoo.github.io/track-trash/` | 🔴 当前 404（随 B1 修复后复验 C2） |
| E2 | 仓库 Actions 页 Deploy Web 最近一次 run | 当前全失败（configure-pages step），修复后复验 C1 |

---

## F. 存档兼容

| # | 检查项 | 结论 |
|---|---|---|
| F1 | 存档 schema | web 存档 `haola.save.v2`，`SAVE_SCHEMA = 2`（`apps/web/src/store/gameStore.ts`）；game-core 内部 `SCHEMA_VERSION = 1` 不变 |
| F2 | v1 老存档迁移 | **不做迁移**（契约 §3.1）：`schemaVersion !== 2` 直接 `return null` 重开。**无实际影响**——v1 的 Pages 站点从未启用过，不存在线上玩家；只有本机测试档会重开 |
| F3 | 物品 id 兼容 | T6 只新增 id、不改已有 id 语义，老档物品不坏 |

---

## G. 回滚预案

| # | 场景 | 动作 |
|---|---|---|
| G1 | 上线后发现渲染/交互级 blocker | 本地 `git revert` 或回退到上一个已知良好 commit → push main → Deploy Web 自动重部署（站点已在，几分钟生效） |
| G2 | 热修 | 走简化流程：修完直接 push main，保留完整 commit message 审计；**不做**时无需回滚 |
| G3 | 完全下线 | Settings → Pages → Source 改回 "Deploy from a branch" 或停用（用户手动，我不代操作） |

> 回滚/热修属高影响动作，**须用户明确批准后执行**；本清单只预演，不自动触发。

---

## H. Go / No-Go 记录

| 时间 | 判定 | 说明 |
|---|---|---|
| 2026-10-21 | 🔴 **NO-GO** | B1 未清：Pages 站点未创建，Deploy Web 8 连败于 configure-pages（GITHUB_TOKEN 403）。A 组质量门全绿（含 A8 性能门 T10-R2 定稿 PASS）。 |

**放行条件**：B1 → B2 → B3 完成后，C/D/E 全过，即可改判 GO。
