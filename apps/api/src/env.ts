import 'dotenv/config';

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** 是否使用 Postgres（生产 / Neon）。以 postgres:// 开头即切换驱动。 */
export const IS_POSTGRES = /^postgres/i.test(process.env.DATABASE_URL ?? '');

export const env = {
  PORT: num('PORT', 8787),
  HOST: str('HOST', '0.0.0.0'),
  /** 允许的前端域名，逗号分隔；留空则反射请求来源。 */
  WEB_ORIGIN: str('WEB_ORIGIN', ''),
  DATABASE_URL: str('DATABASE_URL', ''),
  SQLITE_FILE: str('SQLITE_FILE', 'data/saves.db'),
  RATE_LIMIT: num('RATE_LIMIT', 60),
  APP_VERSION: str('APP_VERSION', process.env.npm_package_version ?? '0.1.0'),
};
