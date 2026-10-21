import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { savesPg } from './schema.pg.js';

/**
 * 生产环境：用 postgres-js 连接 Neon。
 * 本地不跑这条路径（没有 Postgres 实例）；T10 部署阶段负责迁移与连接串注入。
 */
export function initPostgres(url: string) {
  const sql = postgres(url, { prepare: false });
  const db = drizzle(sql, { schema: { saves: savesPg } });
  return { db, saves: savesPg };
}
