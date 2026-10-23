/**
 * 纪念物绘制（乐趣改版 ⑤）：火箭剪影 + 基地景物。
 *
 * - 火箭立在坠毁点旁边：虚位轮廓（目标）永远可见，四段随飞船支线进度逐段实心——
 *   「家当在长出来」的视觉锚，走到哪都能瞥见。
 * - 基地景物按 `save.built` 摆放，位置固定（lib/monuments.ts BASE_PROPS）。
 * - 新段 / 新景物出现时做一次 pop-in（0.35s 弹到 1），由帧循环 tick 驱动。
 *
 * 绘制风格与 layers.ts 一致：链式 `path().fill({color}).stroke({width,color})`。
 * 世界层只读：容器 eventMode='none'，不接指针。
 */
import { Container, Graphics } from 'pixi.js';
import { WORLD } from '@haola/game-core';
import { INK, PALETTE, PAPER } from './assets/palette';
import { BASE_PROPS, type PropKind } from '../lib/monuments';

export interface MonumentView {
  /** 飞船已完成的槽数 0–4 */
  rocket: number;
  /** 已落地成景的 prop id（BASE_PROPS 的 key） */
  props: string[];
}

const POP_MS = 350;
const STROKE = { width: 2, color: INK };

/** 火箭摆放点：坠毁点右上方，不挡出生点 */
const ROCKET_POS = { x: WORLD.center.x + 95, y: WORLD.center.y - 65 };

/** 一段箭体，返回该段高度。g 以「段底部中点」为原点向上画 */
function drawSegment(
  g: Graphics,
  kind: 'engine' | 'hull' | 'tank' | 'nose',
  accent: string,
): number {
  switch (kind) {
    case 'engine': {
      g.beginPath();
      g.moveTo(-13, 0);
      g.lineTo(-9, -22);
      g.lineTo(9, -22);
      g.lineTo(13, 0);
      g.closePath();
      g.fill({ color: PAPER }).stroke(STROKE);
      g.beginPath();
      g.moveTo(-13, 0);
      g.lineTo(-9, -6);
      g.lineTo(9, -6);
      g.lineTo(13, 0);
      g.closePath();
      g.fill({ color: accent }).stroke(STROKE);
      return 22;
    }
    case 'hull': {
      g.roundRect(-11, -40, 22, 40, 4);
      g.fill({ color: PAPER }).stroke(STROKE);
      g.beginPath();
      g.arc(0, -14, 5, 0, Math.PI * 2);
      g.fill({ color: accent }).stroke(STROKE);
      return 40;
    }
    case 'tank': {
      g.roundRect(-11, -34, 22, 34, 4);
      g.fill({ color: PAPER }).stroke(STROKE);
      g.beginPath();
      g.arc(-4, -20, 4, 0, Math.PI * 2);
      g.fill({ color: accent }).stroke(STROKE);
      g.beginPath();
      g.arc(5, -12, 3, 0, Math.PI * 2);
      g.fill({ color: accent }).stroke(STROKE);
      return 34;
    }
    case 'nose': {
      g.beginPath();
      g.moveTo(-11, 0);
      g.quadraticCurveTo(0, -34, 11, 0);
      g.closePath();
      g.fill({ color: PAPER }).stroke(STROKE);
      g.beginPath();
      g.moveTo(0, -30);
      g.lineTo(0, -44);
      g.stroke(STROKE);
      g.beginPath();
      g.arc(0, -46, 3.5, 0, Math.PI * 2);
      g.fill({ color: accent }).stroke(STROKE);
      return 46;
    }
  }
}

/** 段顺序（从下往上）：动力→外壳→生命维持→导航 */
const SEG_KINDS = ['engine', 'hull', 'tank', 'nose'] as const;
const SEG_ACCENTS = [PALETTE.orange, PALETTE.mint, PALETTE.yellow, PALETTE.purple];

function buildGhost(): Graphics {
  const ghost = new Graphics();
  ghost.beginPath();
  ghost.moveTo(-14, 0);
  ghost.lineTo(-9, -22);
  ghost.lineTo(-12, -30);
  ghost.lineTo(-12, -74);
  ghost.lineTo(-11, -80);
  ghost.quadraticCurveTo(0, -122, 11, -80);
  ghost.lineTo(12, -74);
  ghost.lineTo(12, -30);
  ghost.lineTo(9, -22);
  ghost.lineTo(14, 0);
  ghost.closePath();
  ghost.stroke({ width: 1.5, color: INK, alpha: 0.3 });
  // 虚线感：用底色小矩形打断左右轮廓
  for (let y = 8; y < 116; y += 12) {
    ghost.rect(-16, -y, 3, 5);
    ghost.rect(13, -y, 3, 5);
  }
  ghost.fill({ color: PALETTE.cream });
  return ghost;
}

function buildRocket(done: number): Container {
  const c = new Container();
  c.position.set(ROCKET_POS.x, ROCKET_POS.y);
  c.addChild(buildGhost());

  let y = 0;
  for (let i = 0; i < done; i++) {
    const g = new Graphics();
    const h = drawSegment(g, SEG_KINDS[i]!, SEG_ACCENTS[i]!);
    g.position.set(0, -y);
    c.addChild(g);
    y += h;
  }
  return c;
}

