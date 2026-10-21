import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, saves } from '../db/client.js';
import { PutSaveSchema } from '../types.js';
import { parseDeviceId } from '../lib/device.js';
import { computeProgressScore } from '../lib/progress.js';

/**
 * /api/saves/me —— 匿名云存档（SPEC §8）。
 * 设备 ID 取自 X-Device-Id 头；不做账号、不加密。
 * 冲突规则：progressScore 大者胜；相等取 updatedAt 新者（见 §8.1）。
 */
export const savesRoute: FastifyPluginAsync = async (app) => {
  app.get('/saves/me', async (req, reply) => {
    const deviceId = parseDeviceId(req);
    if (!deviceId) {
      return reply.code(400).send({ error: 'missing or invalid X-Device-Id' });
    }
    const [row] = await db
      .select()
      .from(saves)
      .where(eq(saves.deviceId, deviceId))
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'no save' });
    return reply.send({
      state: JSON.parse(row.state),
      schemaVersion: row.schemaVersion,
      progressScore: row.progressScore,
      updatedAt: row.updatedAt,
    });
  });

  app.put('/saves/me', async (req, reply) => {
    const deviceId = parseDeviceId(req);
    if (!deviceId) {
      return reply.code(400).send({ error: 'missing or invalid X-Device-Id' });
    }
    const parsed = PutSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid body', detail: parsed.error.issues });
    }

    const { state } = parsed.data;
    // 服务端权威重算进度分，不信任客户端传值。
    const score = computeProgressScore(state);
    const now = new Date().toISOString();
    const payload = {
      state: JSON.stringify(state),
      schemaVersion: state.schemaVersion,
      progressScore: score,
      day: state.day,
      updatedAt: now,
    };

    const [existing] = await db
      .select()
      .from(saves)
      .where(eq(saves.deviceId, deviceId))
      .limit(1);

    // 没有存档：直接插入。
    if (!existing) {
      await db.insert(saves).values({
        id: randomUUID(),
        deviceId,
        ...payload,
        createdAt: now,
      });
      return reply.send({ state, schemaVersion: state.schemaVersion, progressScore: score, updatedAt: now });
    }

    // 有存档：按冲突规则裁决。
    let winnerState = JSON.parse(existing.state);
    let winner = existing;
    const clientUpdatedAt = parsed.data.clientUpdatedAt;

    if (score > existing.progressScore) {
      // 云端落后，用本地覆盖。
      await db.update(saves).set(payload).where(eq(saves.deviceId, deviceId));
      winnerState = state;
      winner = { ...existing, ...payload };
    } else if (
      score === existing.progressScore &&
      clientUpdatedAt &&
      clientUpdatedAt > existing.updatedAt
    ) {
      // 分数相等，本地更新时间更新 → 用本地覆盖。
      await db.update(saves).set(payload).where(eq(saves.deviceId, deviceId));
      winnerState = state;
      winner = { ...existing, ...payload };
    }
    // 否则保留云端（客户端应采纳服务端返回的存档）。

    return reply.send({
      state: winnerState,
      schemaVersion: winner.schemaVersion,
      progressScore: winner.progressScore,
      updatedAt: winner.updatedAt,
    });
  });

  app.delete('/saves/me', async (req, reply) => {
    const deviceId = parseDeviceId(req);
    if (!deviceId) {
      return reply.code(400).send({ error: 'missing or invalid X-Device-Id' });
    }
    await db.delete(saves).where(eq(saves.deviceId, deviceId));
    return reply.code(204).send();
  });
};
