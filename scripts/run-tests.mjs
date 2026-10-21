#!/usr/bin/env node
/**
 * 测试运行器包装（2026 复审新增）。
 *
 * 它解决两件**同一类**的问题：「测试没在跑，但报告显示通过」。
 *
 * ## 问题 1：Windows 沙箱下的 vitest SSR 缓存 EPERM
 *
 * vitest 2.x 会把 SSR 变换结果写到 `join(os.tmpdir(), <projectId>, 'ssr')`。
 * 在 Windows 沙箱里，`%TEMP%`（`C:\Users\<u>\AppData\Local\Temp`）被宿主的安全
 * 代理拒绝写入 → 抛 `EPERM: operation not permitted, open ...\ssr\<hash>`。
 *
 * 后果比「假红」更隐蔽：
 * - vitest 把这个错误记为 **unhandled error** 并 exit 1；
 * - 但**其中一个测试文件整个没跑**（`Tests 10 passed` 而不是 25），
 *   另一个文件照跑并全绿 → 「看起来只差一个文件」；
 * - 只看「测试通过率」的 CI 会以为没事，实际有用例被**静默跳过**。
 *
 * 修法：把 `TMPDIR` / `TEMP` / `TMP` 全部指到仓库内的固定目录
 * （`<repo>/.tmp/vitest-tmp`），让 vitest 的临时写入落在我们能写的地方。
 * 在 Linux CI 上这三个变量本来就被尊重，行为不变（只是换了个位置）。
 *
 * ## 问题 2：用例数守恒断言
 *
 * 上面那种「文件整个没跑」的情况，靠人眼发现太难。所以本脚本**在 vitest 跑完后
 * 解析机器可读的报告**，断言：
 * - 收集到的测试文件数 ≥ `--min-files`（少一个文件就红）
 * - 通过的用例数 ≥ `--min-tests`（少一条就红）
 *
 * 任一不满足 → **exit≠0**，CI 立刻红。
 *
 * ## 用法
 *
 * ```bash
 * node ../../scripts/run-tests.mjs --min-tests 25 --min-files 2
 * ```
 *
 * 参数：
 * - `--min-tests <n>`  最少通过的用例数（默认 1）
 * - `--min-files <n>`  最少收集到的测试文件数（默认 1）
 *
 * 退出码：0 = 全绿；1 = 守恒断言不达标 / vitest 失败；2 = 参数错。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const PKG_ROOT = process.cwd();

/** ── 参数解析 ── */
const argv = process.argv.slice(2);
function numArg(name, dflt) {
  const i = argv.indexOf(name);
  if (i < 0) return dflt;
  const v = Number(argv[i + 1]);
  if (!Number.isFinite(v) || v < 0) {
    console.error(`[run-tests] ${name} 需要一个非负数字，收到：${argv[i + 1]}`);
    process.exit(2);
  }
  return v;
}
const MIN_TESTS = numArg('--min-tests', 1);
const MIN_FILES = numArg('--min-files', 1);

/** ── 临时目录：仓库内固定路径，避开宿主 %TEMP% 的写入限制 ── */
const TMP_ROOT = join(REPO_ROOT, '.tmp', 'vitest-tmp');
mkdirSync(TMP_ROOT, { recursive: true });
const REPORT_FILE = join(TMP_ROOT, 'report.json');

/** 找 vitest 可执行入口：优先本包 node_modules/.bin，回退 npx。 */
const isWin = process.platform === 'win32';
const localBin = join(PKG_ROOT, 'node_modules', '.bin', isWin ? 'vitest.CMD' : 'vitest');
const useLocal = existsSync(localBin);
const cmd = useLocal ? localBin : isWin ? 'npx.cmd' : 'npx';
const baseArgs = useLocal ? [] : ['vitest'];

const args = [
  ...baseArgs,
  'run',
  // 双 reporter：default 给人看，json 给机器解析。
  '--reporter=default',
  '--reporter=json',
  `--outputFile.json=${REPORT_FILE}`,
];

console.log(
  `[run-tests] ${useLocal ? 'local' : 'npx'} vitest run  ` +
    `(TMP → ${TMP_ROOT})  守恒断言：用例 ≥ ${MIN_TESTS}，文件 ≥ ${MIN_FILES}`,
);

const child = spawn(cmd, args, {
  cwd: PKG_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    TMPDIR: TMP_ROOT,
    TEMP: TMP_ROOT,
    TMP: TMP_ROOT,
  },
  shell: isWin,
});

child.on('exit', (code) => {
  // 无论 vitest 成败，都要跑守恒断言 —— 「文件没跑」时 vitest 可能只报 unhandled error。
  let report = null;
  try {
    report = JSON.parse(readFileSync(REPORT_FILE, 'utf-8'));
  } catch {
    /* 报告读不到 → 下面按「不达标」处理 */
  }

  const numPassed = report?.numPassedTests ?? 0;
  const numTotal = report?.numTotalTests ?? 0;
  const numFiles = report?.testResults?.length ?? 0;
  const numFailed = report?.numFailedTests ?? 0;

  console.log('\n[run-tests] ── 用例数守恒断言 ──');
  console.log(`[run-tests] 收集到的测试文件：${numFiles}（要求 ≥ ${MIN_FILES}）`);
  console.log(`[run-tests] 用例：${numPassed} 通过 / ${numTotal} 总（要求 ≥ ${MIN_TESTS} 通过）`);

  const problems = [];
  if (!report) {
    problems.push('拿不到 vitest 的 JSON 报告（测试可能整个没跑起来）');
  }
  if (numFiles < MIN_FILES) {
    problems.push(
      `只收集到 ${numFiles} 个测试文件（要求 ≥ ${MIN_FILES}）—— 有文件整个没跑`,
    );
  }
  if (numPassed < MIN_TESTS) {
    problems.push(
      `只跑了 ${numPassed} 个用例（要求 ≥ ${MIN_TESTS}）—— 有用例被静默跳过`,
    );
  }

  if (problems.length > 0) {
    console.error('\n[run-tests] ❌ 守恒断言不通过：');
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      '[run-tests] 提示：这通常是 Windows 沙箱下 vitest 写 SSR 临时文件被拒（EPERM）' +
        '导致的「文件整个没跑」。本脚本已把 TMP 指向仓库内目录；若仍出现，' +
        '请检查是否有别的进程占着临时目录。',
    );
    try {
      rmSync(REPORT_FILE, { force: true });
    } catch {
      /* 忽略 */
    }
    process.exit(1);
  }

  console.log('[run-tests] ✅ 守恒断言通过');
  try {
    rmSync(REPORT_FILE, { force: true });
  } catch {
    /* 忽略 */
  }
  if (code !== 0) {
    console.error(`[run-tests] ❌ vitest 退出码 ${code}`);
    process.exit(code);
  }
  process.exit(numFailed > 0 ? 1 : 0);
});
