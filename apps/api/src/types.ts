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
  })
  .passthrough();

/** PUT /api/saves/me 请求体。progressScore / clientUpdatedAt 由服务端重算，客户端值仅作兼容。 */
export const PutSaveSchema = z.object({
  state: SaveStateSchema,
  schemaVersion: z.number().optional(),
  progressScore: z.number().optional(),
  clientUpdatedAt: z.string().optional(),
});
