import type { FastifyPluginAsync } from 'fastify';
import { getConfig } from '../lib/configPayload.js';

export const configRoute: FastifyPluginAsync = async (app) => {
  app.get('/config', async (req, reply) => {
    const cfg = getConfig();
    reply.header('Cache-Control', 'public, max-age=300');
    reply.header('ETag', `"${cfg.version}"`);
    if (req.headers['if-none-match'] === `"${cfg.version}"`) {
      return reply.code(304).send();
    }
    return reply.send(cfg);
  });
};
