import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

/**
 * 生产 Postgres(Neon) 存档表（SPEC §8.2 原版）。
 * 仅在 DATABASE_URL 以 postgres:// 开头时启用（T10 部署阶段接线）。
 * 建表由 drizzle-kit 迁移负责，这里只定义结构。
 */
export const savesPg = pgTable('saves', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  deviceId: text('device_id').notNull().unique(),
  state: text('state').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  progressScore: integer('progress_score').notNull(),
  day: integer('day').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
