import { describe, expect, it, vi } from 'vitest';
import {
  AREA_POOLS,
  ITEMS,
  ITEM_MAP,
  STAGES,
  WORLD,
  areaOfPoint,
  clampToWalkable,
  distribute,
  isWalkable,
  sectorCenter,
  toPolar,
} from '../src/index';
import type { AreaId, PlacedItem, Tag, Vec2 } from '../src/index';

// ───────────────────────── 工具 ─────────────────────────

/** 固定种子随机源 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAG_SETS = new Map<string, Set<Tag>>(
  ITEMS.map((item) => [item.id, new Set(item.tags)]),
);

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function tagsOf(id: string): readonly Tag[] {
  return ITEM_MAP[id]?.tags ?? [];
}

/** 契约里的扇区几何，测试里独立实现一遍，不复用被测代码 */
const SECTOR_CENTER_DEG: Readonly<Record<AreaId, number>> = {
  crash: 0,
  junkyard: 0,
  market: -90,
  cave: 180,
};

function inSector(p: Vec2, area: AreaId): boolean {
  const { r, deg } = toPolar(p);
  if (area === 'crash') return r <= 200 + 1e-6;
  const delta = Math.abs((((deg - SECTOR_CENTER_DEG[area] + 540) % 360) + 360) % 360 - 180);
  return r >= 300 - 1e-6 && r <= WORLD.itemRadius + 1e-6 && delta <= 45 + 1e-6;
}

function randomWalkable(rng: () => number): Vec2 {
  const r = WORLD.walkableRadius * Math.sqrt(rng());
  const a = rng() * Math.PI * 2;
  return {
    x: WORLD.center.x + r * Math.cos(a),
    y: WORLD.center.y + r * Math.sin(a),
  };
}

/** 造一批互相不冲突的手工 prev 项 */
function handcraftedPrev(): PlacedItem[] {
  return [
    { uid: 'd1-0-tape', id: 'tape', x: 720, y: 720, area: 'crash', spawnedDay: 1 },
    { uid: 'd1-1-wrench', id: 'wrench', x: 770, y: 720, area: 'crash', spawnedDay: 1 },
    { uid: 'd1-2-screw', id: 'screw', x: 1150, y: 720, area: 'junkyard', spawnedDay: 1 },
    { uid: 'd1-3-fuel', id: 'fuel', x: 720, y: 290, area: 'market', spawnedDay: 1 },
    { uid: 'd1-4-rock', id: 'rock', x: 290, y: 720, area: 'cave', spawnedDay: 1 },
  ];
}

// ───────────────────────── 几何 ─────────────────────────

describe('空间几何', () => {
  it('toPolar 以 +x 为 0°、+y 为 90°', () => {
    expect(toPolar(WORLD.center)).toEqual({ r: 0, deg: 0 });

    const east = toPolar({ x: WORLD.center.x + 100, y: WORLD.center.y });
    expect(east.r).toBeCloseTo(100, 6);
    expect(east.deg).toBeCloseTo(0, 6);

    const south = toPolar({ x: WORLD.center.x, y: WORLD.center.y + 100 });
    expect(south.deg).toBeCloseTo(90, 6);

    const west = toPolar({ x: WORLD.center.x - 50, y: WORLD.center.y });
    expect(west.r).toBeCloseTo(50, 6);
    expect(Math.abs(west.deg)).toBeCloseTo(180, 6);
  });

  it('areaOfPoint 认出四个区域，缝隙归最近扇区', () => {
    expect(areaOfPoint(WORLD.center)).toBe('crash');
    expect(areaOfPoint({ x: 760, y: 760 })).toBe('crash');
    expect(areaOfPoint({ x: 720 + 400, y: 720 })).toBe('junkyard');
    expect(areaOfPoint({ x: 720, y: 720 - 400 })).toBe('market');
    expect(areaOfPoint({ x: 720 - 400, y: 720 })).toBe('cave');

    // 45° 缝隙（东南）：最近的仍应是 junkyard 一侧
    const gap = { x: 720 + 300 * Math.cos(Math.PI / 4), y: 720 + 300 * Math.sin(Math.PI / 4) };
    expect(areaOfPoint(gap)).toBe('junkyard');
    // 135° 缝隙（西南）：归 cave
    const gap2 = { x: 720 - 300 * Math.cos(Math.PI / 4), y: 720 + 300 * Math.sin(Math.PI / 4) };
    expect(areaOfPoint(gap2)).toBe('cave');
  });

  it('sectorCenter 落在自己区域内且可走', () => {
    for (const area of ['crash', 'junkyard', 'market', 'cave'] as const) {
      const c = sectorCenter(area);
      expect(areaOfPoint(c), area).toBe(area);
      expect(inSector(c, area), area).toBe(true);
      expect(isWalkable(c), area).toBe(true);
    }
  });

  it('isWalkable / clampToWalkable', () => {
    expect(isWalkable(WORLD.center)).toBe(true);
    expect(isWalkable({ x: WORLD.center.x + 600, y: WORLD.center.y })).toBe(true);
    expect(isWalkable({ x: WORLD.center.x + 601, y: WORLD.center.y })).toBe(false);
    expect(isWalkable({ x: -100, y: -100 })).toBe(false);

    const inside = clampToWalkable({ x: 700, y: 700 });
    expect(inside).toEqual({ x: 700, y: 700 });

    const outside = clampToWalkable({ x: 5000, y: WORLD.center.y });
    expect(toPolar(outside).r).toBeCloseTo(WORLD.walkableRadius, 6);
    expect(outside.y).toBeCloseTo(WORLD.center.y, 6);

    const corner = clampToWalkable({ x: -500, y: -500 });
    expect(toPolar(corner).r).toBeLessThanOrEqual(WORLD.walkableRadius + 1e-6);
    expect(isWalkable(corner)).toBe(true);
  });
});

