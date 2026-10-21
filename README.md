# 好垃 · 荒诞星球合成

你迫降在一颗被前人开发过的废弃星球，和一台只剩嘴的损坏导航 AI 一起，
用捡来的破烂、抽象概念和外星垃圾合成一切。

搜索 +1 天，合成 +1 天。不会死，只会变老。

在线玩：<https://violawuhoo.github.io/track-trash/>

> 站点尚未启用时会看到 GitHub 的 404 页。启用步骤见下方「部署」；排查记录见 `docs/release/RELEASE-CHECKLIST.md`。

## 怎么玩

1. 打开网页，点开始。前 90 秒有引导提示，跟着做就行（读档的老玩家自动跳过）。
2. **点地面移动**（电脑上也可以 WASD / 方向键）。星球是圆的，走到边缘会停住，不做水平回绕。
3. 走近散落的贴纸物件会**自动拾取**，不用点。当前阶段缺什么，星球上就必定能捡到什么。
4. 打开背包（HUD 右上角），双槽合成：点两件东西，看能折腾出什么。
5. 跟着 HUD 的阶段目标走。未解锁的区域有雾障，走进去会被弹回——完成当前阶段再回来。
6. **合成 +1 天，拾取不推进时间**。逛多久都行，没有倒计时。
7. 飞船三件套不齐也能强行起飞，一半机会。

## 本地启动

需要 Node 20+ 与 pnpm 9。

```bash
pnpm install
pnpm --filter @haola/web dev      # http://127.0.0.1:5173
```

跑规则测试：

```bash
pnpm --filter @haola/game-core test
```

## 结构

```
apps/web            前端：Vite + React + TypeScript + Zustand + PixiJS 8 世界层
apps/api            后端：Fastify + Drizzle（云存档，已实现，前端断网可脱离它玩）
packages/game-core  规则内核：物品 / 配方 / 阶段 / 判定 / 世界分布，纯函数，无 IO
docs/SPEC.md        实施规格
```

`game-core` 是前后端共用的同一份规则。它不碰 DOM、不碰网络、不碰 localStorage，
所以能脱离浏览器跑几万次模拟——改配方或阶段目标之前先跑一遍测试，就能知道会不会卡死。

## 玩法要点

- **物品不唯一**：同一件东西可以反复刷出，背包按数量堆叠
- **地面硬保底**：当前步骤缺哪个标签，星球上就必定有对应物品的地面点，走过去就能捡到，不是概率
- **判定优先级**：阶段目标 > 支线 > 精确配方 > 风险物品 > 意外配对 > 兜底，永远有产物
- **阶段目标按标签判定**：要「导电 + 粘」，扳手加胶带、电池加胶带都能过
- **强行起飞**：飞船三件套不齐也能试，一半机会
- **时间**：合成 +1 天，拾取不推进

## 部署

前端：push 到 `main` 后 GitHub Actions 自动构建并发布到 Pages。
后端：Render + Neon（见 `docs/SPEC.md` 第 9 节）。

**首次上线（一次性，必须手动做）**：

1. 仓库页 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**，保存。
2. 到 Actions 页把最近一次失败的 *Deploy Web* run **Re-run jobs**（或 push 任意触及 `apps/web/**` 的 commit）。
3. 等 build + deploy 两段全绿，开 `https://violawuhoo.github.io/track-trash/` 验证，刷新不 404。

为什么必须手动：`deploy-web.yml` 里的 `configure-pages` 虽然带了 `enablement: true`，但 GITHUB_TOKEN 无权创建 Pages 站点（`Resource not accessible by integration`），这是 GitHub 平台限制。站点经上面第 1 步创建后，自动部署链路即可正常工作。完整清单与回滚预案见 `docs/release/RELEASE-CHECKLIST.md`。

## 开发脚本

```bash
node scripts/shots.mjs    # 用本机 Chrome 截一遍关键界面到 shots/
```
