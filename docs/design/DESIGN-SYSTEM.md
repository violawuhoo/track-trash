# 《好垃》设计系统 v2.0

> 归属：T1（视觉线）。写入 `apps/web/src/styles/tokens.css`、`docs/design/DESIGN-SYSTEM.md`、`docs/design/preview.html`。
> 上游：`docs/REDESIGN.md` §3、`docs/CONTRACT-v2.md`、`docs/TASKS-v2.md` §0。
> 下游：T2（世界资产）、T3（Pixi 层）、T4（UI 层）、T6（内容）。
> 冲突时优先级：`CONTRACT-v2.md` > 本文件 > `REDESIGN.md`。本文件与 `REDESIGN.md` 的差异都写在 §13 的裁决里。

---

## 0. 这份文档解决什么

T2 要画 60+ 个 SVG，T4 要写 6 个组件、3 个断点。如果每个人自己挑字号、自己定间距，最后会出现 12.5px 和 13px 混用、圆角 14 和 16 混用、十种透明度——不是风格问题，是没法验收。

所以本文只做三件事：

1. **把视觉判断变成可枚举的令牌**（`tokens.css` 里每个变量都在本文有用途说明）。
2. **把"什么时候算危险态""文字压在橙色上能不能读"这类判断写成规则**，而不是让下一个人凭感觉。
3. **把 v1 遗留的硬编码逐条列成可勾选的改造清单**（§14，17 条），T4 照着改，不用重新理解设计。

设计原则三条，后面所有规则都是它们的推论：

| 原则 | 含义 | 违反的表现 |
|---|---|---|
| **纸与墨** | 一切视觉是"印在纸上"：不透明色块、实心偏移投影、3px 墨黑描边 | 出现渐变、模糊、发光、半透明玻璃感 |
| **颜色必须双编码** | 颜色只做强调，信息永远同时由文字/形状/描边承载 | 只靠红绿区分危险/选中 |
| **可读性优先于氛围** | 16px 正文、4.5:1 对比、44px 热区不为了让画面"更酷"让步 | 12px 灰字、半透明底上的小字 |

---

## 1. 色彩

### 1.1 基础色盘（冻结，不新增色相）

| 令牌 | 值 | 用途 | 禁止用在哪 |
|---|---|---|---|
| `--cream` | `#f7f0e0` | 页面底、世界外太空之外的 UI 底 | 不要用来做卡片底（会被 `--paper` 卡片吃掉层次） |
| `--cream-deep` | `#ece1c9` | 次级面：合成台内胆、禁用底、太空 | 不要用来做正文底 |
| `--ink` | `#1a1a1a` | 描边、正文、深色控件底 | 不要用于大面积填充（会把画面压死） |
| `--paper` | `#fffdf7` | 卡片、贴纸、星球表面、深底上的文字 | — |
| `--orange` | `#ff6b35` | **主操作**、危险描边、进度条、选中物品的警示 | **不能做选中色**（见 §9）；不能配白字（对比 2.8:1） |
| `--mint` | `#4ecdc4` | **选中**、成功、帮助角标 | 不能做危险色 |
| `--purple` | `#9b6bff` | 稀有物、极少量的强调 | 不做大面积背景 |
| `--pink` | `#ff8fab` | **含图形的危险控件底**（§9 变体 B） | 不做纯文字危险控件底 |
| `--yellow` | `#ffd166` | Toast、数量角标、提示 | 不做主按钮 |

### 1.2 世界中性阶（本版本唯一新增的实体色）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--space` | `var(--cream-deep)` = `#ece1c9` | 星球外的太空 |
| `--planet` | `var(--paper)` = `#fffdf7` | 星球表面 |
| `--planet-shade` | `#f1e6d0` | 地面斑块、山体暗面、**贴地投影** |
| `--void` | `rgba(26,26,26,.35)` | 未解锁扇区雾障（= ink 35%） |

**为什么太空必须是浅色**：3px 墨黑描边是这个项目的全部识别度来源。深色太空会让描边消失，贴纸变成"漂浮的色块"；而且手机上大面积深底 + 小字，在户外光下基本不可读。浅色太空 = 一张旧纸上画了个圆，成本低、识别度高。

**为什么只加一个不透明中性色**：`--planet-shade` 同时承担"地面斑块"和"贴地投影"两个角色，是因为它们在视觉上必须是同一个颜色——投影比地面暗一档才会被认为是"同一张纸上的阴影"。再加第四阶就会开始出现脏灰。

### 1.3 文字色阶与对比度（实测值，底为 `--cream`）

| 令牌 | 值 | 对比度 | 允许承载 |
|---|---|---|---|
| `--ink` | `#1a1a1a` | **15.3:1** | 任意字号正文 |
| `--ink-soft` | `rgba(26,26,26,.62)` | **4.7:1** | 16px 正文、次级说明（AA 通过） |
| `--ink-faint` | `rgba(26,26,26,.5)` | **3.2:1** | 仅 ≥19px 粗体、图标、非文本边框；**禁止承载信息性正文** |
| `--rule` | `rgba(26,26,26,.15)` | 非文本 | 2px 分隔线、虚线 |
| `--scrim` | `rgba(26,26,26,.55)` | 非文本 | 浮层遮罩 |

**为什么用颜色而不是 `opacity`**：v1 的 `.muted { opacity: .62 }` 会把子元素一起压淡，且审计对比度时无法单独测量。改成 `color: var(--ink-soft)` 后，子元素不受影响，对比度可验证。

**荧光底色上只能放墨黑文字**（实测）：

| 组合 | 对比度 | 结论 |
|---|---|---|
| ink on orange | 6.1:1 | ✅ |
| paper on orange | 2.8:1 | ❌ 连大字都不够 |
| ink on pink | 8.1:1 | ✅ |
| ink on mint | 9.0:1 | ✅ |
| ink on yellow | 12.1:1 | ✅ |
| ink on purple | 4.9:1 | ✅ |
| paper on ink | 15.3:1 | ✅ |

所以规则是：**荧光色一律当底，墨黑当字；墨黑底才配纸白字。** 这条直接改掉了 v1 的 `.btn--primary`（详见 §14 第 5 条）。

---

## 2. 描边与投影

