import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';

/**
 * 本地 SQLite 存档表（SPEC §8.2 的 SQLite 形态）。
 * state 用 TEXT 存 JSON（SQLite 没有 jsonb；生产 Postgres 用 schema.pg.ts 的 jsonb）。
 */
export const saves = sqliteTable('saves', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  deviceId: text('device_id').notNull().unique(),
  state: text('state').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  progressScore: integer('progress_score').notNull(),
  day: integer('day').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type SaveRow = typeof saves.$inferSelect;
