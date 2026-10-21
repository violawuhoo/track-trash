import { z } from 'zod';

/**
 * v2 存档结构校验（与前端 SaveStateV2 对齐）。
 * 宽松校验：只卡关键字段形状，物品/日志内部结构放行（避免与 game-core 强耦合）。
 */
export const SaveStateSchema = z
  .object({
    schemaVersion: z.number(),
    day: z.number(),
    bag: z.record(z.string(), z.number()),
    discovered: z.record(z.string(), z.boolean()),
    stage: z.number(),
    stepIndex: z.number(),
    branches: z.object({
      ship: z.boolean(),
      teashop: z.boolean(),
      birthday: z.boolean(),
      // 第四支线「留下来」（A2）。可选：老存档没有这个键，别让老档传不上去。
      stay: z.boolean().optional(),
    }),
    keepsakes: z.array(z.string()),
    accidents: z.number(),
    log: z.array(z.any()),
    ending: z.union([z.string(), z.null()]),
    launchAttempts: z.number(),
    launchFailures: z.number(),
    world: z.array(
      z.object({
        uid: z.string(),
        id: z.string(),
        x: z.number(),
        y: z.number(),
      }),
    ),
    tutorial: z
      .object({ step: z.string(), picks: z.number() })
      .optional(),
    // C1 批次：累计合成次数 + 已获得的前任日志 id 集合。
    // 可选：老存档没有这两个键，别让老档传不上去。
    crafts: z.number().optional(),
    logsFound: z.array(z.string()).optional(),
    // C2 批次：二周目档案容器（cycle / endings / readLogs / branchesHistory）。
    //
    // 两种形态都要放行：
    // - 对象形态：C2 之后的存档
    // - 布尔形态：A2 落的语义位（老存档）
    //
    // 归一化在 web 端做（`normalizeNgPlus`），服务端只做形状校验，别把两种形态拒掉。
    ngPlus: z
      .union([
        z.object({
          cycle: z.number().optional(),
          endings: z.array(z.string()).optional(),
          readLogs: z.array(z.string()).optional(),
          branchesHistory: z.array(z.string()).optional(),
        }),
        z.boolean(),
      ])
      .optional(),
  })
  .passthrough();

/** PUT /api/saves/me 请求体。progressScore / clientUpdatedAt 由服务端重算，客户端值仅作兼容。 */
export const PutSaveSchema = z.object({
  state: SaveStateSchema,
  schemaVersion: z.number().optional(),
  progressScore: z.number().optional(),
  clientUpdatedAt: z.string().optional(),
});