| 令牌 | 值 | 用在哪 |
|---|---|---|
| `--stroke` | 3px | UI 主描边：卡片、按钮、浮层、贴纸 |
| `--stroke-thin` | 2px | 标签、角标、进度条、分隔、槽内框 |
| `--stroke-hair` | 1px | 世界层内部细节（SVG，非 UI） |
| `--shadow` | `4px 4px 0 ink` | UI 卡片抬升。**语义冻结**：UI 层专用 |
| `--shadow-sm` | `2px 2px 0 ink` | 贴纸、胶囊、chip |
| `--shadow-press` | `1px 1px 0 ink` | 按压后残余投影 |
| `--shadow-sheet` | `6px 6px 0 ink` | 浮层卡片（离开纸面更远） |
| `--shadow-item` | `0 3px 0 planet-shade` | 世界层贴地投影，**不用墨黑** |

三条硬规则：

1. **投影是实心偏移色块**，`x/y` 同号同值，**没有 blur、没有 spread**。`box-shadow: 0 0 0 3px` 这种"环"不算投影，它是描边的另一种写法——但本规范统一改用 `outline`，因为它不参与盒模型、不会被 `overflow: hidden` 裁掉。
2. **按压 = 向投影方向位移 + 投影缩小**，两个动作必须同时出现，只做其中一个会显得"按钮没按下去"。
3. **世界层的阴影永远不是墨黑**。物件是"放在纸上"的，不是"举在纸上"的；用 `--planet-shade` 的 3px 向下偏移表示接触，墨黑投影会变成卡片。

---

## 3. 字体与字号阶

字体族沿用 v1（系统字体栈，不引外部字体文件，符合"全部内联"约束）。

| 令牌 | 值 | 用途 |
|---|---|---|
| `--fs-display` | `clamp(64px, 22vw, 96px)` | 开始页标题 |
| `--fs-ending` | `clamp(36px, 12vw, 54px)` | 结局页标题 |
| `--fs-h2` | 22px | 浮层标题 |
| `--fs-h3` | 19px | HUD 数字、槽位"+" |
| `--fs-body` | **16px** | 正文基准 |
| `--fs-sm` | 14px | 面板标题、对话正文 |
| `--fs-xs` | 13px | 描述、日志、Toast 正文 |
| `--fs-2xs` | 12px | 标签、HUD 单位、物品名 |
| `--fs-nano` | 11px | 数量角标、全大写 kicker（唯一允许 11px 的场景） |

行高：`--lh-display: .92` / `--lh-tight: 1.2` / `--lh-ui: 1.4` / `--lh-body: 1.7`。
字距：`--ls-tight: -.03em`（大标题）/ `--ls-label: .16em`（小标签）/ `--ls-kicker: .28em` / `--ls-stamp: .3em`（盖章）。

**为什么基准是 16px 而不是 15px**：15px 是桌面阅读尺度，手机上会让中文行显得挤；16px 同时是 iOS 表单不触发自动放大的阈值。代价是全局重排（§14 第 1 条），必须一次性做完，不能只改 `body` 让其余部分半新半旧。

**为什么删掉 12.5 / 13.5 / 14 这些中间值**：v1 里同时存在 11/12/12.5/13/13.5/14/15/19 八个字号，肉眼看不出层级差别，却让对齐永远差半像素。收敛成 5 档之后，"这个字该多大"不再需要判断。

**14px 是下限**：低于 14px 的文字只允许出现在角标、kicker 这类"非阅读性"位置，且必须有 `aria-label` 或视觉冗余。

---

## 4. 间距阶

`--sp-*`，4 的倍数，只允许这 12 个值：

| 令牌 | 值 | 典型用途 |
|---|---|---|
| `--sp-1` | 4px | 图标与文字、标签内间隙 |
| `--sp-2` | 8px | 紧凑行间、HUD 内距 |
| `--sp-3` | 12px | **默认内距**（卡片、抽屉、按钮水平） |
| `--sp-4` | 16px | 浮层内距、区块间距 |
| `--sp-5` | 20px | 卡片大内距 |
| `--sp-6` | 24px | 区块之间 |
| `--sp-8` | 32px | 屏幕左右留白 |
| `--sp-10` | 40px | 开始/结局页上下留白 |
| `--sp-12` | 48px | 大区块 |
| `--sp-16` | 64px | 分屏留白 |
| `--sp-20` | 80px | — |
| `--sp-24` | 96px | — |

**为什么改名 `--sp-*`**：颜色里已经有 `--space`（太空），`--space-3` 会被读成"太空色第 3 阶"。间距用 `--sp-` 前缀，检索时 `--sp` 与 `--space` 也不会互相污染。

**为什么不再允许 6/10/14/18**：v1 有 5/6/7/9/10/11/13/18 八种零碎值，它们是"手调出来的"而不是"选出来的"。收敛到 4 的倍数之后，垂直节奏自然对齐，`shots/` 对比也能看出差别。

---

## 5. 圆角

| 令牌 | 值 | 用在哪 |
|---|---|---|
| `--radius-ui` | `var(--radius)` = 16px | UI 卡片默认（新代码用这个别名） |
| `--radius-xs` | 10px | 印章、小块 |
| `--radius-sm` | 12px | 按钮、目标条、结局行 |
| `--radius-md` | 14px | 物品贴纸、合成槽 |
| `--radius-lg` | 20px | 场景框、合成台内胆 |
| `--radius-xl` | 22px | 浮层卡片 |
| `--radius-pill` | 999px | 标签、进度条、角标、chip |

**为什么按钮 12 而卡片 16**：小元素用大圆角会显得"软糖"，大元素用小圆角会显得"硌"。圆角随尺寸增大是唯一能自动成立的规则。

---

## 6. 层级

| 令牌 | 值 | 层 |
|---|---|---|
| `--z-world` | 0 | Pixi canvas |
| `--z-ground` / `--z-items` / `--z-actors` / `--z-fx` | 1–4 | Pixi 内部五层顺序（TS 常量，与 CSS 同值） |
| `--z-grain` | 30 | 噪点层（世界之上、UI 之下） |
| `--z-hud` | 40 | HUD |
| `--z-hint` | 45 | 左下提示条 |
| `--z-dialogue` | 50 | 对话条 |
| `--z-drawer` | 100 | 背包抽屉 |
| `--z-toast` | 200 | Toast |
| `--z-sheet` | 300 | 物品描述浮层 |

**颗粒层从 999 降到 30**：v1 的噪点压在所有 UI 之上（含浮层正文）。7.5% 的噪点在 16px 中文上会明显降低边缘清晰度，而它对氛围的贡献主要发生在世界层。**纹理让位给文字。**

---

## 7. 动效

