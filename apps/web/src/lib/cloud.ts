/**
 * 云存档客户端（T8）。
 *
 * 设计铁律：前端离线必须可玩。这里所有请求都是「尽力而为」——
 * 失败、超时、离线一律静默降级，绝不阻塞游玩，也不抛错到 UI。
 *
 * - 匿名设备 ID 存在 localStorage，作隔离键（不做账号、不加密，符合单机定位）
 * - 推送防抖，避免每次持久化都打接口
 * - 冲突裁决在服务端（progressScore 大者胜），这里只负责「拉取 + 合并」的本地判断
 */
import { cycleOfNgPlus, progressScoreOf as coreProgressScoreOf } from '@haola/game-core';
import type { SaveStateV2 } from '../store/gameStore';

const DEVICE_KEY = 'haola.device';
const envAny = import.meta as unknown as { env?: { VITE_API_BASE?: string } };
const API_BASE = envAny.env?.VITE_API_BASE || '/api';

function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

interface CloudSave {
  state: SaveStateV2;
  schemaVersion: number;
  progressScore: number;
  updatedAt: string;
}

/** 进度评分（与 SPEC §8.1、服务端一致）。用于启动时本地/云端取高者。
 *
 *  ⚠️ C2 批次：**公式已下沉到 `packages/game-core/src/progress.ts`**。
 *  之前这里是 `apps/api/src/lib/progress.ts` 的手抄副本（R8 跨端漂移隐患），
 *  C2 要改公式（加周目数 + `stay` 支线计分），两份手抄改一遍必漏一边。
 *  现在两端 import 同一个纯函数 —— 同一组输入必然同一个数。
 *
 *  周目数（`cycle`）参与评分是**功能性必需**，不是可选优化：
 *  一周目分数上限 ≈32800，二周目 ≥1e6 → 二周目档必赢云端一周目旧档。
 *  否则「开始二周目」会被云端旧档整个覆盖回去。 */
export function progressScoreOf(s: {
  stage: number;
  stepIndex: number;
  branches: { ship: boolean; teashop: boolean; birthday: boolean; stay: boolean; chaos: boolean };
  day: number;
  ngPlus?: { cycle: number } | boolean | unknown;
}): number {
  return coreProgressScoreOf({
    stage: s.stage,
    stepIndex: s.stepIndex,
    branches: s.branches,
    day: s.day,
    // `ngPlus` 可能缺失或是布尔（A2 老存档）→ `cycleOfNgPlus` 容错取值。
    cycle: cycleOfNgPlus(s.ngPlus),
  });
}

async function apiFetch(
  path: string,
  method: string,
  body?: unknown,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    return await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'X-Device-Id': getDeviceId(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    return null; // 网络/超时/离线：静默降级
  } finally {
    clearTimeout(timer);
  }
}

/** 上传存档到云端（服务端按冲突规则裁决是否采纳）。失败静默。 */
export async function pushSave(save: SaveStateV2): Promise<void> {
  await apiFetch('/saves/me', 'PUT', {
    state: save,
    schemaVersion: save.schemaVersion,
    progressScore: progressScoreOf(save),
    clientUpdatedAt: new Date().toISOString(),
  });
}

/** 拉取云端存档。无档/失败返回 null。 */
export async function pullSave(): Promise<SaveStateV2 | null> {
  const res = await apiFetch('/saves/me', 'GET');
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as CloudSave;
    return data.state ?? null;
  } catch {
    return null;
  }
}

/** 清空云端存档（开始页「重开」时调用）。失败静默。 */
export async function clearCloudSave(): Promise<void> {
  await apiFetch('/saves/me', 'DELETE');
}

// ── 防抖推送：避免每次 persist 都打接口 ──
let pending: SaveStateV2 | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** 入队一次云端推送（防抖 1.5s，收尾时自动发出）。 */
export function queuePush(save: SaveStateV2): void {
  pending = save;
  if (timer != null) return;
  timer = setTimeout(() => {
    timer = null;
    const s = pending;
    pending = null;
    if (s) void pushSave(s).catch(() => {});
  }, 1500);
}

/**
 * 丢弃待发的推送。清档（重开）时必须先调，
 * 否则 1.5s 内刚提交过的话，旧存档会在 DELETE 之后被重新推回云端。
 */
export function cancelPendingPush(): void {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  pending = null;
}
