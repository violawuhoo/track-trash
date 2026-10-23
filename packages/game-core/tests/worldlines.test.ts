import { describe, expect, it } from 'vitest';
import {
  BRANCHES,
  WORLD_LINES,
  activeInvites,
  createInitialState,
  leadingLine,
  lineAffinity,
} from '../src/index';

describe('世界线定义', () => {
  it('五条世界线与支线定义一一对应', () => {
    expect(WORLD_LINES.map((l) => l.id).sort()).toEqual(
      BRANCHES.map((b) => b.id).sort(),
    );
    for (const line of WORLD_LINES) {
      expect(line.invite.length, line.id).toBeGreaterThan(6);
      expect(line.keys.length, line.id).toBeGreaterThan(0);
      expect(line.threshold, line.id).toBeGreaterThan(0);
    }
  });
});

describe('倾向值与邀请', () => {
  it('空背包：全零倾向，无邀请，无主导线', () => {
    const s = createInitialState();
    const aff = lineAffinity(s.bag);
    for (const line of WORLD_LINES) {
      expect(aff[line.id]).toBe(0);
    }
    expect(activeInvites(s)).toEqual([]);
    expect(leadingLine({})).toBeNull();
  });

  it('背包里有 2 个飞船零件 → ship 邀请浮现', () => {
    const s = createInitialState();
    s.bag = { optimistic: 1, ration: 1 };
    const invites = activeInvites(s);
    expect(invites.map((i) => i.id)).toContain('ship');
  });

  it('乱合意外产物 → chaos 线率先亮起并成为主导线', () => {
    const s = createInitialState();
    s.bag = { unclear: 1, halfplan: 1, opttape: 1, gum: 1 };
    const ids = activeInvites(s).map((i) => i.id);
    expect(ids).toContain('chaos');
    expect(leadingLine(s.bag)?.id).toBe('chaos');
  });

  it('已完成的线不再邀请', () => {
    const s = createInitialState();
    s.branches.teashop = true;
    s.bag = { shopfront: 1, menu: 1 };
    expect(activeInvites(s).map((i) => i.id)).not.toContain('teashop');
  });

  it('倾向值按关键物品去重计数（同一物品堆叠只算 1）', () => {
    const aff = lineAffinity({ shopfront: 5 });
    expect(aff.teashop).toBe(1);
  });
});
