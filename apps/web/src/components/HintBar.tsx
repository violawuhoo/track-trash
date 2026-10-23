/**
 * 左下角提示条：「缺：能粘的东西」，点一下展开成当前阶段目标。
 *
 * 契约 §6.1、REDESIGN §4.1。容器 `pointer-events: none`，只有 chip 自己可点。
 * 位置在对话条之上（`--dialogue-h-expanded` + 间距），避免对话条展开时被压住。
 */
import { useMemo, useState } from 'react';
import {
  AREAS,
  bagHasTag,
  getItem,
  getStage,
  missingAreaHints,
  pairingExample,
  type Progress,
} from '@haola/game-core';
import { useGame } from '../store/gameStore';

export function HintBar() {
  const stage = useGame((s) => s.save.stage);
  const stepIndex = useGame((s) => s.save.stepIndex);
  // 真凶修复（POLISH-HUD-1）：原先订阅整个 bag 对象引用，每次 collect/craft 都换引用，
  // 导致 22~26 个 tag span 整体重渲染。改为订阅「持有 tag 的稳定签名」(string, Object.is 去重)：
  // 只有持有成员关系（哪些物品数量>0）真正变化时才重渲染，单纯数量增减不触发重渲染。
  const heldSig = useGame((s) =>
    Object.keys(s.save.bag)
      .filter((k) => (s.save.bag[k] ?? 0) > 0)
      .sort()
      .join(','),
  );
  const tutorialStep = useGame((s) => s.save.tutorial.step);
  // 建设期是否已走满（boolean，Object.is 去重，不订阅对象引用）
  const buildDone = useGame((s) => s.save.buildDone);
  // 周目数（G2「你有点手艺」只在二周目生效）。number，Object.is 去重。
  const cycle = useGame((s) => s.save.ngPlus.cycle);
  const [open, setOpen] = useState(false);

  // 由签名重建「仅成员关系」的 bag：bagHasTag / missingAreaHints 只看 count>0、
  // 不关心具体数量（见 packages/game-core/src/search.ts），故把每个持有 id
  // 归一为 1 即可，无需订阅 bag 对象引用（订阅引用就是掉帧元凶）。
  // heldSig 为空串（无任何物品）时给空对象，避免 split 出 spurious '' 键。
  //
  // 性能铁律（POLISH-HUD-1）：订阅的是 heldSig（string，Object.is 去重），不是 bag 对象引用。
  // 所以下面所有派生计算统一挂在 useMemo 上，依赖 [heldSig, stage, stepIndex]，
  // 只有「持有成员关系」或「阶段进度」真的变了才重算。
  //
  // A5 提示降噪后 `missing`（缺什么）不再进默认 chip，只在展开面板用
  // `hints`（跨区域指路）—— 所以这里不再单独返回 missing 列表。
  const { bag, hints, stageDef, step } = useMemo(() => {
    const bag: Record<string, number> = heldSig
      ? Object.fromEntries(heldSig.split(',').map((id): [string, number] => [id, 1]))
      : {};
    const progress: Progress = { stage, stepIndex };
    const stageDef = getStage(stage as 1 | 2 | 3);
    return {
      bag,
      // 跨区域提示：缺的东西去哪个区域找。v2 没有「搜索」按钮，
      // 这个提示是玩家唯一能看到的「去哪找」指引。
      hints: missingAreaHints(progress, bag),
      stageDef,
      step: stageDef?.steps[stepIndex],
    };
  }, [heldSig, stage, stepIndex]);

  // T7：引导期间把左下角的位置让给 TutorBar（375px 上两个 pill 放不下），
  // 引导结束（step 到 free）自动回来。目标提示一条不少，只是换时段说。
  if (tutorialStep !== 'free') return null;

  /**
   * headline（A5 提示降噪 · 探索动机改版）。
   *
   * 改版前默认态拼的是「缺：能粘的东西 / 知识」——左下角常年挂着一行
   * 「你还缺什么」的唠叨。降噪口径：**默认 chip 只报进度**
   * （阶段名 + 第 N 步 / 共 M 步），「缺什么、去哪找」收进展开面板，
   * 想看的人点一下就有，不想看的人左下角是干净的。
   *
   * 阶段 3 走满后 buildDone = true、stepIndex = 3（= steps.length），
   * 此时没有「当前步骤」，headline 走「建设期完成」分支。
   */
  const stage3StepTotal = stageDef?.steps.length ?? 0;
  // 完成判据取或：buildDone 是 core 写的权威位；但老档 / 异常路径下
  // buildDone 可能没落盘而 stepIndex 已经走到 steps.length（= 三步走满）。
  // 两种情况都算完成，否则 headline 会永远卡在「第 4 步 / 共 3 步」——
  // 而且这种形态下再合成也不会修复 buildDone（core 只在阶段命中的分支写它）。
  const stage3Done = buildDone || stepIndex >= stage3StepTotal;
  // 步号 clamp：stepIndex 走到 steps.length 之后不能显示「第 4 步」。
  const shownStep = Math.min(stepIndex + 1, stage3StepTotal);
  const stageName = stageDef?.name ?? `阶段 ${stage}`;
  const headline =
    stage === 3 && stage3Done
      ? '建设期完成 · 三样都造出来了'
      : `${stageName} · 第 ${shownStep} 步 / 共 ${stage3StepTotal} 步`;

  return (
    <div className="hint">
      <button
        type="button"
        className={`hint__chip ${open ? 'hint__chip--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="hint__text">{headline}</span>
        <span className="hint__caret" aria-hidden="true">
          {open ? '▾' : '▴'}
        </span>
      </button>

      {open && (
        <div className="hint__panel">
          {stageDef && step ? (
            <>
              {/* A5 提示降噪：默认 chip 只报进度，「这一步要什么」在这里
                  用一句完整的话说清（标签对 + 具体名字），不用去读标签云。 */}
              <div className="hint__need">这一步要：{step.requires.join(' + ')}</div>
              <div className="hint__step">
                第 {stepIndex + 1} 步 / 共 {stageDef.steps.length} 步
              </div>
              <div className="hint__blurb">{stageDef.blurb}</div>
              <div className="hint__req">
                {step.requires.map((tag) => (
                  <span
                    key={tag}
                    className={`tag ${bagHasTag(bag, tag) ? 'tag--hit' : ''}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {/* G2「你有点手艺」（C2 批次）：二周目里阶段 1 的目标提示额外给一行
                  标签方向示例。只改文案、不改判定 —— 示例是 core 算出来的，
                  给的是「这一步要哪两个标签」+ 一个例子，不是配方步骤，
                  玩家换成同类的另一件也照样能过这一步。 */}
              {cycle >= 2 && pairingExample(stage, stepIndex) && (
                <div className="hint__example">
                  {pairingExample(stage, stepIndex)!.text}
                </div>
              )}
              {/* 跨区域提示：缺的东西在哪个区域、具体是哪一件。
                  v2 没有「搜索」按钮，地面物品固定铺着，走过去自动拾取 ——
                  所以这里不替玩家做选择，只指路。 */}
              {hints.length > 0 && (
                <div className="hint__where-list">
                  {hints.map((h) => (
                    <div key={h.tag} className="hint__where">
                      {h.tag} —— {AREAS[h.areaId].name}（{getItem(h.itemId).name}）
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="hint__blurb">
              造飞船能飞走；开奶茶店、给石头过生日也能收尾。自己选。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
