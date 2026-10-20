/**
 * 左下角提示条：「缺：能粘的东西」，点一下展开成当前阶段目标。
 *
 * 契约 §6.1、REDESIGN §4.1。容器 `pointer-events: none`，只有 chip 自己可点。
 * 位置在对话条之上（`--dialogue-h-expanded` + 间距），避免对话条展开时被压住。
 */
import { useState } from 'react';
import {
  bagHasTag,
  getStage,
  missingForBag,
  type Progress,
} from '@haola/game-core';
import { useGame } from '../store/gameStore';

export function HintBar() {
  const stage = useGame((s) => s.save.stage);
  const stepIndex = useGame((s) => s.save.stepIndex);
  const bag = useGame((s) => s.save.bag);
  const tutorialStep = useGame((s) => s.save.tutorial.step);
  const [open, setOpen] = useState(false);

  // T7：引导期间把左下角的位置让给 TutorBar（375px 上两个 pill 放不下），
  // 引导结束（step 到 free）自动回来。目标提示一条不少，只是换时段说。
  if (tutorialStep !== 'free') return null;

  const progress: Progress = { stage, stepIndex };
  const missing = missingForBag(progress, bag).slice(0, 2);
  const stageDef = getStage(stage as 1 | 2);
  const step = stageDef?.steps[stepIndex];

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