| 令牌 | 值 | 用在哪 |
|---|---|---|
| `--dur-1` | 90ms | 按压、描边/颜色切换 |
| `--dur-2` | 180ms | 浮层进出、抽屉开合、Toast |
| `--dur-3` | 260ms | 拾取飞入、进度条 |
| `--dur-4` | 400ms | 刷新生长、雾障渐显 |
| `--dur-loop` | 1200ms | 循环动效（高亮浮动、光标闪烁） |
| `--ease-out` | `cubic-bezier(.2,.8,.3,1)` | 进入、位移收尾 |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | 退出 |
| `--ease-linear` | `linear` | 匀速移动（小人走路） |

**减少动效**：`tokens.css` 末尾的 `@media (prefers-reduced-motion: reduce)` 把五档时长全部压到 **1ms**。

用 1ms 而不是 0s，是因为 `transitionend` / `animationend` 在 0s 时部分浏览器不触发，依赖回调的状态机会卡住。同时**保留 transform 位移**（只缩短时长），否则"按下去"的触觉反馈消失——减少动效不等于去掉反馈。

---

## 8. 尺寸令牌

| 令牌 | 值 | 说明 |
|---|---|---|
| `--tap-min` | 44px | **热区下限**，不是视觉尺寸 |
| `--btn-h` | 46px | 按钮视觉高 |
| `--hud-h` | 36px | HUD 视觉高（热区靠 padding 补到 44） |
| `--dialogue-h-collapsed` | 44px | 对话条收起 |
| `--dialogue-h-expanded` | 80px | 对话条展开（2 行 14px/1.7 + padding + 边框） |
| `--pick-btn` | 56px | 右下"拾取附近"直径 |
| `--item-card-w` | 84px | 背包卡片 |
| `--item-card-w-narrow` | 76px | ≤380px 视口 |
| `--item-icon-card` | 40px | 卡片图标 |
| `--item-world` / `-min` / `-max` | 32 / 28 / 36 | 地面贴纸（契约区间） |
| `--avatar` | 34px | 对话头像 |
| `--player-w` / `--player-h` | 24 / 36 | 小人（世界单位） |
| `--slot-h` | 62px | 合成槽 |
| `--drawer-w` / `--sidebar-w` | 420 / 320px | 平板抽屉 / 网页侧栏 |
| `--shell-max` | 560px | v1 DOM 布局宽度上限（过渡期保留） |

**热区与视觉分离**：HUD 视觉高 36px 是为了不挡住世界，但可点区域必须 44px。做法是给可点元素加 `padding` 或 `::after { inset: -4px }`，不是在视觉上把 HUD 撑到 44。

---

## 9. 组件状态矩阵

### 9.1 五态定义

| 状态 | 视觉 | 双编码（除颜色外的区分） |
|---|---|---|
| **默认** | paper 底 + 3px ink 描边 + `--shadow` | — |
| **按压** | `translate(3px,3px)` + `--shadow-press` | 位移（即使看不见颜色也能感知） |
| **禁用** | cream-deep 底 + **虚线**描边 + 无投影 + `--ink-faint` 文字 | 虚线边框；`aria-disabled="true"` |
| **选中** | **mint `outline` 3px + offset 2px**，`--shadow-sm` 保留 | 形状（环）+ `aria-pressed="true"` |
| **危险** | 见 9.2 两变体 | 动作词、✕ 角标、`aria-label` 含"删除/丢弃" |

**橙色不能做选中色**：橙在本系统里唯一的语义是"主操作 + 危险边"。一旦选中也用橙，玩家看到橙色描边无法判断"这是选中还是这是危险"。选中给薄荷，因为薄荷在色盘里唯一没有竞争语义。

### 9.2 危险态两种变体（判定规则，不是两个特例）

> **判定规则：控件内部有墨黑图形 → 用变体 B（浅底）；纯文字 → 用变体 A（墨底）。**

| | 变体 A · 纯文字控件 | 变体 B · 含墨黑图形的控件 |
|---|---|---|
| 适用 | 丢弃 / 清空 / 删除 / 重置 这类**只有文字**的按钮 | 物品卡片、背包格子、贴纸（内部有墨黑 SVG 图形） |
| 底色 | `--danger-bg`（= ink） | `--danger-soft-bg`（= pink） |
| 描边 | 3px `--danger-edge`（= orange） | 3px `--danger-soft-edge`（= ink） |
| 投影 | `4px 4px 0 var(--orange)` 实心偏移 | `--shadow`（= 4px 4px 0 ink） |
| 文字 | `--danger-text`（= paper），**必须含动作词** | 保持 ink 文字 |
| 附加标记 | 无（文字已说明） | **右上角 ✕ 角标**（2px ink 描边 + paper 底 + ink ✕） |
| 对比度 | 15.3:1（paper on ink） | 8.1:1（ink on pink） |

**为什么不能统一成一种**：物品卡片里已经有墨黑图形，如果卡片再变成墨底，图形会直接消失；反过来，纯文字按钮用粉底 + 3px ink 边，在视觉上和普通按钮的差别只剩底色，玩家会误点。两种变体各自解决自己场景的"消失"问题。

**为什么必须有动作词 / ✕**：颜色在色盲、强光、灰度截图下都可能失效。变体 A 靠"丢弃""删除"这类动词，变体 B 靠 ✕ 形状，保证去掉颜色后依然能判断。

### 9.3 状态组合优先级

`禁用 > 危险 > 选中 > 按压 > 默认`。禁用态不叠加描边色变化（保持虚线 ink），避免"disabled 的危险按钮"看起来还能点。

---

## 10. 组件规格

### 10.1 HUD 条（`<768px`）

- 高 `--hud-h`（36px），**不透明** `--paper` 底 + 底部 3px ink 描边（`position: fixed; top: 0`）。
- 左：`第 n 天`（`--fs-2xs` + `--fs-h3` 数字）· `阶段 n`；右：背包按钮（含数量角标）。
- 每个可点元素热区 ≥ `--tap-min`（用 `::after` 扩展，不加高）。
- **否决 REDESIGN §4.1 的"半透明底"**：世界层底色随相机移动变化（米色、粉斑、雾障），半透明底上的 12px 文字对比度不可预测。用不透明纸卡片 + `--shadow-sm`，代价是遮住 36px 高的世界，可以接受。

### 10.2 对话条（`DialogueBar`）

- 收起：高 `--dialogue-h-collapsed`（44px），ink 底 + paper 字，`--fs-sm`，单行 `text-overflow: ellipsis`，padding `--sp-2 --sp-4`。
- 展开：`min-height: --dialogue-h-expanded`（80px），最多 2 行，padding `--sp-3 --sp-4`。
- 左侧头像 `--avatar`（34px）orange 底 + ink 字 + 2px paper 描边。
- 右侧"继续 ▸" `--fs-nano`，`--dur-loop` 闪烁；`prefers-reduced-motion` 下改为静态。

