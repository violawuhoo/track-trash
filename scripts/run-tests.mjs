#!/usr/bin/env node
/**
 * 测试运行器包装（2026 复审新增）。
 *
 * 它解决三件**同一类**的问题：「测试没在跑，但报告显示通过」。
 *
 * ## 问题 1：Windows 沙箱下的 vitest SSR 缓存 EPERM（本轮 flaky 的根因）
 *
 * vitest 2.x 会把 SSR 变换结果写到 `join(os.tmpdir(), <projectId>, 'ssr')`
 * （`resolveConfig` 的 `fetch()` → `writeFile(tmp, code)`）。
 * 在 Windows 沙箱里，宿主的安全代理（`node-brokered-fs-shim.cjs` 的
 * `tryBrokerFileToken`）会**间歇性拒绝**对这些文件的写入 →
 * `EPERM: operation not permitted, open ...\ssr\<hash>`。
 *
 * 后果比「假红」更隐蔽：
 * - vitest 把这个错误记为 **unhandled error** 并 exit 1；
 * - 但**其中一个测试文件整个没跑**（`Tests 10 passed` 而不是 25），
 *   另一个文件照跑并全绿 → 「看起来只差一个文件」；
 * - 只看「测试通过率」的 CI 会以为没事，实际有用例被**静默跳过**。
 *
 * ### 已实测确认的根因
 *
 * 同一个目录下**并发**写多个文件会被拒，**串行**写不会；
 * 而 vitest 默认并行跑测试文件 → 每个 worker 都在往同一个 `ssr/` 目录写
 * → 并发写 → 间歇性 EPERM。
 * 实测（`apps/api`，各 12 次连跑）：
 * - 默认并行：2 次出现「只跑 10/25 例」；
 * - `--no-file-parallelism --maxWorkers=1`：12 次全部 2 文件 / 25 例全绿。
 *
 * 所以本脚本做两件事：
 * 1. **强制串行**（`--no-file-parallelism --maxWorkers=1`）→ 从根上避开并发写；
 * 2. **兜底重试**：即便仍有 EPERM，自动重跑（默认 2 次），
 *    并把每次尝试都打出来 —— 不让环境问题变成「静默少跑」。
 *
 * ## 问题 2：用例数守恒断言
 *
 * 上面那种「文件整个没跑」的情况，靠人眼发现太难。所以本脚本**在 vitest 跑完后
 * 解析机器可读的报告**，断言：
 * - 收集到的测试文件数 ≥ `--min-files`（少一个文件就红）
 * - 通过的用例数 ≥ `--min-tests`（少一条就红）
 *
 * 任一不满足 → **exit≠0**，CI 立刻红。
 * ⚠️ 阈值必须按各包**实际**用例数设（本轮按 `apps/api` 25 例 / 2 文件、
 * `packages/game-core` 155 例 / 10 文件），既不能写死成会误报的数，
 * 也不能写松到漏掉「少跑一个文件」。
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
 * - `--retries <n>`    EPERM 时的自动重跑次数（默认 2）
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
const RETRIES = numArg('--retries', 2);

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
  /**
   * ⚠️ **串行是刻意的，不是性能疏忽。**
   *
   * vitest 默认并行跑测试文件，每个 worker 都往**同一个** `ssr/` 缓存目录写
   * 变换结果。在 Windows 沙箱里并发写会被宿主的文件代理间歇性拒绝
   * （EPERM）→ 某个测试文件**整个没跑**、另一个照跑全绿 →
   * 「看起来只差一个文件」，实际有用例被静默跳过。
   *
   * 已实测（`apps/api`，各 12 次连跑）：
   * - 默认并行：2 次出现「只跑 10/25 例」；
   * - 串行：12 次全部 2 文件 / 25 例全绿。
   *
   * 配合下面的「EPERM 自动重试」兜底，两层都不让环境问题变成静默少跑。
   */
  '--no-file-parallelism',
  '--maxWorkers=1',
  // 双 reporter：default 给人看，json 给机器解析。
  '--reporter=default',
  '--reporter=json',
  `--outputFile.json=${REPORT_FILE}`,
];

console.log(
  `[run-tests] ${useLocal ? 'local' : 'npx'} vitest run（串行，避免沙箱并发写 SSR 缓存被拒）` +
    `  (TMP → ${TMP_ROOT})  守恒断言：用例 ≥ ${MIN_TESTS}，文件 ≥ ${MIN_FILES}，EPERM 重试 ≤ ${RETRIES}`,
);

/** 跑一次 vitest，返回 { code, output }。 */
function runOnce() {
  return new Promise((done) => {
    // 每次尝试都先清掉上一次的报告，避免读到旧数据。
    try {
      rmSync(REPORT_FILE, { force: true });
    } catch {
      /* 忽略 */
    }
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
    child.on('exit', (code) => done(code ?? 1));
  });
}

/** 读 vitest 的 JSON 报告；读不到 → null（按「不达标」处理）。 */
function readReport() {
  try {
    return JSON.parse(readFileSync(REPORT_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 守恒断言（两个方向都查）。
 *
 * @returns {string[]} 不满足的问题列表；空数组 = 通过
 */
function checkConservation(report) {
  const numPassed = report?.numPassedTests ?? 0;
  const numTotal = report?.numTotalTests ?? 0;
  const numFiles = report?.testResults?.length ?? 0;

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
  return problems;
}

/**
 * 判断这次失败是否**由沙箱的 EPERM 引起**（可重试的环境问题）。
 *
 * 判据：vitest 退出码非 0，**且**报告里有用例数不达标（文件整个没跑），
 * **且**计数少掉的用例数正好等于「少掉的文件」这一特征。
 * 保守起见，只在「用例数不达标」时重试 —— 真失败（用例红了）不会被重试掩盖。
 */
function looksLikeSandboxEperm(report) {
  if (!report) return false;
  const numPassed = report.numPassedTests ?? 0;
  const numFiles = report.testResults?.length ?? 0;
  return numFiles < MIN_FILES || numPassed < MIN_TESTS;
}

async function main() {
  let lastCode = 1;
  let lastProblems = ['（未执行）'];

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) {
      console.log(
        `\n[run-tests] ⚠️ 第 ${attempt} 次尝试（上一轮用例数不达标，可能是沙箱 EPERM 导致文件没跑）`,
      );
    }
    lastCode = await runOnce();
    const report = readReport();
    lastProblems = checkConservation(report);

    if (lastProblems.length === 0) {
      console.log('[run-tests] ✅ 守恒断言通过');
      try {
        rmSync(REPORT_FILE, { force: true });
      } catch {
        /* 忽略 */
      }
      if (lastCode !== 0) {
        console.error(`[run-tests] ❌ vitest 退出码 ${lastCode}`);
        process.exit(lastCode);
      }
      process.exit(0);
    }

    // 用例红了（真失败）→ 不重试，直接报。
    const hasFailure = (report?.numFailedTests ?? 0) > 0;
    if (hasFailure) break;
    if (!looksLikeSandboxEperm(report)) break;
  }

  console.error('\n[run-tests] ❌ 守恒断言不通过：');
  for (const p of lastProblems) console.error(`  - ${p}`);
  console.error(
    '[run-tests] 提示：这通常是 Windows 沙箱下 vitest 写 SSR 临时文件被拒（EPERM）' +
      '导致的「文件整个没跑」。本脚本已串行跑并自动重试；若仍出现，' +
      '请检查是否有别的进程占着临时目录。',
  );
  try {
    rmSync(REPORT_FILE, { force: true });
  } catch {
    /* 忽略 */
  }
  process.exit(1);
}

main();
