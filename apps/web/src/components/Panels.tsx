import {
  BRANCHES,
  branchStatus,
  getItem,
  getStage,
  bagHasTag,
  type SaveState,
} from '@haola/game-core';
import { ItemCard } from './ItemCard';

interface PanelProps {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Panel({ title, meta, open, onToggle, children }: PanelProps) {
  return (
    <section className="panel">
      <button className="panel__head" onClick={onToggle}>
        <span>{open ? '▾' : '▸'} {title}</span>
        {meta && <span>{meta}</span>}
      </button>
      {open && <div className="panel__body">{children}</div>}
    </section>
  );
}

interface Props {
  save: SaveState;
  openPanel: string | null;
  onToggle: (key: string) => void;
  onPick: (id: string) => void;
  slotItem: (id: string) => void;
  onView: (id: string | null) => void;
  slots: [string | null, string | null];
}

export function Panels({ save, openPanel, onToggle, slotItem, onView, slots }: Props) {
  const bagIds = Object.keys(save.bag).filter((id) => (save.bag[id] ?? 0) > 0);

  return (
    <div className="panels">
      <Panel
        title="当前目标"
        meta={save.stage === 3 ? '建设期' : `第 ${save.stage} 阶段`}
        open={openPanel === 'goal'}
        onToggle={() => onToggle('goal')}
      >
        <GoalContent save={save} />
      </Panel>

      <Panel
        title="背包"
        meta={`${bagIds.length} 种`}
        open={openPanel === 'bag'}
        onToggle={() => onToggle('bag')}
      >
        {bagIds.length === 0 ? (
          <p className="muted">空的。去搜一下。</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              点一下放进合成槽，点右上角 ? 看描述。
            </p>
            <div className="bag-grid">
              {bagIds.map((id) => (
                <ItemCard
                  key={id}
                  id={id}
                  count={save.bag[id]}
                  selected={slots.includes(id)}
                  onClick={() => slotItem(id)}
                  onHelp={() => onView(id)}
                  showHelp
                />
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="纪念品陈列"
        meta={`${save.keepsakes.length} 件`}
        open={openPanel === 'keepsake'}
        onToggle={() => onToggle('keepsake')}
      >
        {save.keepsakes.length === 0 ? (
          <p className="muted">还没有。完成一个阶段就会有一件。</p>
        ) : (
          <div className="keepsakes">
            {save.keepsakes.map((id) => (
              <ItemCard key={id} id={id} onClick={() => onView(id)} />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="日志"
        meta={`${save.log.length} 条`}
        open={openPanel === 'log'}
        onToggle={() => onToggle('log')}
      >
        <div className="log-list">
          {[...save.log]
            .slice(-40)
            .reverse()
            .map((entry, i) => (
              <div className="log-item" key={`${entry.day}-${i}`}>
                <small>第 {entry.day} 天</small>
                <span>{entry.text}</span>
              </div>
            ))}
        </div>
      </Panel>
    </div>
  );
}

function GoalContent({ save }: { save: SaveState }) {
  if (save.stage === 3) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          三条支线，做完任意一条就能收尾。只有造飞船能飞走。
        </p>
        {BRANCHES.map((branch) => {
          const status = branchStatus(branch, save.bag);
          const done = save.branches[branch.id];
          return (
            <div className="goal" key={branch.id}>
              <div className="goal__step">
                {branch.name} · {done ? '已达成' : `${status.filledCount}/3`}
              </div>
              <div className="goal__req">
                {branch.slots.map((slot, i) => (
                  <span
                    key={slot}
                    className={`tag ${status.filled[i] || done ? 'tag--hit' : ''}`}
                  >
                    {slot}
                  </span>
                ))}
              </div>
              {!done && (
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  候选：
                  {branch.requires
                    .map((opts) => opts.map((id) => getItem(id).name).join(' / '))
                    .join(' · ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const stage = getStage(save.stage as 1 | 2);
  if (!stage) return null;
  const step = stage.steps[save.stepIndex];

  if (!step) {
    return <p className="muted">这一阶段的目标都完成了。</p>;
  }

  return (
    <div className="goal">
      <div className="goal__step">
        第 {save.stepIndex + 1} 步 / 共 {stage.steps.length} 步
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6 }}>{stage.blurb}</div>
      <div className="goal__req">
        {step.requires.map((tag) => (
          <span key={tag} className={`tag ${bagHasTag(save.bag, tag) ? 'tag--hit' : ''}`}>
            {tag}
          </span>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
        绿色表示背包里已经有带这个标签的东西。凑齐两个标签就能推进，不限定具体哪两件。
      </div>
    </div>
  );
}