**高度算式（T4 必须照抄，别再手调）**：`2 行 × 14px × 1.7 = 47.6` + 上下 padding `24` + 上边框 `3` = **74.6 → 取 80**；收起态 `1 行 23.8 + 16 + 3 = 42.8 → 44`。若把字号改成 16px（不要这么做），一行就是 27.2，44px 装不下。

### 10.3 合成槽（`CraftSlots`）

- `min-height: --slot-h`（62px），`--radius-md`，空态 `3px dashed ink` + `opacity: .85`，填充态实线 + 不透明。
- 槽内物品名 `--fs-2xs` / `--lh-tight`，最多 2 行，超出省略。
- 空槽的 "+" 用 `--fs-h3` + `--font-display`。
- 槽位不接受"从地面直接拖入"（禁用拖拽），只从背包点选。

### 10.4 物品贴纸（世界层 & 背包）

| 场景 | 尺寸 | 规范 |
|---|---|---|
| 地面 | `--item-world` 32（28–36） | 底部 `--shadow-item`（0 3px planet-shade）；聚焦时 orange 虚线环 r=28，`4 4` dash，±2 浮动 |
| 背包卡片 | 宽 84（≤380px 76） | 3px ink 边 + `--shadow-sm`；图标 `--item-icon-card` |
| 数量角标 | 21×21 | `--radius-pill`，yellow 底，2px ink 边，`--fs-nano`，**flex 居中（不用 line-height 顶）** |
| 帮助角标 | 23×23 | mint 底，2px ink 边，“?” |

**物品名**：`--fs-2xs`（12px）/ `--lh-tight`，`overflow-wrap: anywhere` + 2 行 clamp。**禁用 `word-break: break-all`**——它会从任意字符断开英文与数字（"USB" 会变成 "US/B"）。≤380px 视口把名字降到 `--fs-nano`，因为 76px 卡片的内宽只剩 60px，5 个汉字刚好贴边。

### 10.5 区域 chip

- `--radius-pill` + 3px ink 边 + `--shadow-sm`；文字 `--fs-2xs`。
- 激活：ink 底 + paper 字；锁定：`--ink-faint` 文字 + 虚线边 + 不可点（不发散透明度）。
- v2 中 chip 从"区域切换"改为"当前区域指示"，不再是导航控件（导航靠走）。

### 10.6 背包抽屉

- `<768`：全屏抽屉，从底部进，顶部保留 48px 世界可见（"不遮死"）。
- `768–1023`：宽 `--drawer-w` 居中。
- `≥1024`：合成台常驻右侧 `--sidebar-w`，背包可折叠。
- 遮罩用 `--scrim`，点击遮罩关闭；抽屉本体 `--radius-lg` 顶部圆角 + 3px ink 边。

### 10.7 Toast

- 顶部（不遮底部对话条），宽 `min(88vw, 380px)`，yellow 底 + 3px ink 边 + `--shadow`，`--radius-ui`。
- 标题 `--fs-sm` / 900 字重，正文 `--fs-xs` / `--lh-body`。
- `role="status"` + `aria-live="polite"`；`--dur-2` 进入，停留 2.4s。

### 10.8 描述浮层（`ItemSheet`）

- 居中偏下，宽 `min(100%, 420px)`，`--radius-xl`，3px ink 边，`--shadow-sheet`。
- 标题 `--fs-h2` / `--font-display` / `--lh-tight`；正文 `--fs-sm` / `--lh-body`（16px 会让两句话占掉整屏，浮层正文用 14 是刻意的）。
- 遮罩 `--scrim`；`role="dialog"` + `aria-modal="true"`；ESC 可关，焦点锁在浮层内。

### 10.9 空态

- 场景空："地上干净得可疑" 一句话，`--fs-xs` + `--ink-soft`，无插图。
- 背包空：一句话 + 指向"去哪捡"的方向提示，不留大白块。

---

## 11. 禁止清单

| 禁止 | 原因 | 替代 |
|---|---|---|
| 渐变（linear/radial/conic） | Riso 印刷语言里没有渐变；一出现就变成"现代 UI" | 实心色块 + 2px 描边分层 |
| 模糊 / `filter: blur` / backdroph-blur 玻璃感 | 同上，且移动端 GPU 开销高 | 不透明纸卡片 |
| 发光 / `text-shadow` 带 blur | 同上 | 实心偏移 `text-shadow`（无 blur） |
| 投影扩散（`box-shadow` 第三、四值非 0） | 会变成"阴影"，不是"色块" | 只用 `x y 0 color` |
| 半透明 UI 底（HUD、卡片、浮层） | 底色不可控，文字对比度无法验证 | `--paper` 不透明 + 投影 |
| 第三方 UI 库 / Tailwind / CSS-in-JS | 与"原生 CSS + 令牌"约束冲突，且会带进第二套色盘 | 手写 class + 令牌 |
| 外部图片 / 字体 / 图标库 | 离线可玩硬约束 | 内联 SVG / data-URI |
| 拖拽交互 | 移动端不可靠，与点击移动冲突 | 点击/长按 |
| 12px 以下的正文 | 可读性 | `--fs-2xs` 起步；11px 仅限角标 |
| 橙色作为选中色 | 与危险语义撞车 | 薄荷 `--state-selected` |
| 白字压在荧光色底上 | 2.8–3.5:1，不达标 | 墨黑字 |

---

## 12. 可访问性

**分级：Standard**（对标 WCAG 2.1 AA 的移动端可达成子集）。理由：本作是单人休闲游戏，无实时竞争，不需要 Exemplary 级的全量替代输入；但目标平台是手机 + 户外，Basic 不够。

| 特性 | 状态 | 落地方式 |
|---|---|---|
| 文本对比 ≥4.5:1 | ✅ 强制 | §1.3 文字阶；荧光底只配 ink |
| 非文本对比 ≥3:1 | ✅ 强制 | 描边 ink；`--ink-faint` 3.2:1 可用作边框 |
| 不依赖颜色 | ✅ 强制 | 危险双变体 + 动作词 + ✕；选中用描边环 + `aria-pressed` |
| 焦点可见 | ✅ 强制 | `:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset) }` |
| 触控目标 44×44 | ✅ 强制 | `--tap-min`，视觉可小于热区 |
| 文本缩放 200% | ✅ 支持 | 布局用 flex/grid + `min-width: 0`；`-webkit-text-size-adjust: 100%`；卡片名字 2 行 clamp 不溢出 |
| 减少动效 | ✅ 支持 | `prefers-reduced-motion` → `--dur-*: 1ms`；Pixi 侧另读 `matchMedia` |
| 屏幕阅读器 | ⚠️ 部分 | Toast `role=status`、浮层 `role=dialog`、背包按钮 `aria-label="背包，12 件"`；canvas 提供 `role="img"` + 文本摘要（当前区域、物品数） |
| 键盘可达 | ✅ 强制 | 所有按钮原生 `<button>`；世界支持 WASD/方向键（T3） |
| 运动障碍 | ✅ 支持 | 无拖拽、无连打、无时间压力（天数只是计数器） |
| 色觉差异 | ✅ 支持 | 橙/粉在红绿色盲下接近，靠动作词/✕ 双编码区分 |
| 字幕/对话 | ✅ 支持 | 对话条 ink 底 paper 字 15.3:1，不自动消失 |
| 音频替代 | ⏳ 待 T9 | 音效必须可关（默认 60%），关键信息不只用声音 |

