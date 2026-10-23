/**
 * 图鉴面板（C2 批次）。
 *
 * GDD §7.2：主菜单与结局页各一个「图鉴」入口，页内两栏：
 *
 * | 栏   | 内容                                                        | 视觉 |
 * |------|-------------------------------------------------------------|------|
 * | 结局 | 5 格（leave / teashop / birthday / stay / free）             | 未解锁 = 墨黑剪影，已解锁 = 原色 |
 * | 日志 | 8 篇，标题 + 前任记录日 + 段落数                            | 已读可展开全文，未读显示「还没读到」 |
 *
 * ## 为什么放在独立面板而不是结局页内联
 *
 * 图鉴是**跨周目**的东西：主菜单（还没开局）与结局页（刚打完一个结局）都要看，
 * 所以它不能寄生在任何一个页面里 —— 做成一个由 store 控制的浮层，
 * 两个入口都只是把它打开。
 *
 * ## 数据来源
 *
 * - 结局：`archive.endings`（跨周目档案，core 记账）
 * - 日志「已读」：`archive.readLogs`（跨周目读过的篇目）
 * - 日志「本周目已获得」：`archiveLogsFound`（本周目合出过载体）
 *
 * ## ⚠️ 三态必须分开，不能混
 *
 * | 状态 | 判据 | 含义 |
 * |---|---|---|
 * | 已读 | `readLogs` 里有 | 玩家**点开正文**读过 —— 跨周目保留 |
 * | 本周目已获得 | `logsFound` 里有 | 本周目**合出过载体**，但没读 |
 * | 没碰到 | 都没有 | 载体与正文都没见过 |
 *
 * 「拿到载体」与「读过」是两件事（见 core `ngplus.ts` 的三层概念表）：
 * 二周目里 `logsFound` 清零但 `readLogs` 保留 —— 于是「读过」的篇目
 * 在二周目依然显示全文，「只拿到载体但没读」的篇目仍然显示「还没读」。
 *
 * **不得把 `logsFound` 当「已读」显示** —— 那会让玩家以为自己读过没读过的篇目。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ENDINGS,
  LOGS,
  type EndingId,
  type LogDoc,
} from '@haola/game-core';
import { useGame } from '../store/gameStore';

/** 结局的展示顺序（玩家在 GDD / 结局页里看到的顺序） */
const ENDING_ORDER: readonly EndingId[] = [
  'leave',
  'teashop',
  'birthday',
  'stay',
  'chaos',
  'free',
];

/** 日志条目的展示状态 */
type LogState = 'read' | 'carried' | 'unknown';

interface LogEntry {
  log: LogDoc;
  state: LogState;
}

export function CodexPanel() {
  const codexOpen = useGame((s) => s.codexOpen);
  const closeCodex = useGame((s) => s.closeCodex);

  // 细粒度订阅（性能铁律）：不订阅 `s.save` 整体。
  // `endings` / `readLogs` / `logsFound` 是数组，引用变化才重渲染，
  // 它们只在 craft / 开新周目时才换引用 —— 不会每帧抖。
  //
  // ⚠️ 用 `archive`（store 的档案镜像）而不是 `save.ngPlus`：
  // 主菜单打开图鉴时玩家还没点「继续游戏」，`save` 还是空档案。
  const endings = useGame((s) => s.archive.endings);
  const readLogs = useGame((s) => s.archive.readLogs);
  // ⚠️ 「本周目已获得」用的是 `archiveLogsFound` 镜像，不是 `save.logsFound` ——
  // 主菜单时 `save` 是空档案，直接读它会把「拿到载体但还没读」的篇目
  // 误判成「完全没碰到」。镜像在 `commit` 时同步，主菜单看到的是上一次存档的情况。
  const logsFound = useGame((s) => s.archiveLogsFound);

  /** 展开中的日志 id。null = 都没展开 */
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!codexOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCodex();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [codexOpen, closeCodex]);

  // 关闭时收起展开态，避免下次打开还留着上一篇
  useEffect(() => {
    if (!codexOpen) setOpenId(null);
  }, [codexOpen]);

  const endingCells = useMemo(
    () =>
      ENDING_ORDER.map((id) => ({
        id,
        meta: ENDINGS[id],
        unlocked: endings.includes(id),
      })),
    [endings],
  );

  const logEntries: LogEntry[] = useMemo(
    () =>
      LOGS.map((log) => {
        const state: LogState = readLogs.includes(log.id)
          ? 'read'
          : logsFound.includes(log.id)
            ? 'carried'
            : 'unknown';
        return { log, state };
      }),
    [readLogs, logsFound],
  );

  if (!codexOpen) return null;

  const unlockedEndings = endingCells.filter((c) => c.unlocked).length;
  const readCount = logEntries.filter((e) => e.state === 'read').length;

  return (
    <div className="sheet codex" onClick={closeCodex}>
      <div
        className="codex__card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="图鉴"
      >
        <div className="codex__head">
          <span className="codex__title">图鉴</span>
          <span className="codex__meta">
            结局 {unlockedEndings} / {ENDING_ORDER.length} · 日志 {readCount} / {LOGS.length}
          </span>
          <button
            type="button"
            className="drawer__toggle"
            onClick={closeCodex}
            aria-expanded={codexOpen}
          >
            收起
          </button>
        </div>

        <div className="codex__body">
          {/* ── 结局栏 ── */}
          <section className="codex__section">
            <h2 className="codex__sectiontitle">结局</h2>
            <div className="codex__endings">
              {endingCells.map(({ id, meta, unlocked }) => (
                <div
                  key={id}
                  className={`codex__ending ${unlocked ? 'is-unlocked' : 'is-locked'}`}
                >
                  <span className="codex__endingtitle">
                    {unlocked ? meta.title : '？？？'}
                  </span>
                  <span className="codex__endingsub">
                    {unlocked ? meta.subtitle : '还没走到这条路上。'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 日志栏 ── */}
          <section className="codex__section">
            <h2 className="codex__sectiontitle">前任的记录</h2>
            <div className="codex__logs">
              {logEntries.map(({ log, state }) => {
                const open = openId === log.id;
                return (
                  <article
                    key={log.id}
                    className={`codex__log codex__log--${state}${open ? ' is-open' : ''}`}
                  >
                    <button
                      type="button"
                      className="codex__loghead"
                      onClick={() => setOpenId(open ? null : log.id)}
                      aria-expanded={open}
                      disabled={state !== 'read'}
                    >
                      <span className="codex__logtitle">
                        {state === 'unknown' ? '？？？' : log.title}
                      </span>
                      <span className="codex__logday">{log.recordDay}</span>
                      <span className="codex__logpara">
                        {state === 'unknown' ? '—' : `${log.paragraphs.length} 段`}
                      </span>
                    </button>

                    {state === 'unknown' && (
                      <p className="codex__loghint">{log.playerView}</p>
                    )}
                    {state === 'carried' && (
                      <p className="codex__loghint">
                        本周目拿到了，还没读。
                      </p>
                    )}
                    {state === 'read' && open && (
                      <div className="codex__logbody">
                        {log.puzzle && (
                          <p className="codex__logpuzzle">{log.puzzle}</p>
                        )}
                        {log.paragraphs.map((p, i) => (
                          <p key={i} className="codex__logpara-text">
                            {p}
                          </p>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
