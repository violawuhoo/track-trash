import { AREAS, launchCheck } from '@haola/game-core';
import { useGame } from '../store/gameStore';
import { TopBar } from '../components/TopBar';
import { AreaTabs } from '../components/AreaTabs';
import { ItemCard } from '../components/ItemCard';
import { CraftBench } from '../components/CraftBench';
import { Panels } from '../components/Panels';
import { DialogueBar } from '../components/DialogueBar';

export function GameScreen() {
  const save = useGame((s) => s.save);
  const slots = useGame((s) => s.slots);
  const openPanel = useGame((s) => s.openPanel);
  const dialog = useGame((s) => s.dialog);
  const dialogIndex = useGame((s) => s.dialogIndex);

  const setArea = useGame((s) => s.setArea);
  const search = useGame((s) => s.search);
  const pick = useGame((s) => s.pick);
  const toggleSlot = useGame((s) => s.toggleSlot);
  const clearSlot = useGame((s) => s.clearSlot);
  const doCraft = useGame((s) => s.doCraft);
  const togglePanel = useGame((s) => s.togglePanel);
  const view = useGame((s) => s.view);
  const advanceDialog = useGame((s) => s.advanceDialog);

  const mode = launchCheck(save.bag);
  const showLaunch = save.stage === 3 && mode !== 'none';

  return (
    <>
      <TopBar save={save} />
      <AreaTabs save={save} onSelect={setArea} />

      <div className="stage">
        <div className={`scene ${save.scene.length === 0 ? 'scene--empty' : ''}`}>
          <span className="scene__caption">{AREAS[save.areaId].name}</span>
          {save.scene.length === 0 ? (
            <>
              <b style={{ fontSize: 14 }}>
                {save.day === 1 ? '还没搜过这里。' : '这里已经翻空了。'}
              </b>
              <span>{save.day === 1 ? '搜一次，看看能捡到什么。' : '再搜一次，或者换个区域。'}</span>
            </>
          ) : (
            save.scene.map((id, i) => (
              <ItemCard key={`${id}-${i}`} id={id} onClick={() => pick(id)} />
            ))
          )}
        </div>
      </div>

      <div className="searchbar">
        <button className="btn btn--block" onClick={search}>
          搜索这个区域 · +1 天
        </button>
      </div>

      <CraftBench slots={slots} onClear={clearSlot} onCraft={doCraft} />

      {showLaunch && (
        <div style={{ padding: '0 12px 10px' }}>
          <button className="btn btn--primary btn--block" onClick={() => useGame.getState().doLaunch()}>
            {mode === 'full' ? '起飞 · 准备完毕' : '强行起飞 · 一半机会'}
          </button>
        </div>
      )}

      {save.stage === 3 && (
        <div style={{ padding: '0 12px 10px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {save.branches.teashop && (
            <button
              className="btn"
              style={{ flex: 1, minWidth: 140 }}
              onClick={() => useGame.getState().chooseEnding('teashop')}
            >
              开奶茶店
            </button>
          )}
          {save.branches.birthday && (
            <button
              className="btn"
              style={{ flex: 1, minWidth: 140 }}
              onClick={() => useGame.getState().chooseEnding('birthday')}
            >
              给石头过生日
            </button>
          )}
          <button
            className="btn"
            style={{ flex: 1, minWidth: 110 }}
            onClick={() => useGame.getState().chooseEnding('free')}
          >
            留下来
          </button>
        </div>
      )}

      <Panels
        save={save}
        slots={slots}
        openPanel={openPanel}
        onToggle={togglePanel}
        onPick={pick}
        slotItem={toggleSlot}
        onView={view}
      />

      <DialogueBar lines={dialog} index={dialogIndex} onAdvance={advanceDialog} />
    </>
  );
}
