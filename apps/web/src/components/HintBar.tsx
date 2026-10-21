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
  missingForBag,
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
  const [open, setOpen] = useState(false);

  // 由签名重建「仅成员关系」的 bag：bagHasTag / missingForBag 只看 count>0、不关心具体数量
  // （见 packages/game-core/src/search.ts），故把每个持有 id 归一为 1 即可，无需订阅 bag 对象引用
  // （订阅引用就是掉帧元凶）。heldSig 为空串（无任何物品）时给空对象，避免 split 出 spurious '' 键。
  //
  // 性能铁律（POLISH-HUD-1）：订阅的是 heldSig（string，Object.is 去重），不是 bag 对象引用。
  // 所以下面所有派生计算统一挂在 useMemo 上，依赖 [heldSig, stage, stepIndex]，
  // 只有「持有成员关系」或「阶段进度」真的变了才重算。
  const { bag, missing, hints, stageDef, step } = useMemo(() => {
    const bag: Record<string, number> = heldSig
      ? Object.fromEntries(heldSig.split(',').map((id): [string, number] => [id, 1]))
      : {};
    const progress: Progress = { stage, stepIndex };
    const stageDef = getStage(stage as 1 | 2 | 3);
    return {
      bag,
      missing: missingForBag(progress, bag).slice(0, 2),
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

  /** 阶段 3 没有标签目标，`missingForBag` 返回空 —— 给一句收尾提示 */
  const headline =
    missing.length > 0
      ? `缺：${missing.join(' / ')}`
      : stage === 3
        ? '凑齐一条三件套就能收尾'
        : '齐了，放进合成台试试';

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
