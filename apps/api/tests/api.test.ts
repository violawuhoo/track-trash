import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';

// 测试库落在临时目录，用完删。
//
// ⚠️ **必须用动态 import**（2026 复审发现，原先这里是静态 import）：
// ESM 的静态 `import` 会被**提升到模块 body 之前**求值。
// `../src/app.js` → `db/client.js` → `env.js` 这条链在下面这行
// `process.env.SQLITE_FILE = ...` **执行之前**就已经求值完了 ——
// `env.SQLITE_FILE` 拿到的是 fallback `'data/saves.db'`，
// 于是测试库落进仓库（`apps/api/data/saves.db`），污染工作区，
// 而且两次运行共用同一个库。
// 改成 `await import(...)` 后，env 设置一定先于模块求值。
const tmp = mkdtempSync(join(tmpdir(), 'haola-api-test-'));
process.env.SQLITE_FILE = join(tmp, 'saves.db');
process.env.RATE_LIMIT = '10000';
process.env.WEB_ORIGIN = '';

// 动态 import（见上）：必须在 env 设置之后求值。
const { buildApp } = await import('../src/app.js');
const { closeDb } = await import('../src/db/client.js');
import { progressScoreOf as coreProgressScoreOf } from '@haola/game-core';
// web 侧的评分封装。跨包 import 只为了断言「两端必然同数」——
// web / api 都是 core 那一份纯函数的薄封装，任何一端手抄公式都会在这里对不上。
const { progressScoreOf: webProgressScoreOf } = await import('../../web/src/lib/cloud.js');
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

