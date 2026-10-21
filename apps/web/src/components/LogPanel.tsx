/**
 * 前任日志面板（C1 批次）。
 *
 * 玩家读日志的**唯一活路径**：
 *   HUD「日志」按钮 → 本面板 → 点条目展开全文。
 *
 * ## 为什么不是「点物品看描述」
 * 载体物品的 `desc` 只有一句钩子（≤40 字），正文在 `logs.ts` 里。
 * 日志是叙事资产，要能一屏读一整篇、能滚动、能把八篇放在一起看进度 ——
 * 这些都不是 `ItemSheet`（单物品浮层）能承载的。
 *
 * ## 三种显示状态
 *
 * | 状态 | 条件 | 显示 |
 * |---|---|---|
 * `readable` | 解锁条件满足 **且** 载体已合成 | 标题 + 记录日 + 全文（可展开） |
 * `waiting` | 解锁条件满足，但载体还没合出来 | 标题 + 「还没找到」+ 载体名 |
 * `locked` | 解锁条件没满足 | 「？？」+ 解锁提示（不剧透标题） |
 *
 * 「解锁条件满足 + 载体已获得」两个条件都要满足才读得到 ——
 * 口径见 `packages/game-core/src/logs.ts` 头部的设计口径表。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  LOGS,
  readableLogs,
  waitingLogs,
  type LogDoc,
  type LogProgress,
} from '@haola/game-core';
import { useGame } from '../store/gameStore';

type LogState = 'readable' | 'waiting' | 'locked';

interface Entry {
  log: LogDoc;
  state: LogState;
}

/**
 * 把 `**粗体**` 标记渲染成真正的粗体。
 *
 * 正文是**逐字取自 GDD** 的，标记原样保留在数据里，所以渲染层负责消化它。
 * 手工切分而不是引 markdown 依赖：正文只需要「加粗」这一种行内标记。
 */
function renderParagraph(text: string) {
  const parts = text.split('**');
  return parts.map((part, i) =>
    // 奇数段是 `**` 之间的内容
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>,
  );
}

export function LogPanel() {
  const logOpen = useGame((s) => s.logOpen);
  const closeLog = useGame((s) => s.closeLog);
  /** C2 批次：展开正文 = 标记「已读」→ 写进 `ngPlus.readLogs`（跨周目保留，G1） */
  const readLog = useGame((s) => s.readLog);

  // 细粒度订阅：只订阅面板真正用到的字段。
  // `s.save` 整体引用每次 collect 都会变，订阅它等于每次拾取都重渲染整份正文。
  const day = useGame((s) => s.save.day);
  const crafts = useGame((s) => s.save.crafts);
  const stage = useGame((s) => s.save.stage);
  const buildDone = useGame((s) => s.save.buildDone);
  const logsFound = useGame((s) => s.save.logsFound);
  // 跨周目已读（C2 批次 · G1「你记得」）。数组引用只在开新周目时变。
  const readLogs = useGame((s) => s.save.ngPlus.readLogs);

  /**
   * 展开中的日志 id 集合。
   *
   * ⚠️ C2 批次从单个 id 改成**集合**：GDD §7.1 G1「你记得」要求
   * 「日志面板默认已展开已读篇目」——是复数（一周目读过 L1、L2 就展开两篇）。
   */
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 面板打开时锁定背景滚动 */
  useEffect(() => {
    if (!logOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [logOpen, closeLog]);

  // 换档/重开时收起展开态，避免上一局的展开项留在新一局的面板上
  useEffect(() => {
    if (!logOpen) setOpenIds(new Set());
  }, [logOpen]);

  // G1「你记得」：二周目打开日志面板时，**已读篇目默认展开**。
  // 只在「面板刚打开」这一帧做一次（readLogs 变化时不重置玩家的展开操作）。
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!logOpen || seeded) return;
    setSeeded(true);
    if (readLogs.length > 0) setOpenIds(new Set(readLogs));
  }, [logOpen, seeded, readLogs]);

  const progress: LogProgress = useMemo(
    () => ({ day, crafts, stage, buildDone, logsFound, readLogs }),
    [day, crafts, stage, buildDone, logsFound, readLogs],
  );

  const entries: Entry[] = useMemo(() => {
    // 三态判定直接用 core 的纯函数，面板不自己复刻一遍口径 ——
    // 否则 core 改了条件面板不改，就会出现「core 说能读、面板说读不了」。
    //
    // ⚠️ C2 批次：状态判定改成**读 core 的三个集合**（readable / waiting / pending），
    // 而不是本地再算一遍 logUnlocked + carrierFound ——
    // 因为 core 现在多了一个来源：`alreadyRead`（跨周目已读）。
    // 本地复刻会把「上周目读过的篇目」误判成 locked。
    const readable = new Set(readableLogs(progress).map((l) => l.id));
    const waiting = new Set(waitingLogs(progress).map((l) => l.id));
    return LOGS.map((log) => {
      const state: LogState = readable.has(log.id)
        ? 'readable'
        : waiting.has(log.id)
          ? 'waiting'
          : 'locked';
      return { log, state };
    });
  }, [progress]);

  if (!logOpen) return null;

  const readableCount = entries.filter((e) => e.state === 'readable').length;

  return (
    <div className="sheet logpanel" onClick={closeLog}>
      <div
        className="logpanel__card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="前任的记录"
      >
        <div className="logpanel__head">
          <span className="logpanel__title">前任的记录</span>
          <span className="logpanel__meta">
            读到 {readableCount} / {LOGS.length}
          </span>
          <button
            type="button"
            className="drawer__toggle"
            onClick={closeLog}
            aria-expanded={logOpen}
          >
            收起
          </button>
        </div>

        <div className="logpanel__body">
          {entries.map(({ log, state }) => {
            const open = openIds.has(log.id);
            return (
              <article
                key={log.id}
                className={`logentry logentry--${state}${open ? ' is-open' : ''}`}
              >
                {state === 'locked' ? (
                  <>
                    <h3 className="logentry__title logentry__title--unknown">
                      {log.playerView}
                    </h3>
                    <p className="logentry__hint">{log.unlockHint}</p>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="logentry__head"
                      onClick={() => {
                        if (!open) readLog(log.id);
                        toggleOpen(log.id);
                      }}
                      aria-expanded={open}
                      disabled={state !== 'readable'}
                    >
                      <span className="logentry__title">{log.title}</span>
                      <span className="logentry__day">{log.recordDay}</span>
                    </button>

                    {state === 'waiting' && (
                      <p className="logentry__hint">
                        还没找到「{log.title}」。
                      </p>
                    )}

                    {state === 'readable' && (
                      <>
                        {!open && (
                          <p className="logentry__hint logentry__hint--tap">
                            点开读。
                          </p>
                        )}
                        {open && (
                          <div className="logentry__body">
                            {log.puzzle && (
                              <p className="logentry__puzzle">{log.puzzle}</p>
                            )}
                            {log.paragraphs.map((p, i) => (
                              <p key={i} className="logentry__para">
                                {renderParagraph(p)}
                              </p>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
