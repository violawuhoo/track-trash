import { createHash } from 'node:crypto';
import { ITEMS, RECIPES, STAGES, DIALOGUE } from '@haola/game-core';

/**
 * /api/config 的内容包。SPEC §8：返回 game-core 编译出的常量 + 构建时哈希。
 * 配置不进数据库——改物品/配方/台词不用重新发版，前端比对 version/ETag 即可。
 *
 * 注意：前端离线优先，始终用打包进来的 @haola/game-core（保证断网可玩）。
 * 此接口仅作服务端合规 + 健康检查；本版前端不运行时热替换内容（见 T8 设计确认）。
 */
export interface ConfigPayload {
  version: string;
  items: typeof ITEMS;
  recipes: typeof RECIPES;
  stages: typeof STAGES;
  dialogue: typeof DIALOGUE;
}

let cached: ConfigPayload | null = null;

export function getConfig(): ConfigPayload {
  if (cached) return cached;
  const payload = {
    items: ITEMS,
    recipes: RECIPES,
    stages: STAGES,
    dialogue: DIALOGUE,
  };
  const version = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 12);
  cached = { version, ...payload };
  return cached;
}