// ───────────────────────── 分布：基础约束 ─────────────────────────

describe('distribute 基础约束', () => {
  it('200 组随机参数的坐标、数量、间距、离角色距离都合法', () => {
    for (let i = 0; i < 200; i++) {
      const rng = mulberry32(9000 + i);
      const stage = (1 + (i % 3)) as 1 | 2 | 3;
      const player = randomWalkable(rng);
      const bag: Record<string, number> =
        i % 2 === 0 ? {} : { tape: 1, wrench: 1 };
      const world = distribute({
        progress: { stage, stepIndex: i % 3 },
        bag,
        day: 1 + i,
        rng,
        player,
        maxDist: i % 5 === 0 ? 320 : 400,
      });

      const label = `case ${i} (stage ${stage})`;
      expect(world.length, label).toBeGreaterThanOrEqual(WORLD.minItems);
      expect(world.length, label).toBeLessThanOrEqual(WORLD.maxItems);

      const uids = new Set<string>();
      for (const item of world) {
        expect(ITEM_MAP[item.id], `${label} 未知物品 ${item.id}`).toBeTruthy();
        expect(AREA_POOLS[item.area], `${label} 物品不在来源池 ${item.id}`).toContain(item.id);
        expect(inSector(item, item.area), `${label} ${item.uid} 不在 ${item.area} 扇区`).toBe(true);
        expect(toPolar(item).r, label).toBeLessThanOrEqual(WORLD.itemRadius + 1e-6);
        expect(areaOfPoint(item), `${label} ${item.uid} 归属区域不符`).toBe(item.area);
        expect(dist(item, player), `${label} ${item.uid} 离角色过近`).toBeGreaterThanOrEqual(
          WORLD.pickupRadius * 2 - 1e-6,
        );
        expect(item.uid, label).toMatch(/^d\d+-\d+-.+$/);
        expect(uids.has(item.uid), `${label} uid 重复 ${item.uid}`).toBe(false);
        uids.add(item.uid);
        expect(item.spawnedDay, label).toBe(1 + i);
      }

      for (let a = 0; a < world.length; a++) {
        for (let b = a + 1; b < world.length; b++) {
          expect(dist(world[a]!, world[b]!), `${label} 间距过近`).toBeGreaterThanOrEqual(
            WORLD.minSpacing - 1e-6,
          );
        }
      }
    }
  });

  it('同一 rng 序列 + 同一入参，两次调用深度相等', () => {
    const run = () =>
      distribute({
        progress: { stage: 2, stepIndex: 1 },
        bag: { tape: 1 },
        day: 5,
        rng: mulberry32(424242),
        player: { x: 900, y: 620 },
        maxDist: 380,
      });

    expect(run()).toEqual(run());
  });

  it('prev 里未拾取的项原样保留，只补空缺', () => {
    const prev = handcraftedPrev();
    const world = distribute({
      progress: { stage: 1, stepIndex: 0 },
      bag: {},
      day: 4,
      rng: mulberry32(7),
      prev,
      player: { x: 720, y: 720 },
    });

    expect(world.length).toBeGreaterThanOrEqual(WORLD.minItems);
    for (const old of prev) {
      const found = world.find((it) => it.uid === old.uid);
      expect(found, `prev ${old.uid} 丢了`).toEqual(old);
    }
    // 原有项的位置不能被改动
    expect(world.slice(0, prev.length)).toEqual(prev);
  });

  it('prev 已满 18 个时不再新增', () => {
    let full: PlacedItem[] | null = null;
    for (let seed = 1; seed <= 300 && !full; seed++) {
      const rng = mulberry32(seed);
      const w = distribute({
        progress: { stage: 3, stepIndex: 0 },
        bag: {},
        day: 1,
        rng,
        player: { x: 720, y: 720 },
      });
      if (w.length === WORLD.maxItems) full = w;
    }
    expect(full).not.toBeNull();

    const next = distribute({
      progress: { stage: 3, stepIndex: 0 },
      bag: {},
      day: 9,
      rng: mulberry32(11),
      prev: full!,
      player: { x: 720, y: 720 },
    });
    expect(next.length).toBe(WORLD.maxItems);
    expect(next).toEqual(full);
  });

  it('空 prev 时数量也在 [12,18]', () => {
    const world = distribute({
      progress: { stage: 1, stepIndex: 0 },
      bag: {},
      day: 1,
      rng: mulberry32(3),
      player: { x: 720, y: 720 },
    });
    expect(world.length).toBeGreaterThanOrEqual(WORLD.minItems);
    expect(world.length).toBeLessThanOrEqual(WORLD.maxItems);
  });

  it('stage 1 只解锁 crash，任何新点都不能落在垃圾山/集市/洞窟', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const world = distribute({
        progress: { stage: 1, stepIndex: seed % 3 },
        bag: {},
        day: seed,
        rng: mulberry32(seed),
        player: { x: 720, y: 720 },
      });
      for (const item of world) {
        expect(item.area, `seed ${seed}`).toBe('crash');
        expect(areaOfPoint(item), `seed ${seed}`).toBe('crash');
        expect(toPolar(item).r, `seed ${seed}`).toBeLessThanOrEqual(200 + 1e-6);
      }
    }
  });
});

