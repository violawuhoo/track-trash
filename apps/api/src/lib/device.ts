import type { FastifyRequest } from 'fastify';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 从 X-Device-Id 头取设备 ID。
 * 鉴权不做账号：设备 ID 只是隔离键。非法（缺失 / 非 UUID）返回 null，调用方应回 400。
 */
export function parseDeviceId(req: FastifyRequest): string | null {
  const raw = req.headers['x-device-id'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || typeof v !== 'string') return null;
  if (!UUID_RE.test(v)) return null;
  return v;
}
