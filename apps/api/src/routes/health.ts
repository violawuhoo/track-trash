import type { FastifyPluginAsync } from 'fastify';
import { env } from '../env.js';

const startedAt = Date.now();

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    ok: true,
    version: env.APP_VERSION,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  }));
};
