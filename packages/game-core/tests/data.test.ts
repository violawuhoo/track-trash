import { describe, expect, it } from 'vitest';
import {
  ACCIDENT_RULES,
  AREA_POOLS,
  BRANCHES,
  ITEMS,
  ITEM_MAP,
  RECIPES,
  STAGES,
} from '../src/index';

describe('数据完整性', () => {
  it('物品 id 唯一', () => {
    const ids = ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('物品名称唯一', () => {
    const names = ITEMS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('每个物品都有描述、tags 和 kind', () => {
    for (const item of ITEMS) {
      expect(item.desc.length, item.id).toBeGreaterThan(4);
      expect(item.tags.length, item.id).toBeGreaterThan(0);
      expect(item.kind, item.id).toBeTruthy();
      expect(item.icon, item.id).toBeTruthy();
    }
  });

  it('base 物品必须归属一个区域', () => {
    for (const item of ITEMS.filter((i) => i.kind === 'base')) {
      expect(item.area, item.id).toBeTruthy();
    }
  });

  it('四个区域的池子都非空', () => {
    for (const [area, pool] of Object.entries(AREA_POOLS)) {
      expect(pool.length, area).toBeGreaterThan(0);
    }
  });

  it('配方引用的物品都存在', () => {
    for (const r of RECIPES) {
      expect(ITEM_MAP[r.a], `配方 ${r.a}+${r.b} 的 a`).toBeDefined();
      expect(ITEM_MAP[r.b], `配方 ${r.a}+${r.b} 的 b`).toBeDefined();
      expect(ITEM_MAP[r.out], `配方 ${r.a}+${r.b} 的产出`).toBeDefined();
    }
  });

  it('配方没有重复的组合键', () => {
    const keys = RECIPES.map((r) => [r.a, r.b].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('意外规则引用的物品都存在', () => {
    for (const rule of ACCIDENT_RULES) {
      expect(ITEM_MAP[rule.out], rule.out).toBeDefined();
    }
  });

  it('阶段目标的产出物都存在', () => {
    for (const stage of STAGES) {
      for (const step of stage.steps) {
        expect(ITEM_MAP[step.output], step.id).toBeDefined();
      }
    }
  });

  it('支线候选物都存在', () => {
    for (const branch of BRANCHES) {
      expect(branch.requires.length).toBe(branch.slots.length);
      for (const options of branch.requires) {
        expect(options.length).toBeGreaterThan(0);
        for (const id of options) {
          expect(ITEM_MAP[id], `${branch.id}: ${id}`).toBeDefined();
        }
      }
    }
  });

  it('所有非基础物品都有获取途径', () => {
    const obtainable = new Set<string>();
    for (const r of RECIPES) obtainable.add(r.out);
    for (const stage of STAGES) {
      for (const step of stage.steps) obtainable.add(step.output);
    }
    for (const rule of ACCIDENT_RULES) obtainable.add(rule.out);
    // 风险产物与兜底产物
    obtainable.add('failedtaste');
    obtainable.add('unclear');

    for (const item of ITEMS) {
      if (item.kind === 'base' || item.kind === 'keepsake') continue;
      expect(obtainable.has(item.id), `「${item.name}」(${item.id}) 没有获取途径`).toBe(true);
    }
  });

  it('基础物品全部出自某个区域', () => {
    const pooled = new Set(Object.values(AREA_POOLS).flat());
    for (const item of ITEMS.filter((i) => i.kind === 'base')) {
      expect(pooled.has(item.id), item.id).toBe(true);
    }
  });
});
