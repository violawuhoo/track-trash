/**
 * 零依赖静态服务器：把 apps/web/dist 按正确 base 提供给 Lighthouse / 浏览器。
 *
 * 为什么不用 `vite preview`：本沙箱里 vite preview 对 /assets/* 全部走 SPA
 * fallback 返回 index.html（Chrome 收到 404/HTML 当 JS，直接 NO_FCP），
 * 且沙箱 EPERM 会让磁盘读取随机失败（502/404 时有时无）。
 * 这里把 dist 全部读进内存一次性服务：行为与 GitHub Pages 一致，且不受
 * 沙箱文件读取抖动影响。
 *
 * 用法：node scripts/perf-static-serve.mjs [port] [dir] [base]
 *   默认 port=4182 dir=apps/web/dist base=/track-trash/
 */
import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const PORT = Number(process.argv[2] ?? 4182);
const DIR = process.argv[3] ?? 'apps/web/dist';
// base 也可能被 Git Bash 的 MSYS 路径转换搞成 C:/…/track-trash/，这里只认最后一段
const BASE_RAW = process.argv[4] ?? '/track-trash/';
const BASE = BASE_RAW.includes('track-trash') ? '/track-trash/' : BASE_RAW.startsWith('/') ? BASE_RAW : `/${BASE_RAW}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// ── 启动时把整个 dist 读进内存（沙箱磁盘读取不稳定，缓存后服务不碰盘）──
const files = new Map(); // relPath(posix) → Buffer
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else files.set(relative(resolve(DIR), full).replace(/\\/g, '/'), await readFile(full));
  }
}
await walk(DIR);
console.log(`静态服务 ${DIR}（内存缓存 ${files.size} 个文件，共 ${Math.round([...files.values()].reduce((a, b) => a + b.length, 0) / 1024)}KB）`);
console.log(`  → http://127.0.0.1:${PORT}${BASE}`);

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = decodeURIComponent(url.pathname);
  if (!path.startsWith(BASE)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('outside base');
    return;
  }
  let rel = path.slice(BASE.length - 1) || '/';
  if (rel.endsWith('/')) rel += 'index.html';
  let body = files.get(rel.replace(/^\//, ''));
  if (!body) body = files.get('index.html'); // SPA fallback：刷新子路径不 404（Pages 同行为）
  const type = MIME[extname(rel)] ?? 'application/octet-stream';
  // GitHub Pages 会自动 gzip，这里对齐线上行为，否则 Lighthouse 的
  // uses-text-compression 会白扣 300+KB 传输量
  const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  const out = wantsGzip ? gzipSync(body) : body;
  const headers = {
    'content-type': type,
    'cache-control': 'no-cache',
  };
  if (wantsGzip) headers['content-encoding'] = 'gzip';
  res.writeHead(200, headers);
  res.end(out);
});

server.listen(PORT, '127.0.0.1', () => {});
