# @haola/api —— 配置下发 + 匿名云存档

《好垃》后端。Fastify 4 + Drizzle ORM；本地 SQLite，生产 Postgres（Neon）。
**定位：前端永远离线可玩，后端只是增强。** 所有接口失败时前端静默降级。

## 跑起来

```bash
# 仓库根
pnpm install
cd apps/api
cp .env.example .env      # 本地不改也能跑
pnpm dev                  # 默认 http://127.0.0.1:8787
```

前端（`apps/web`）在 dev 下把 `/api` 代理到这里（`VITE_API_PROXY_TARGET` 可改目标）。
所以本地要一起跑：

```bash
cd apps/web && ./node_modules/.bin/vite --port 5176
cd apps/api && PORT=8799 pnpm dev          # 与 vite 默认代理端口对齐
```

生产构建时用 `VITE_API_BASE` 指向真实后端绝对地址（如 `https://api.example.com/api`）。

## 接口（严格按 `docs/SPEC.md` §8）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health`、`/api/health` | 探活：`{ ok, version, uptime }`。两个路径等价，前者给 PaaS 探针用 |
| GET | `/api/config` | 内容包 `{ version, items, recipes, stages, dialogue }`，带 `ETag` + `Cache-Control: max-age=300`；`If-None-Match` 命中返回 304 |
| GET | `/api/saves/me` | 按 `X-Device-Id` 取存档；无档 404 |
| PUT | `/api/saves/me` | 上传存档，服务端裁决冲突后返回最终存档 |
| DELETE | `/api/saves/me` | 清空云端存档，204 |

**鉴权**：`X-Device-Id` 请求头，前端 `crypto.randomUUID()` 生成后存 localStorage，须为合法 UUID，否则 400。没有账号体系（单机定位）。

### 冲突裁决（SPEC §8.1）

`progressScore = stage*10000 + stepIndex*1000 + branchesDone*200 + day`

服务端从收到的 `state` **自己重算**，不信任客户端传的分。分数高者胜；分数相等时比较 `clientUpdatedAt` 与库里的 `updated_at`，新者胜。

### 非法输入

全部走 zod 校验，返回 400（`{ error, detail }`），不会 500。

### 与任务卡 T8 的差异（以 SPEC 为准）

- 卡片写 `POST /api/save` + `GET /api/save/:deviceId`；SPEC §8 是 `GET/PUT/DELETE /api/saves/me`。**按 SPEC 实现**（项目铁律：冲突以 SPEC 为准），设备 ID 走头部而非路径，避免设备 ID 出现在 URL 和日志里。
- 卡片有 `POST /api/telemetry`，SPEC 未列，**本轮未实现**（已与用户确认）。

## 数据库

`saves` 表（`src/db/schema.ts` SQLite / `schema.pg.ts` Postgres，字段一致）：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | uuid |
| `device_id` | text UNIQUE | 设备标识 |
| `state` | text/jsonb | 存档 JSON，**服务端不解析业务语义** |
| `schema_version` | int | 存档结构版本 |
| `progress_score` | int | 服务端算出的进度分 |
| `day` | int | 冗余字段，便于排查 |
| `created_at` / `updated_at` | text/timestamptz | |

本地 SQLite 用幂等 `CREATE TABLE IF NOT EXISTS` 建表（无需迁移）；
生产 Postgres 用 `pnpm db:push`（drizzle-kit）同步 schema。

## 前端接入（`apps/web/src/lib/cloud.ts`）

- 启动时 `GET` 拉一次，**只在开始页**采纳远端（防止覆盖正在进行的游戏），`progressScore` 高者胜。
- 五次持久化动作后防抖 1.5s `PUT`（`queuePush`），不阻塞交互。
- 开始页「重新开始」与结局页「重开」都会清掉云端档，否则「高分不败」规则会让旧档复活。
- 网络/超时（8s）/离线：全部静默吞掉，bundle 内的 `@haola/game-core` 是唯一规则来源，**运行时不热替换服务端配置**。

## 验收

```bash
# 需要 API + web dev server 同时在跑
node scripts/t8-shots.mjs http://127.0.0.1:5176/ http://127.0.0.1:8799/api
```

覆盖：推送落地、换设备拉回、云端高分采纳、断网可玩、重新开始不复活旧档。当前 19/19 通过。