// ───────────────────────── 硬保底 ─────────────────────────

describe('硬保底（确定性补齐，不是概率）', () => {
  const player: Vec2 = { x: 720, y: 720 };

  function run(
    stage: 1 | 2 | 3,
    stepIndex: number,
    bag: Record<string, number>,
    seed = 1,
    maxDist?: number,
  ): PlacedItem[] {
    return distribute({
      progress: { stage, stepIndex },
      bag,
      day: 2,
      rng: mulberry32(seed),
      player,
      ...(maxDist === undefined ? {} : { maxDist }),
    });
  }

  function hasTagWithin(world: PlacedItem[], tag: Tag, limit: number): boolean {
    return world.some(
      (it) => tagsOf(it.id).includes(tag) && dist(it, player) <= limit + 1e-6,
    );
  }

  it('缺「粘」时必定有一个粘性物品，且在 maxDist 内', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const world = run(1, 0, { battery: 1 }, seed);
      expect(hasTagWithin(world, '粘', 400), `seed ${seed}`).toBe(true);
    }
  });

  it('缺「导电」时必定有一个导电物品', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const world = run(1, 0, { tape: 1 }, seed);
      expect(hasTagWithin(world, '导电', 400), `seed ${seed}`).toBe(true);
    }
  });

  it('缺「金属」时必定有一个金属物品', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const world = run(1, 1, { tape: 1 }, seed);
      expect(hasTagWithin(world, '金属', 400), `seed ${seed}`).toBe(true);
    }
  });

  it('stage 2 缺「实体」时必定有一个实体物品', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const world = run(2, 0, {}, seed);
      expect(hasTagWithin(world, '实体', 400), `seed ${seed}`).toBe(true);
      // 重复标签不翻倍：['实体','实体'] 用并集判定，只需 1 个（CONTRACT-v2 §2.3）
      const count = world.filter((it) => tagsOf(it.id).includes('实体')).length;
      expect(count, `seed ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('保底点受 maxDist 约束（角色偏离中心时也成立）', () => {
    const far = { x: 720 + 250, y: 720 + 250 };
    const world = distribute({
      progress: { stage: 2, stepIndex: 1 },
      bag: {},
      day: 6,
      rng: mulberry32(31),
      player: far,
      maxDist: 300,
    });
    for (const tag of ['导电', '金属'] as const) {
      const ok = world.some(
        (it) => tagsOf(it.id).includes(tag) && dist(it, far) <= 300 + 1e-6,
      );
      expect(ok, tag).toBe(true);
    }
  });

  it('几何上够不到 maxDist 时退化为最近合法点，且不越界到锁定区', () => {
    const edge = { x: WORLD.center.x + 590, y: WORLD.center.y };
    const world = distribute({
      progress: { stage: 1, stepIndex: 0 },
      bag: {},
      day: 8,
      rng: mulberry32(77),
      player: edge,
      // crash 圆盘最近也在 390 外，maxDist=200 几何上不可达
      maxDist: 200,
    });

    const sticky = world.filter((it) => tagsOf(it.id).includes('粘'));
    expect(sticky.length).toBeGreaterThan(0);
    for (const it of sticky) {
      expect(it.area).toBe('crash');
      expect(toPolar(it).r).toBeLessThanOrEqual(200 + 1e-6);
    }
    // 理论最近 390（角色 r=590，crash 边 r=200 同向），退化成最近点而不是随便扔一个
    const nearest = Math.min(...sticky.map((it) => dist(it, edge)));
    expect(nearest).toBeLessThanOrEqual(420);
  });

  it('保底物品必须落在已解锁区域（stage 1 不能出现在其它区域）', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const world = run(1, 0, {}, seed);
      const sticky = world.filter((it) => tagsOf(it.id).includes('粘'));
      expect(sticky.length).toBeGreaterThan(0);
      for (const it of sticky) {
        expect(it.area, `seed ${seed}`).toBe('crash');
        expect(isWalkable(it), `seed ${seed}`).toBe(true);
      }
    }
  });
});

// ───────────────────────── 配置错误（模块 mock，不改真实数据） ─────────────────────────

describe('配置错误暴露', () => {
  it('标签在全星球任何池里都不存在时 throw，消息带标签名', async () => {
    expect(
      Object.values(AREA_POOLS)
        .flat()
        .some((id) => tagsOf(id).includes('能挡风')),
      '「能挡风」只存在于中间产物，不该出现在任何基础池',
    ).toBe(false);

    vi.resetModules();
    vi.doMock('../src/search', async () => {
      const actual = await vi.importActual<typeof import('../src/search')>(
        '../src/search',
      );
      return { ...actual, missingForBag: () => ['能挡风'] };
    });

    const worldMod = await import('../src/world');
    expect(() =>
      worldMod.distribute({
        progress: { stage: 1, stepIndex: 0 },
        bag: {},
        day: 1,
        rng: mulberry32(1),
        player: { x: 720, y: 720 },
      }),
    ).toThrow(/能挡风/);

    vi.doUnmock('../src/search');
    vi.resetModules();
  });

  it('所有区域池都为空时 throw，消息带标签名', async () => {
    vi.resetModules();
    vi.doMock('../src/stages', async () => {
      const actual = await vi.importActual<typeof import('../src/stages')>(
        '../src/stages',
      );
      return {
        ...actual,
        AREA_POOLS: { crash: [], junkyard: [], market: [], cave: [] },
      };
    });

    const worldMod = await import('../src/world');
    expect(() =>
      worldMod.distribute({
        progress: { stage: 1, stepIndex: 0 },
        bag: {},
        day: 1,
        rng: mulberry32(1),
        player: { x: 720, y: 720 },
      }),
    ).toThrow(/导电/);

    vi.doUnmock('../src/stages');
    vi.resetModules();
  });

  it('标签只存在于未解锁区域时不 throw，也不越界刷进锁定区', async () => {
    vi.resetModules();
    vi.doMock('../src/search', async () => {
      const actual = await vi.importActual<typeof import('../src/search')>(
        '../src/search',
      );
      return { ...actual, missingForBag: () => ['能烧'] };
    });

    const worldMod = await import('../src/world');
    const world = worldMod.distribute({
      progress: { stage: 1, stepIndex: 0 },
      bag: {},
      day: 1,
      rng: mulberry32(1),
      player: { x: 720, y: 720 },
    });
    // 能烧只在 market 池里，stage 1 未解锁 → 不能保底，但也不能报错
    expect(world.every((it) => it.area === 'crash')).toBe(true);
    expect(world.length).toBeGreaterThanOrEqual(WORLD.minItems);

    vi.doUnmock('../src/search');
    vi.resetModules();
  });
});

// ───────────────────────── 10 万次贪心游玩 ─────────────────────────

interface SimResult {
  crafts: number;
  collections: number;
}

function assertSize(size: number, seed: number, when: string): void {
  if (size < WORLD.minItems || size > WORLD.maxItems) {
    throw new Error(`seed ${seed}: ${when}地面数量 ${size} 越界`);
  }
}

/**
 * 贪心策略：缺什么就去地上拿什么，凑齐当前步骤就合成。
 * 全程不用深拷贝，循环里只做最省分配的判断。
 */
function simulate(seed: number): SimResult {
  const rng = mulberry32(seed);
  const bag: Record<string, number> = {};
  let stage: 1 | 2 | 3 = 1;
  let stepIndex = 0;
  let day = 1;
  let player: Vec2 = { x: WORLD.center.x, y: WORLD.center.y };
  let world = distribute({ progress: { stage, stepIndex }, bag, day, rng, player });
  assertSize(world.length, seed, '初始');

  let crafts = 0;
  let collections = 0;
  let guard = 0;

  while (stage < 3) {
    if (++guard > 400) throw new Error(`seed ${seed}: 迭代次数超限`);

    const def = STAGES[stage - 1]!;
    const step = def.steps[stepIndex]!;
    const r0 = step.requires[0]!;
    const r1 = step.requires[step.requires.length - 1]!;

    const ids: string[] = [];
    for (const id in bag) if ((bag[id] ?? 0) > 0) ids.push(id);

    let rep0: string | undefined;
    let rep1: string | undefined;
    for (const id of ids) {
      const tags = TAG_SETS.get(id)!;
      if (rep0 === undefined && tags.has(r0)) rep0 = id;
      if (rep1 === undefined && tags.has(r1)) rep1 = id;
    }

    let a: string | undefined;
    let b: string | undefined;
    if (rep0 !== undefined && rep1 !== undefined) {
      if (rep0 !== rep1) {
        a = rep0;
        b = rep1;
      } else if ((bag[rep0] ?? 0) >= 2) {
        a = rep0;
        b = rep0;
      } else {
        for (const id of ids) {
          if (id !== rep0) {
            a = rep0;
            b = id;
            break;
          }
        }
      }
    }

    if (a !== undefined && b !== undefined) {
      bag[a] = (bag[a] ?? 0) - 1;
      bag[b] = (bag[b] ?? 0) - 1;
      bag[step.output] = (bag[step.output] ?? 0) + 1;
      crafts++;

      stepIndex++;
      if (stepIndex >= def.steps.length) {
        stage = (stage + 1) as 1 | 2 | 3;
        stepIndex = 0;
      }
      day++;
      if (stage < 3) {
        world = distribute({ progress: { stage, stepIndex }, bag, day, rng, player });
        assertSize(world.length, seed, `阶段 ${stage} 第 ${stepIndex} 步刷新后`);
      }
      continue;
    }

    // 还差哪个标签。null 表示「同一物品覆盖了全部标签但只有一个，再来任意一个就能合」
    let needTag: Tag | null = null;
    if (rep0 === undefined) needTag = r0;
    else if (rep1 === undefined) needTag = r1;

    let pick = -1;
    if (needTag === null) {
      pick = world.length > 0 ? 0 : -1;
    } else {
      for (let i = 0; i < world.length; i++) {
        if (TAG_SETS.get(world[i]!.id)!.has(needTag)) {
          pick = i;
          break;
        }
      }
    }
    if (pick < 0) {
      throw new Error(
        `seed ${seed}: 阶段 ${stage} 第 ${stepIndex} 步，地面没有${
          needTag === null ? '可用的' : `带「${needTag}」的`
        }可推进物品`,
      );
    }

    const target = world[pick]!;
    bag[target.id] = (bag[target.id] ?? 0) + 1;
    player = { x: target.x, y: target.y };
    world.splice(pick, 1);
    collections++;
  }

  return { crafts, collections };
}

describe('10 万次随机游玩模拟', () => {
  it(
    '贪心策略 100% 通关，且任何时刻地面都存在可推进物品',
    () => {
      const failures: string[] = [];
      let maxCrafts = 0;

      for (let seed = 1; seed <= 100000; seed++) {
        try {
          const r = simulate(seed);
          if (r.crafts > maxCrafts) maxCrafts = r.crafts;
        } catch (err) {
          failures.push((err as Error).message);
          if (failures.length >= 5) break;
        }
      }

      expect(failures).toEqual([]);
      // 阶段 1、2 共 6 步，正常 6 次合成通关
      expect(maxCrafts).toBe(6);
    },
    120000,
  );
});