function buildProp(kind: PropKind): Container {
  const g = new Graphics();
  switch (kind) {
    case 'windbreak': {
      g.roundRect(-26, -26, 52, 26, 3);
      g.fill({ color: PAPER }).stroke(STROKE);
      for (let i = 0; i < 3; i++) g.rect(-20 + i * 16, -20, 8, 14);
      g.fill({ color: PALETTE.orange }).stroke(STROKE);
      break;
    }
    case 'shelter': {
      g.beginPath();
      g.moveTo(-28, 0);
      g.quadraticCurveTo(0, -44, 28, 0);
      g.closePath();
      g.fill({ color: PAPER }).stroke(STROKE);
      g.roundRect(-8, -18, 16, 18, 2);
      g.fill({ color: PALETTE.mint }).stroke(STROKE);
      break;
    }
    case 'bed': {
      g.beginPath();
      g.moveTo(-24, -14);
      g.lineTo(-24, -24);
      g.stroke(STROKE);
      g.roundRect(-24, -14, 48, 14, 3);
      g.fill({ color: PAPER }).stroke(STROKE);
      g.roundRect(-20, -22, 14, 9, 2);
      g.fill({ color: PALETTE.pink }).stroke(STROKE);
      break;
    }
    case 'generator': {
      g.rect(-6, -42, 8, 12);
      g.fill({ color: PALETTE.yellow }).stroke(STROKE);
      g.roundRect(-20, -30, 40, 30, 3);
      g.fill({ color: PAPER }).stroke(STROKE);
      g.beginPath();
      g.arc(0, -15, 6, 0, Math.PI * 2);
      g.fill({ color: PALETTE.yellow }).stroke(STROKE);
      break;
    }
    case 'hourglass': {
      g.beginPath();
      g.moveTo(-8, 0);
      g.lineTo(-3, -34);
      g.lineTo(3, -34);
      g.lineTo(8, 0);
      g.closePath();
      g.fill({ color: PAPER }).stroke(STROKE);
      g.beginPath();
      g.moveTo(-3, -26);
      g.lineTo(0, -8);
      g.lineTo(3, -26);
      g.closePath();
      g.fill({ color: PALETTE.purple }).stroke(STROKE);
      break;
    }
    case 'notice': {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -22);
      g.stroke(STROKE);
      g.roundRect(-14, -44, 28, 24, 2);
      g.fill({ color: PAPER }).stroke(STROKE);
      g.rect(-9, -39, 18, 3);
      g.rect(-9, -33, 12, 3);
      g.fill({ color: PALETTE.orange });
      break;
    }
    case 'shop': {
      g.roundRect(-26, -28, 52, 28, 2);
      g.fill({ color: PAPER }).stroke(STROKE);
      for (let i = 0; i < 4; i++) {
        g.rect(-26 + i * 13, -36, 13, 8);
        g.fill({ color: i % 2 === 0 ? PALETTE.pink : PAPER }).stroke(STROKE);
      }
      break;
    }
    case 'beacon': {
      g.beginPath();
      g.moveTo(-6, 0);
      g.lineTo(-2, -40);
      g.moveTo(6, 0);
      g.lineTo(2, -40);
      g.stroke(STROKE);
      g.roundRect(-9, -18, 18, 18, 2);
      g.fill({ color: PAPER }).stroke(STROKE);
      g.beginPath();
      g.arc(0, -46, 6, 0, Math.PI * 2);
      g.fill({ color: PALETTE.yellow }).stroke(STROKE);
      break;
    }
  }
  return g;
}

export function createMonumentsLayer(): {
  root: Container;
  sync: (view: MonumentView) => void;
  tick: () => void;
} {
  const root = new Container();
  root.eventMode = 'none';

  let rocketNode: Container | null = null;
  let rocketSegments = -1;
  const pops: { node: Container; at: number }[] = [];
  const propNodes = new Map<string, Container>();

  function popIn(node: Container) {
    node.scale.set(0.55);
    pops.push({ node, at: performance.now() });
  }

  function sync(view: MonumentView) {
    if (view.rocket !== rocketSegments) {
      rocketSegments = view.rocket;
      if (rocketNode) {
        root.removeChild(rocketNode);
        rocketNode.destroy({ children: true });
      }
      rocketNode = buildRocket(rocketSegments);
      root.addChild(rocketNode);
      if (rocketSegments > 0) popIn(rocketNode);
    }

    // 增量同步 props（built 单调递增，只增不删）
    for (const id of view.props) {
      if (propNodes.has(id)) continue;
      const spec = BASE_PROPS[id];
      if (!spec) continue;
      const node = buildProp(spec.kind);
      node.position.set(WORLD.center.x + spec.dx, WORLD.center.y + spec.dy);
      root.addChild(node);
      propNodes.set(id, node);
      popIn(node);
    }
  }

  function tick() {
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]!;
      const t = Math.min(1, (performance.now() - p.at) / POP_MS);
      const ease = 1 - Math.pow(1 - t, 3);
      p.node.scale.set(0.55 + 0.45 * ease);
      if (t >= 1) pops.splice(i, 1);
    }
  }

  return { root, sync, tick };
}
