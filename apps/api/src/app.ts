import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './env.js';
import { healthRoute } from './routes/health.js';
import { configRoute } from './routes/config.js';
import { savesRoute } from './routes/saves.js';

/**
 * 组装 Fastify 实例（不监听）。
 * 入口 `index.ts` 负责 listen，测试用 `app.inject()` 直接打路由，免起端口。
 */
export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? true });

  await app.register(cors, {
    // 留空则反射请求来源（开发期方便）；生产设 WEB_ORIGIN 限制域名。
    origin: env.WEB_ORIGIN ? env.WEB_ORIGIN.split(',').map((s) => s.trim()) : true,
  });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT,
    timeWindow: '1 minute',
  });

  app.get('/api', async () => ({ name: 'track-trash-api', version: env.APP_VERSION }));
  await app.register(healthRoute, { prefix: '/api' });
  // 探活别名：任务卡与多数 PaaS / 负载均衡约定的是根路径 /health
  await app.register(healthRoute);
  await app.register(configRoute, { prefix: '/api' });
  await app.register(savesRoute, { prefix: '/api' });

  return app;
}
