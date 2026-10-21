import { defineConfig } from 'drizzle-kit';

// 本地用 SQLite；生产用 Postgres（Neon）。T10 部署时通过环境变量切换。
// 用法：pnpm --filter @haola/api db:push
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.SQLITE_FILE || 'data/saves.db',
  },
});