**T4 验收必须自测**：把系统字体放大到 200%，375px 宽下打开背包 → 物品名不得溢出卡片；Tab 走一遍抽屉 → 焦点环每一跳都可见。

---

## 13. 五条裁决（用户已拍板）

### 裁决 1：基准字号 15px → 16px（用户批准）

`body` 改为 `font-size: 16px; line-height: 1.7`。这不只是改一个数字：所有基于 15px 调过的行高、高度、断词都要重算。**完整清单见 §14 第 1、2、3、4 条**，T4 必须整组做完。

### 裁决 2：危险态分两种（用户批准）

写成判定规则而非两个孤例：**控件内有墨黑图形 → 浅底（pink）+ 橙描边 + ✕；纯文字 → 墨底 + 橙描边/投影。** 见 §9.2。

### 裁决 3：`--shadow` 保留（采纳本方案建议）

`--shadow: 4px 4px 0 var(--ink)` 语义冻结，UI 层继续用；新增 `--shadow-item: 0 3px 0 var(--planet-shade)` 给世界层。
**REDESIGN §8 的"删掉 --shadow"只适用于世界层**——它讨论的是"物件浮在地面上不该用卡片阴影"，不是"UI 不该有抬升"。UI 卡片仍然需要卡片阴影。

### 裁决 4：间距阶改名 `--sp-*`（主理人裁定）

`--space-1…24` 与颜色令牌 `--space` 会混淆，统一为 `--sp-1…--sp-24`。颜色令牌 `--space` 保持原名（契约写死）。

### 裁决 5：`--gap` 的值不动（主理人裁定）

原方案建议 `--gap: 10px → var(--sp-3)`，**撤销**。T1 不改 `app.css`，无法验证 `.start__pack` / `.start__actions` / `.slots` 三处位移。`--gap` 保留原值并标 `@deprecated`，T4 替换 usage 后再删（§14 第 17 条）。

---

## 14. T4 必做指令（17 条，按严重度排序）

> T1 本轮**不执行**以下任何一条（`app.css` 归 T4）。T4 按编号顺序做，每条做完跑一次 `shots` 目视对比。
> P0 = 不改就是错的（可读性/对比度/高度算不出来）；P1 = 不改会出现两套视觉；P2 = 收尾。

### P0

#### 1. 基准字号与行高（`html, body`）
- **改**：`font-size: 15px` → `var(--fs-body)`（16px）；`line-height: 1.55` → `var(--lh-body)`（1.7）。
- **连带**：`.start__sub` 的 `font-size: 15px` 删掉（继承即可），`line-height: 1.7` 保留。
- **为什么**：这是整套字号阶的锚点，锚点不动，其他改动无意义。
- **验**：`shots/01-start.png` 里正文每行字数应减少约 1 个字；行间距肉眼变松。

#### 2. 全站字号字面量 → 字号阶（34 处）

| 选择器 | 现值 | 改成 |
|---|---|---|
| `.start__title` | `clamp(64px,22vw,96px)` | `var(--fs-display)` |
| `.start__kicker` | 12px | `var(--fs-2xs)` |
| `.start__sub` | 15px | 删除（继承 `--fs-body`） |
| `.start__hint` | 12px | `var(--fs-2xs)` |
| `.stat` | 12px | `var(--fs-2xs)` |
| `.stat b` | 19px | `var(--fs-h3)` |
| `.area` | 12.5px | `var(--fs-2xs)` |
| `.scene--empty` | 13px | `var(--fs-xs)` |
| `.scene__caption` | 11px | `var(--fs-nano)`（并改颜色，见第 6 条） |
| `.item__name` | 11px | `var(--fs-2xs)`（≤380px 用 `--fs-nano`，见第 4 条） |
| `.item__count` | 11px | `var(--fs-nano)` |
| `.item__help` | 13px | `var(--fs-xs)` |
| `.bench__label` | 11px | `var(--fs-nano)` |
| `.slot` | 12px | `var(--fs-2xs)` |
| `.slot__name` | 12px | `var(--fs-2xs)` |
| `.slot__plus` | 20px | `var(--fs-h3)` |
| `.panel__head` | 14px | `var(--fs-sm)` |
| `.panel__head span:last-child` | 12px | `var(--fs-2xs)` |
| `.panel__body` | 13px | `var(--fs-xs)` |
| `.log-item` | 12px | `var(--fs-xs)` |
| `.log-item small` | 12px | `var(--fs-2xs)` |
| `.dialogue__avatar` | 12px | `var(--fs-2xs)` |
| `.dialogue__text` | 13.5px | `var(--fs-sm)` |
| `.dialogue__next` | 11px | `var(--fs-nano)` |
| `.toast__title` | 14px | `var(--fs-sm)` |
| `.toast__body` | 12.5px | `var(--fs-xs)` |
| `.sheet__title` | 22px | `var(--fs-h2)` |
| `.sheet__desc` | 13.5px | `var(--fs-sm)` |
| `.ending__stamp` | 13px | `var(--fs-xs)` |
| `.ending__title` | `clamp(36px,12vw,54px)` | `var(--fs-ending)` |
| `.ending__sub` | 14px | `var(--fs-sm)` |
| `.ending__lines` | 13px | `var(--fs-xs)` |
| `.ending__stats` | 12px | `var(--fs-2xs)` |
| `.tag` | 11px | `var(--fs-2xs)` |

