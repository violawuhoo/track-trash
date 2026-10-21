import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';

// 测试库落在临时目录，用完删；必须在 import app 之前设好（env 在模块求值时读取）
const tmp = mkdtempSync(join(tmpdir(), 'haola-api-test-'));
process.env.SQLITE_FILE = join(tmp, 'saves.db');
process.env.RATE_LIMIT = '10000';
process.env.WEB_ORIGIN = '';

import { buildApp } from '../src/app.js';
import { closeDb } from '../src/db/client.js';
const { computeProgressScore } = await import('../src/lib/progress.js');
const { parseDeviceId } = await import('../src/lib/device.js');

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  // 先关连接再删临时目录：Windows 上句柄未释放会 EBUSY
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/** 最小合法 v2 存档 */
function state(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    day: 3,
    bag: { tape: 2 },
    discovered: { tape: true },
    stage: 1,
    stepIndex: 0,
    branches: { ship: false, teashop: false, birthday: false },
    keepsakes: [],
    accidents: 0,
    log: [{ day: 1, kind: '系统', text: 'x' }],
    ending: null,
    launchAttempts: 0,
    launchFailures: 0,
    world: [{ uid: 'w1', id: 'tape', x: 100, y: 100 }],
    tutorial: { step: 'free', picks: 0 },
    ...over,
  };
}

describe('进度评分（SPEC §8.1）', () => {
  it('按 stage/stepIndex/branches/day 加权求和', () => {
    expect(
      computeProgressScore({
        stage: 1,
        stepIndex: 0,
        branches: { ship: false, teashop: false, birthday: false },
        day: 3,
      }),
    ).toBe(10003);
    expect(
      computeProgressScore({
        stage: 2,
        stepIndex: 1,
        branches: { ship: true, teashop: false, birthday: true },
        day: 9,
      }),
    ).toBe(20000 + 1000 + 400 + 9);
  });
});

describe('设备 ID 解析', () => {
  it('接受合法 UUID，拒绝缺失/非 UUID', () => {
    const req = (headers: Record<string, string>) =>
      ({ headers } as Parameters<typeof parseDeviceId>[0]);
    const id = randomUUID();
    expect(parseDeviceId(req({ 'x-device-id': id }))).toBe(id);
    expect(parseDeviceId(req({}))).toBeNull();
    expect(parseDeviceId(req({ 'x-device-id': 'not-a-uuid' }))).toBeNull();
    expect(parseDeviceId(req({ 'x-device-id': '' }))).toBeNull();
  });
});

describe('探活与配置下发', () => {
  it('GET /health 与 /api/health 等价', async () => {
    for (const url of ['/health', '/api/health']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    }
  });

  it('GET /api/config 带 ETag，命中 If-None-Match 返回 304', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/config' });
    expect(first.statusCode).toBe(200);
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();
    const body = first.json();
    expect(body).toHaveProperty('version');
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.recipes.length).toBeGreaterThan(0);
    expect(body.stages.length).toBe(3);

    const second = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: { 'if-none-match': etag },
    });
    expect(second.statusCode).toBe(304);
  });
});

describe('云存档 /api/saves/me', () => {
  it('缺设备头 / 非法设备 ID / 非法请求体 一律 400', async () => {
    const noHeader = await app.inject({ method: 'PUT', url: '/api/saves/me', payload: { state: state() } });
    expect(noHeader.statusCode).toBe(400);

    const badId = await app.inject({
      method: 'PUT',
      url: '/api/saves/me',
      headers: { 'x-device-id': 'nope' },
      payload: { state: state() },
    });
    expect(badId.statusCode).toBe(400);

    const badBody = await app.inject({
      method: 'PUT',
      url: '/api/saves/me',
      headers: { 'x-device-id': randomUUID() },
      payload: { state: { day: 3 } },
    });
    expect(badBody.statusCode).toBe(400);
    expect(badBody.json()).toHaveProperty('error', 'invalid body');
  });

  it('PUT 建库 → GET 取回，进度分由服务端重算', async () => {
    const id = randomUUID();
    const put = await app.inject({
      method: 'PUT',
      url: '/api/saves/me',
      headers: { 'x-device-id': id },
      // 客户端谎报一个高分，服务端必须无视
      payload: { state: state(), progressScore: 999999 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().progressScore).toBe(10003);

    const get = await app.inject({ method: 'GET', url: '/api/saves/me', headers: { 'x-device-id': id } });
    expect(get.statusCode).toBe(200);
    expect(get.json().state.day).toBe(3);
    expect(get.json().progressScore).toBe(10003);
  });

  it('低分 PUT 不覆盖云端，高分 PUT 覆盖', async () => {
    const id = randomUUID();
    const headers = { 'x-device-id': id };

    await app.inject({ method: 'PUT', url: '/api/saves/me', headers, payload: { state: state({ day: 5 }) } });
    const lower = await app.inject({
      method: 'PUT',
      url: '/api/saves/me',
      headers,
      payload: { state: state({ day: 2 }) },
    });
    expect(lower.json().state.day).toBe(5);

    const higher = await app.inject({
      method: 'PUT',
      url: '/api/saves/me',
      headers,
      payload: { state: state({ day: 9, stage: 2 }) },
    });
    expect(higher.statusCode).toBe(200);
    expect(higher.json().state.stage).toBe(2);
    expect(higher.json().progressScore).toBe(20009);
  });

  it('DELETE 清档，之后 GET 返回 404', async () => {
    const id = randomUUID();
    const headers = { 'x-device-id': id };
    await app.inject({ method: 'PUT', url: '/api/saves/me', headers, payload: { state: state() } });

    const del = await app.inject({ method: 'DELETE', url: '/api/saves/me', headers });
    expect(del.statusCode).toBe(204);

    const get = await app.inject({ method: 'GET', url: '/api/saves/me', headers });
    expect(get.statusCode).toBe(404);
  });

  it('不同设备 ID 的存档互相隔离', async () => {
    const a = { 'x-device-id': randomUUID() };
    const b = { 'x-device-id': randomUUID() };
    await app.inject({ method: 'PUT', url: '/api/saves/me', headers: a, payload: { state: state({ day: 7 }) } });
    const resB = await app.inject({ method: 'GET', url: '/api/saves/me', headers: b });
    expect(resB.statusCode).toBe(404);
  });
});
