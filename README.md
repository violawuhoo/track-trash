# 好垃 · 荒诞星球合成

你迫降在一颗被前人开发过的废弃星球，和一台只剩嘴的损坏导航 AI 一起，
用捡来的破烂、抽象概念和外星垃圾合成一切。

搜索 +1 天，合成 +1 天。不会死，只会变老。

在线玩：<https://violawuhoo.github.io/track-trash/>

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
apps/web            前端：Vite + React + TypeScript + Zustand
apps/api            后端：Fastify + Drizzle（M4）
packages/game-core  规则内核：物品 / 配方 / 阶段 / 判定 / 搜索，纯函数，无 IO
docs/SPEC.md        实施规格
```

`game-core` 是前后端共用的同一份规则。它不碰 DOM、不碰网络、不碰 localStorage，
所以能脱离浏览器跑几万次模拟——改配方或阶段目标之前先跑一遍测试，就能知道会不会卡死。

## 玩法要点

- **物品不唯一**：同一件东西可以反复刷出，背包按数量堆叠
- **搜索硬保底**：当前步骤缺哪个标签，只要区域里有对应物品就必定刷出，不是概率
- **判定优先级**：阶段目标 > 精确配方 > 风险物品 > 意外配对 > 兜底，永远有产物
- **阶段目标按标签判定**：要「导电 + 粘」，扳手加胶带、电池加胶带都能过
- **强行起飞**：飞船三件套不齐也能试，一半机会

## 部署

前端：push 到 `main` 后 GitHub Actions 自动构建并发布到 Pages。
后端：Render + Neon（见 `docs/SPEC.md` 第 9 节）。

## 开发脚本

```bash
node scripts/shots.mjs    # 用本机 Chrome 截一遍关键界面到 shots/
```