- **同时**：所有硬编码 `line-height` 换令牌 —— `.start__title` 0.92 → `--lh-display`；`.item__name` 1.25 → `--lh-tight`；`.slot__name` 1.2 → `--lh-tight`；`.tag` 1.5 → `--lh-ui`；`.log-item` 1.5 → `--lh-body`；`.dialogue__text` 1.6 → `--lh-body`；`.toast__body` 1.55 → `--lh-body`；`.sheet__title` 1.1 → `--lh-tight`；`.sheet__desc` 1.7 → `--lh-body`；`.ending__title` 1 → `--lh-display`；`.ending__lines` 1.7 → `--lh-body`。
- **为什么**：不换令牌的话，下一轮又会长出新字面量；`--fs-*` 是"改一处、全站生效"的唯一入口。
- **验**：`grep -rn "font-size: [0-9]" apps/web/src/styles/app.css` 只应剩 `tokens.css` 里的定义。

#### 3. 对话条高度体系（`.dialogue` / `.dialogue__text`）
- **改**：`.dialogue` 的 `min-height: 74px` → `min-height: var(--dialogue-h-expanded)`；`padding: 11px 14px calc(11px + var(--safe-bottom))` → `padding: var(--sp-3) var(--sp-4) calc(var(--sp-3) + var(--safe-bottom))`。
- **新增收起态** `.dialogue--collapsed`：`height: var(--dialogue-h-collapsed); min-height: var(--dialogue-h-collapsed); padding: var(--sp-2) var(--sp-4) calc(var(--sp-2) + var(--safe-bottom));`文本 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`。
- **为什么**：`14px × 1.7 × 2 行 + 24 padding + 3 边框 = 74.6`，原来的 74 差 0.6px，浏览器会挤出 1px 滚动抖动；收起态必须是 44（`1 行 23.8 + 16 + 3 = 42.8`），不能用同一个 padding。
- **验**：DevTools 量 `.dialogue` 高度 = 80 / 44；iPhone SE 尺寸下不出现内部滚动条。

#### 4. 物品名断词与窄屏（`.item__name` / `.item`）
- **改**：`word-break: break-all` → `overflow-wrap: anywhere`；`line-height: 1.25` → `var(--lh-tight)`；新增 `display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; min-height: calc(2 * var(--fs-2xs) * var(--lh-tight));`（`min-height` 防 1 行/2 行切换时卡片跳动）。
- **`@media (max-width: 380px)`**：`.item { width: var(--item-card-w-narrow) }` **并且** `.item__name { font-size: var(--fs-nano) }`。
- **为什么**：84px 卡片内宽 68px，12px × 5 字 = 60 刚好；76px 卡片内宽 60px，12px × 5 字正好贴边，字宽有 0.1px 误差就会换行。`break-all` 会把 "USB" 断成 "US/B"。
- **验**：把物品名改成 6 个汉字，375px 与 360px 下都只占 2 行且卡片高度不变。

#### 5. 主按钮对比度（`.btn--primary`）
- **改**：`color: var(--paper)` → `color: var(--ink)`；`background: var(--orange)` 保留。
- **为什么**：`paper on orange` 实测 **2.8:1**，16px 粗体也不算大字（WCAG 大字门槛是 18.66px 粗体），不达标；`ink on orange` 是 **6.1:1**，且更接近 Riso 双色叠印的观感。
- **验**：截图后用取色器量，或用浏览器 DevTools 的 contrast 提示。

#### 6. 十一处 `opacity` 文字 → 文字色阶
- **改**：删除 opacity，改 `color`：
  `.muted` .62 → `var(--ink-soft)`；`.start__kicker` .6 → `--ink-soft`；`.start__hint` .5 → `--ink-soft`；`.scene--empty` .55 → `--ink-soft`；`.scene__caption` .45 → `--ink-soft`；`.bench__label` .55 → `--ink-soft`；`.panel__head span:last-child` .5 → `--ink-faint`；`.ending__sub` .7 → `--ink-soft`；`.ending__stats` .65 → `--ink-soft`；`.dialogue__next`（保留 opacity 用于闪烁动画，但要加 `--ink` 底上的 paper 色，动画只改 opacity 0.4–1）。
- `.area--locked` 的 `opacity: .38` → `color: var(--ink-faint)` + `border-style: dashed`。
- **为什么**：`.45 / .38` 实测约 2.0–2.6:1，承载的是"区域名/说明"这类信息性文本，不达标；opacity 还会把子元素与边框一起压淡。
- **验**：DevTools 的 Accessibility 面板逐个看 contrast 值。

#### 7. 颗粒层层级（`.grain`）
- **改**：`z-index: 999` → `var(--z-grain)`（30）。
- **为什么**：噪点现在压在浮层正文与 Toast 上，降低 16px 中文的清晰度；它应该只作用于世界层。
- **验**：打开描述浮层，正文边缘应干净；世界层仍能看到纸张颗粒。

### P1

#### 8. 层级字面量 → `--z-*`
- `.topbar` 40 → `var(--z-hud)`；`.dialogue` 50 → `var(--z-dialogue)`；`.toast` 200 → `var(--z-toast)`；`.sheet` 300 → `var(--z-sheet)`；新增抽屉 100 → `var(--z-drawer)`。
- **为什么**：v2 新增抽屉与提示条，若不集中管理，`z-index` 会开始出现 101/150 这种补丁值。

#### 9. 动效字面量 → `--dur-*` / `--ease-*`
- `.btn` `0.1s` → `var(--dur-1)`；`.item` `0.12s` → `var(--dur-1)`；`.area` `0.1s` → `var(--dur-1)`；`.progress__fill` `0.25s` → `var(--dur-3)`；`.toast` `0.22s` → `var(--dur-2)`；`.sheet__card` `0.2s` → `var(--dur-2)`；`.dialogue__next` `1.4s` → `var(--dur-loop)`；所有 `ease` → `var(--ease-out)`（退出向用 `--ease-in`）。
- **为什么**：`prefers-reduced-motion` 的降级写在令牌里，硬编码时长不会跟着降级。

#### 10. 按钮按压与禁用（`.btn:active` / `.btn:disabled`）
- **改**：`:active` 的 `box-shadow: 1px 1px 0 var(--ink)` → `var(--shadow-press)`；`:disabled` 的 `color: rgba(26,26,26,.38)` → `var(--ink-faint)`，并补 `aria-disabled` 的语义（若用 `disabled` 属性则已足够）。
- **为什么**：`.38` 实测约 2.0:1；虚线边 + 去投影已经能表达禁用，文字不必再压到几乎看不见。

#### 11. 选中态颜色（`.item--selected`）
- **改**：`box-shadow: 0 0 0 3px var(--orange), var(--shadow-sm)` → `outline: 3px solid var(--state-selected); outline-offset: var(--focus-offset);`，保留 `box-shadow: var(--shadow-sm)`。
- **为什么**：橙在本系统里已是"危险边"的唯一语义；用橙做选中，玩家无法区分"这个能丢"和"这个选中了"。`outline` 也不会被 `overflow: hidden` 裁掉。

#### 12. 圆角字面量 → 圆角阶
- `.btn` 12 → `var(--radius-sm)`；`.goal` 12 → `--radius-sm`；`.ending__lines p` 12 → `--radius-sm`；`.item` 14 → `--radius-md`；`.slot` 14 → `--radius-md`；`.panel` 16 → `var(--radius-ui)`；`.toast` 16 → `--radius-ui`；`.scene` 20 → `var(--radius-lg)`；`.bench__inner` 20 → `--radius-lg`；`.sheet__card` 22 → `var(--radius-xl)`；`.ending__stamp` 10 → `--radius-xs`；`.tag` / `.progress` 999 → `var(--radius-pill)`。

#### 13. 描边字面量 → 描边阶
- 2px → `var(--stroke-thin)`：`.tag`、`.goal`、`.progress`、`.item__count`、`.item__help`、`.dialogue__avatar`、`.ending__lines p`；
- 3px 全部 → `var(--stroke)`：`.scene`、`.bench__inner`、`.panel`、`.slot`（含 `dashed`）、`.toast`、`.sheet__card`、`.item`、`.area`；
- **4px 例外**：`.ending__stamp` 的 `border: 4px solid` → `var(--stroke)`（3px），同时 padding 从 `8px 20px` → `var(--sp-2) var(--sp-5)` 补回视觉重量。
- **为什么**：v1 的 4px 只出现在印章，属于"手调例外"；统一到 3px 后，所有卡片边缘在缩放下保持一致。

#### 14. 间距字面量 → `--sp-*`（约 40 处）

| 选择器 | 现值 | 改成 |
|---|---|---|
| `.start` | `gap: 22px` / `padding: 40px 22px` | `var(--sp-6)` / `var(--sp-10) var(--sp-6)` |
| `.start__pack` | `margin: 4px 0 6px` | `var(--sp-1) 0 var(--sp-2)` |
| `.start__actions` | `gap: 10px` | 见第 17 条（`--gap`） |
| `.topbar` | `gap: 8px` / `padding: 9px 12px 8px` | `var(--sp-2)` / `var(--sp-2) var(--sp-3)` |
| `.stat` | `gap: 3px` | `var(--sp-1)` |
| `.areas` | `gap: 7px` / `padding: 9px 12px` | `var(--sp-2)` / `var(--sp-2) var(--sp-3)` |
| `.area` | `padding: 6px 10px` / `gap: 3px` | `var(--sp-1) var(--sp-3)` / `var(--sp-1)` |
| `.stage` | `padding: 12px 12px 4px` | `var(--sp-3) var(--sp-3) var(--sp-1)` |
| `.scene` | `padding: 16px 12px` / `gap: 12px` | `var(--sp-4) var(--sp-3)` / `var(--sp-3)` |
| `.scene--empty` | `gap: 4px` | `var(--sp-1)` |
| `.scene__caption` | `left: 12px` / `top: 8px` | `var(--sp-3)` / `var(--sp-2)` |
| `.searchbar` | `padding: 10px 12px` | `var(--sp-2) var(--sp-3)` |
| `.item` | `padding: 7px 5px 6px` / `gap: 3px` | `var(--sp-1) var(--sp-1)` / `var(--sp-1)` |
| `.bench` | `padding: 4px 12px 10px` | `var(--sp-1) var(--sp-3) var(--sp-2)` |
| `.bench__inner` | `padding: 11px 12px` | `var(--sp-3)` |
| `.bench__label` | `margin-bottom: 8px` | `var(--sp-2)` |
| `.slot` | `gap: 6px` / `padding: 6px` | `var(--sp-1)` / `var(--sp-1)` |
| `.panels` | `gap: 8px` / `padding: 0 12px 12px` | `var(--sp-2)` / `0 var(--sp-3) var(--sp-3)` |
| `.panel__head` | `gap: 8px` / `padding: 11px 13px` | `var(--sp-2)` / `var(--sp-3)` |
| `.panel__body` | `padding: 0 13px 13px` | `0 var(--sp-3) var(--sp-3)` |
| `.goal` | `padding: 9px 11px` | `var(--sp-2) var(--sp-3)` |
| `.goal__step` | `margin-bottom: 4px` | `var(--sp-1)` |
| `.goal__req` | `gap: 5px` / `margin-top: 6px` | `var(--sp-1)` / `var(--sp-1)` |
| `.bag-grid` | `gap: 9px` | `var(--sp-2)` |
| `.keepsakes` | `gap: 9px` | `var(--sp-2)` |
| `.log-list` | `gap: 7px` | `var(--sp-2)` |
| `.log-item` | `gap: 8px` / `padding-bottom: 6px` | `var(--sp-2)` / `var(--sp-1)` |
| `.dialogue` | `gap: 10px` | 见第 17 条（`--gap`） |
| `.toast` | `padding: 12px 15px` | `var(--sp-3) var(--sp-4)` |
| `.toast__title` | `margin-bottom: 3px` | `var(--sp-1)` |
| `.sheet` | `padding: 16px` | `var(--sp-4)` |
| `.sheet__card` | `padding: 18px` | `var(--sp-5)` |
| `.sheet__title` | `margin: 0 0 6px` | `0 0 var(--sp-1)` |
| `.sheet__desc` | `margin: 0 0 12px` | `0 0 var(--sp-3)` |
| `.sheet__tags` | `gap: 6px` / `margin-bottom: 14px` | `var(--sp-1)` / `var(--sp-3)` |
| `.ending` | `gap: 20px` / `padding: 40px 24px` | `var(--sp-5)` / `var(--sp-10) var(--sp-6)` |
| `.ending__stamp` | `padding: 8px 20px` | `var(--sp-2) var(--sp-5)` |
| `.ending__lines` | `gap: 9px` | `var(--sp-2)` |
| `.ending__lines p` | `padding: 9px 12px` | `var(--sp-2) var(--sp-3)` |
| `.ending__stats` | `gap: 16px` | `var(--sp-4)` |

- **允许 ±2px 偏差**：13px → 12px 这类映射不追求像素一致，追求"值来自阶"。改完用 `shots/` 目视确认没有挤在一起。
- **验**：`grep -rnE "padding: [0-9]|gap: [0-9]|margin[^:]*: [0-9]" apps/web/src/styles/app.css` 只剩第 17 条三处待办。

#### 15. 尺寸字面量 → 尺寸令牌
- `.btn` `min-height: 46px` → `var(--btn-h)`；`.item` `width: 84px` → `var(--item-card-w)`；`.item__icon` 40px → `var(--item-icon-card)`；`.dialogue__avatar` 34px → `var(--avatar)`；`.slot` `min-height: 62px` → `var(--slot-h)`；`@media (max-width:380px)` 里 76px → `var(--item-card-w-narrow)`、`.item__icon` 34px → `calc(var(--item-icon-card) - var(--sp-1))`（=36px，比原 34 大 2px；76px 卡片内宽 60px，36 的图标仍留得下）。
- **不改**：`.progress` 74×9、`.start__pack span` 34px、`.item__count` 21px、`.item__help` 23px、`.pick-btn` 相关——这些是单处装饰尺寸，进令牌只会增加噪音。
- **为什么**：区分"复用尺寸"与"单处装饰"，否则令牌表会膨胀成一个 CSS 文件。

#### 16. 焦点可见（新增规则，`app.css` 末尾）
```css
:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}
button:focus:not(:focus-visible) {
  outline: none;
}
```
- **为什么**：v1 完全没有焦点样式，T4 验收要求"Tab 焦点可见"；用墨黑环而不是橙色环，是因为橙色已被危险语义征用。
- **验**：抽屉打开后连按 Tab，每一跳都要能看到 3px 墨黑环。

### P2

#### 17. `--gap` 三处 usage（下一轮做）
- `.start__pack { gap: var(--gap) }`、`.start__actions { gap: var(--gap) }`、`.slots { gap: var(--gap) }` → 全部 `var(--sp-3)`，然后删除 `tokens.css` 里的 `--gap`。
- **为什么现在不做**：T1 不改 `app.css`，无法验证三处位移是否正确（10px → 12px 会让 `.start__actions` 两个按钮间距增加 2px，可能顶出 320px 容器）。T4 改完这三处并目视确认后，再删 `--gap`。

---

## 15. 交接事项

### 15.1 → T2（世界美术资产）

1. **SVG 里不能用 CSS 变量**。当 SVG 字符串被转成 `Image`/纹理时，`var(--orange)` 不会解析。颜色必须来自 `apps/web/src/world/assets/palette.ts` 的 TS 常量，与 `tokens.css` 一对一（`orange: '#ff6b35'` 等）。
2. **palette 必须可验证**。在 `apps/web/src/world/assets/` 下加一个脚本或测试，正则读 `tokens.css` 并断言 9 个色值一致。改色时两边同时改，否则背包图标和地面贴纸会不同色（这是最容易漏的回归）。
3. **世界层不用 3px 描边**：贴纸 2px（`--stroke-thin` 的世界等价）、细节 1px。3px 在 28 单位尺寸下会吃掉整个图形。
4. **贴地投影用 `--planet-shade`（#f1e6d0），不用墨黑**。投影是"接触阴影"，不是卡片阴影。
5. **尺寸硬约束**：地面贴纸 28/32/36 三档；角色 24×36；地标 96–128；地面斑块 6–9 边。28 单位在 zoom 0.8 时只有 22.4 屏幕像素，**必须靠轮廓可辨，不能靠内部细节**。
6. **雾障**：`--void`（ink 35%），只覆盖未解锁扇区，不写到亮色底上（会把纸变脏）；覆盖面积上限 45%，否则玩家看不到路。
7. **`ItemIcon` 双出口共用形状数据**，不要为 Pixi 另写路径。

### 15.2 → T3（Pixi 渲染层）

1. **canvas 容器 `z-index: var(--z-world)`**，五层顺序 0–4 由 TS 常量控制；**不要**把 `--z-items` 之类当世界层顺序用（同名不同义）。
2. **`prefers-reduced-motion` 要用 `matchMedia` 读**，不要只读 CSS 变量；`getComputedStyle(document.documentElement).getPropertyValue('--dur-1')` 会返回 `"1ms"`，可以作为双保险。
3. **世界动画时长镜像**：拾取飞入 260ms（`--dur-3`）、刷新缩放 400ms（`--dur-4`）、高亮浮动 1200ms（`--dur-loop`）。在 `world/motion.ts` 里定义常量，注释指向令牌名。
4. **`TASKS-v2.md` T3 验收里的"水平环绕"已被 `CONTRACT-v2.md` §9 否决**（圆形星球 + 方形世界 + 回绕几何矛盾）。按契约做"圆形夹紧、不回绕"。这是文档冲突，以契约为准。
5. 相机缩放 0.8–1.6，不要改；`--item-world` 是**世界单位**，不要直接拿来算屏幕像素。
6. 纹理生成读 `palette.ts`，不读 CSS。

### 15.3 → T6（内容扩容）

1. **物品名 ≤ 5 个汉字**。84px 卡片、12px 字、2 行上限，第 6 个字开始换行；≤380px 视口只剩 5 字空间。超过 5 字的现有物品要么改名，要么接受截断（不推荐截断）。
2. **物品 `color` 只能取 5 个荧光色之一**，且遵守"荧光底 + 墨黑字"；紫色仅用于稀有/剧情物品，避免满屏紫。
3. **描述 ≤ 40 字**（浮层 14px/1.7，两屏内读完）。第 41 个字开始玩家不读。
4. **台词 ≤ 36 字/句**（对话条 14px，2 行）。超过就拆句或缩字。
5. **标签名 ≤ 6 汉字**（chip 与搜索提示共用），长标签会撑爆 HUD。
6. 新物品图标只能复用 `ItemIcon` 的 45 个几何形状或新增几何形状，**不引入位图、不加渐变**。新增形状的可分辨判据见 `docs/design/ASSETS-v3.md` §2.2（剪影 IoU ≤ 0.52，严于既有库 p90 0.531）。

---

## 16. 自检与验收方法（T1 本轮已执行）

| 检查 | 方法 | 结果 |
|---|---|---|
| 构建 | `pnpm --filter @haola/web build` | 见交付回传 |
| 令牌重复 | 解析 `tokens.css`，统计 `:root` 内每个 `--name` 出现次数 | 见回传（应为 0 个重复） |
| `preview.html` 无色值外泄 | 去掉 `TOKENS-COPY` 段后正则 `#[0-9a-fA-F]{3,8}` | 见回传（应为 0） |
| 375px 无横向滚动 | Playwright 打开 `file://` 页面，`viewport 375×667`，断言 `document.documentElement.scrollWidth <= 375`，并列出所有 `getBoundingClientRect().right > 375` 的元素 | 见回传（含实测数字） |

---

## 17. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v2.0 | 2026-10-19 | 首版：色盘/中性阶/文字阶/字号/间距/圆角/层级/动效/尺寸令牌；危险态双变体；17 条 T4 指令；T2/T3/T6 交接 |
