# 资产清单与校验

> 归属：T2（世界资产）。本文件登记**资产的一致性约束与校验入口**；
> 全量逐资产规格（尺寸/格式/AI 提示词/引用关系）留批 5 补齐。

## 校验命令

```bash
node scripts/check-assets.mjs
```

零依赖（只用 node 内置模块），CI 与本地同一份。任一断言失败 `exit 1` 并打差异表。

| 断言 | 内容 | 历史教训 |
|---|---|---|
| **A** | `PALETTE` / `ALPHA`（`apps/web/src/world/assets/palette.ts`）与 `tokens.css` 的 `:root` 逐键相等，`var()` 只允许一层别名 | 纹理路径读不到 CSS 变量，色值必然有第二份拷贝；不同步 = 背包图标和地面贴纸不同色 |
| **B** | `items.ts` 每件物品的 `icon:` 在 `SHAPE_OF` 有键，且查到的形状真实存在 | v1 的 `SHAPE_OF` 混了 56 个**物品 id**，运行时查 `item.icon`，7 件物品落进 `blob` |
| **C** | 每个 `ShapeName` 至少被 1 件物品用到（无孤立形状） | 孤立形状 = 画了没人用，或改表时漏改 |
| **D** | 80 件物品映射出的 `(形状, 颜色)` 组合数 = 80 | 同形状 + 同颜色 = 玩家看不出区别 |

## 当前状态（2026-10-21 实测，`node scripts/check-assets.mjs`）

| 项 | 数量 |
|---|---|
| 物品 | 80 |
| 几何形状（`SHAPES`） | 45（v1 的 39 个路径原样保留 + 新增 `book` / `ticket` / `map` / `bar` / `blob2` / `page`） |
| icon 键（`SHAPE_OF`） | 60 |
| 颜色令牌 | 116（`tokens.css` 的 `:root`） |

**断言 A–D 全部通过**：80 件物品的 `(形状, 颜色)` 组合数 = 80，两两唯一，无撞脸。

### 历史撞脸已解决

`homework`（外星小孩的物理作业）与 `wastepaper`（一页废纸）曾在 `items.ts` 里
**`icon` 和 `color` 完全相同**（`paper` / `mint`），导致断言 D 停在 59/60。

已按**出路 1（改数据）**修复：`wastepaper.icon: 'paper' → 'page'`，并补了 `page` 形状
（空白页 + 折角 + 透印线）。改完 D 回到 80/80，且「废纸」和「作业」在视觉上真的不同。

## TODO（批 5）

- [ ] 逐资产规格表：`planet` / `terrain`（patch、hill、rock、pit）/ `props`（每区域地标）/ `player`（6 帧 × 4 向）/ `fog`
- [ ] 每个资产的 AI 生成提示词与人工修正记录
- [ ] 地形与地标的尺寸/锚点/可读性下限（28 单位下必须靠轮廓可辨）
- [ ] 主资产清单：文件路径、导出名、消费者（T3/T4）、状态
