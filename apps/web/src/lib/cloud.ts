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

/** 进度评分（与 SPEC §8.1、服务端一致）。用于启动时本地/云端取高者。 */
export function progressScoreOf(s: {
  stage: number;
  stepIndex: number;
  branches: { ship: boolean; teashop: boolean; birthday: boolean };
  day: number;
}): number {
  const branchesDone =
    (s.branches.ship ? 1 : 0) +
    (s.branches.teashop ? 1 : 0) +
    (s.branches.birthday ? 1 : 0);
  return s.stage * 10000 + s.stepIndex * 1000 + branchesDone * 200 + s.day;
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
