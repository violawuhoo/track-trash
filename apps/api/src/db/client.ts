import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env, IS_POSTGRES } from '../env.js';
import { saves as sqliteSaves } from './schema.js';

/**
 * 数据库客户端。
 * - 本地（默认）：better-sqlite3，建表语句幂等，无需迁移。
 * - 生产（DATABASE_URL=postgres://...）：切换到 postgres-js + Neon（T10 部署接线）。
 *
 * 两个分支的表结构、仓储逻辑完全一致（见 routes/saves.ts），
 * 差异只在列类型（TEXT vs timestamptz）。顶层 await 初始化后导出统一的 db / saves。
 */
/** SQLite 连接句柄，供 closeDb 关停（Postgres 分支下为 null） */
let sqliteRef: Database.Database | null = null;

async function init(): Promise<{ db: unknown; saves: unknown }> {
  if (IS_POSTGRES) {
    const { initPostgres } = await import('./postgres.js');
    return initPostgres(env.DATABASE_URL);
  }

  mkdirSync(dirname(env.SQLITE_FILE), { recursive: true });
  const sqlite = new Database(env.SQLITE_FILE);
  sqliteRef = sqlite;
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS saves (
      id             TEXT PRIMARY KEY,
      device_id      TEXT NOT NULL UNIQUE,
      state          TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      progress_score INTEGER NOT NULL,
      day            INTEGER NOT NULL,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
  `);
  return {
    db: drizzle(sqlite, { schema: { saves: sqliteSaves } }),
    saves: sqliteSaves,
  };
}

const client = await init();
export const db = client.db as any;
export const saves = client.saves as any;

/**
 * 关掉数据库连接。测试收尾与优雅停机用；
 * 不关的话 Windows 上 SQLite 文件句柄还占着，临时目录删不掉。
 */
export function closeDb(): void {
  if (sqliteRef && sqliteRef.open) sqliteRef.close();
  sqliteRef = null;
}