describe('进度评分（SPEC §8.1 · C2 公式下沉到 core）', () => {
  it('按 cycle/stage/stepIndex/branches/day 加权求和', () => {
    // ⚠️ C2 批次：公式加了周目数权重（cycle * 1e6）。
    // 一周目 = 1 * 1e6 + 10000 + 0 + 0 + 3
    expect(
      computeProgressScore({
        stage: 1,
        stepIndex: 0,
        branches: { ship: false, teashop: false, birthday: false },
        day: 3,
      }),
    ).toBe(1_000_000 + 10000 + 0 + 0 + 3);
    // stage 2 / stepIndex 1 / 两条支线 / day 9
    expect(
      computeProgressScore({
        stage: 2,
        stepIndex: 1,
        branches: { ship: true, teashop: false, birthday: true },
        day: 9,
      }),
    ).toBe(1_000_000 + 20000 + 1000 + 400 + 9);
  });

  it('二周目的分数必赢一周目（云端「高分不败」不会把二周目覆盖回去）', () => {
    const base = {
      stage: 3,
      stepIndex: 2,
      branches: { ship: true, teashop: true, birthday: true, stay: true },
      day: 80,
    };
    const w1 = computeProgressScore({ ...base, ngPlus: { cycle: 1 } });
    const w2 = computeProgressScore({ ...base, ngPlus: { cycle: 2 } });
    expect(w2 - w1).toBe(1_000_000);
    expect(w2).toBeGreaterThan(w1);
    // 二周目即使完全归零，也赢过一周目的最好成绩
    const week1Best = computeProgressScore({
      stage: 3,
      stepIndex: 3,
      branches: { ship: true, teashop: true, birthday: true, stay: true },
      day: 999,
      ngPlus: { cycle: 1 },
    });
    const week2Floor = computeProgressScore({
      stage: 1,
      stepIndex: 0,
      branches: { ship: false, teashop: false, birthday: false, stay: false },
      day: 1,
      ngPlus: { cycle: 2 },
    });
    expect(week2Floor).toBeGreaterThan(week1Best);
  });

  it('老存档兼容：ngPlus 缺失 / 布尔 / cycle 缺失都不崩（按 cycle=1 算）', () => {
    const expected = 1_000_000 + 10000 + 0 + 0 + 3;
    const input = {
      stage: 1,
      stepIndex: 0,
      branches: { ship: false, teashop: false, birthday: false },
      day: 3,
    };
    expect(computeProgressScore(input)).toBe(expected);
    expect(computeProgressScore({ ...input, ngPlus: undefined })).toBe(expected);
    expect(computeProgressScore({ ...input, ngPlus: false })).toBe(expected);
    expect(computeProgressScore({ ...input, ngPlus: {} })).toBe(expected);
    // 布尔 true = A2 的「二周目已解锁」语义位 → cycle = 2
    expect(computeProgressScore({ ...input, ngPlus: true })).toBe(expected + 1_000_000);
  });

  it('stay 支线计分：差正好 200', () => {
    const input = {
      stage: 3,
      stepIndex: 0,
      day: 20,
      ngPlus: { cycle: 1 },
    };
    const three = computeProgressScore({
      ...input,
      branches: { ship: true, teashop: true, birthday: true, stay: false },
    });
    const four = computeProgressScore({
      ...input,
      branches: { ship: true, teashop: true, birthday: true, stay: true },
    });
    expect(four - three).toBe(200);
  });

  it('跨端一致性：api 侧与 web 侧对同一组输入返回同一个数', () => {
    // web 的 `progressScoreOf` 与 api 的 `computeProgressScore` 都是
    // `packages/game-core/src/progress.ts` 的薄封装 —— 只有一份实现，跨端必然一致。
    // 这里同时比「api 的封装」「web 的封装」「core 的原函数」三份，
    // 任何一端要是偷偷手抄了公式，这里就对不上。
    const cases = [
      { stage: 1, stepIndex: 0, day: 3, cycle: 1 },
      { stage: 2, stepIndex: 1, day: 9, cycle: 2 },
      { stage: 3, stepIndex: 3, day: 120, cycle: 7 },
    ];
    const branches = { ship: true, teashop: false, birthday: true, stay: true };
    for (const c of cases) {
      const expected = coreProgressScoreOf({ ...c, branches });
      expect(computeProgressScore({ ...c, ngPlus: { cycle: c.cycle }, branches })).toBe(expected);
      expect(webProgressScoreOf({ ...c, ngPlus: { cycle: c.cycle }, branches })).toBe(expected);
    }
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
    expect(put.json().progressScore).toBe(1_000_000 + 10000 + 3);

    const get = await app.inject({ method: 'GET', url: '/api/saves/me', headers: { 'x-device-id': id } });
    expect(get.statusCode).toBe(200);
    expect(get.json().state.day).toBe(3);
    expect(get.json().progressScore).toBe(1_000_000 + 10000 + 3);
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
    expect(higher.json().progressScore).toBe(1_000_000 + 20000 + 9);
  });

  it('二周目的 PUT 覆盖一周目的云端旧档（周目数参与评分）', async () => {
    // 这条是 C2 修的核心 bug：一周目旧档分数更高（因为 day 更晚 / 阶段更靠后），
    // 会把二周目的新档整个覆盖回去 —— 玩家「开始二周目」后回来还是老存档。
    // 修法：cycle * 1e6 的权重压过一周目上限。
    const id = randomUUID();
    const headers = { 'x-device-id': id };

    // 云端已有一周目的「很好」的档
    await app.inject({
      method: 'PUT',
      url: '/api/saves/me',
      headers,
      payload: {
        state: state({ day: 90, stage: 3, stepIndex: 3, ngPlus: { cycle: 1 } }),
      },
    });

    // 客户端推二周目的新档（进度几乎归零）
    const put = await app.inject({
      method: 'PUT',
      url: '/api/saves/me',
      headers,
      payload: {
        state: state({ day: 1, stage: 1, stepIndex: 0, ngPlus: { cycle: 2 } }),
      },
    });
    expect(put.statusCode).toBe(200);
    // 云端现在存的是二周目的档
    expect(put.json().state.ngPlus.cycle).toBe(2);

    const get = await app.inject({ method: 'GET', url: '/api/saves/me', headers });
    expect(get.json().state.ngPlus.cycle).toBe(2);
    expect(get.json().state.day).toBe(1);
  });

  it('老存档（ngPlus 是布尔）能正常 PUT / GET，不被 schema 拒掉', async () => {
    const id = randomUUID();
    const headers = { 'x-device-id': id };
    const put = await app.inject({
      method: 'PUT',
      url: '/api/saves/me',
      headers,
      payload: { state: state({ ngPlus: true }) },
    });
    expect(put.statusCode).toBe(200);
    // 布尔 true = A2 语义位 → 服务端按 cycle=2 算分
    expect(put.json().progressScore).toBe(1_000_000 * 2 + 10000 + 3);

    const get = await app.inject({ method: 'GET', url: '/api/saves/me', headers });
    expect(get.statusCode).toBe(200);
    expect(get.json().state.ngPlus).toBe(true);
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
