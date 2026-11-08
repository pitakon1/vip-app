# VIP Rental 多端 UI 设计原则

> 本文件是 App（React Native）、小程序（Taro）、Web 三端 UI 的唯一设计参照。
>
> **配色来源（唯一权威 = 代码，不是文档）**：
> - Web — `frontend-web/src/styles/tokens.css`（`--rent-*`）
> - App — `mobile-app/src/theme/colors.ts`（`colors.*`）
> - 小程序 — `miniapp/src/app.scss`（`page { --* }`）
>
> 三端已统一到 **Refined Premium（温暖米白 · 品牌青绿 · 柔和阴影）** 基调。主色 `#14b8a6` 不变，通过底色温度、阴影柔度与圆角层级提升"高端物业"观感。
>
> ⚠️ `rental-full-draft/` 是**历史原型归档**（冷调 Modern Light、含 antd 蓝 `#1677ff`），**不作为配色来源**，其令牌不得回灌到已迁移的端。
>
> **风格基调**（由 ui-ux-pro-max 设计系统导出）：Minimalism & Swiss Style —— 简洁、清爽、留白充足、功能性优先、栅格化、无装饰噪音。

---

## 1. 设计令牌（Design Tokens）— 唯一配色来源

所有端的所有组件，**禁止直接写十六进制颜色**，一律使用下列语义令牌。令牌名与含义已与 §5.1 的三端令牌文件对齐，跨端映射方式见第 5 节。

> **本文只约定语义与用法，不重复列出数值。** 具体色值、圆角、阴影、字号一律以三端令牌文件（§5.1）为准；文档与代码冲突时以代码令牌为准。改令牌时只改令牌文件。

### 1.1 语义色

| 令牌 | 用途 |
|---|---|
| `background` | 页面/列表底色（温暖米白） |
| `foreground` | 全局文本主色（暖墨，三端统一） |
| `card` / `card-foreground` | 卡片 / 弹层 / 输入框底及其文本 |
| `popover` / `popover-foreground` | 弹层底及其文本 |
| `primary` | 品牌主色，**仅作「面」**：CTA 底、选中底、Hero、进度条 |
| `primary-foreground` | 主色底上的文字/图标（深墨；**禁止白字**，白字在品牌绿上仅 2.49:1） |
| `primary-text` | 品牌绿作为「文字」落在白底时的深档（满足正文 AA） |
| `primary-hover` / `primary-active` | 交互态（更亮的同色相，配深墨前景仍 ≥4.5:1） |
| `muted` / `muted-foreground` | 弱化底（表头、占位区块、hover 底）/ 弱化文本 |
| `border` / `input` | 细边框、分隔线 / 输入框描边 |
| `ring` | 焦点环 / 选中描边（图形元素需 ≥3:1，比主色加深一档） |
| `sidebar-active` | 导航选中底色（浅 teal） |
| `surface-2` | 次级底、表头、选中底淡色 |
| `surface-3` | 第三层中性底（媒体占位、骨架屏等） |

### 1.2 中性色阶梯（直接引用如 `ink` / `ink-2` / `ink-3`）

| 令牌 | 用途 |
|---|---|
| `ink` | 标题、主文本、金额数字（暖墨） |
| `ink-2` | 正文、次级文本 |
| `ink-3` | 辅助说明、时间戳（满足 ≥4.5:1，可作正文） |
| `ink-4` / `ink-disabled` | 占位符、禁用态、装饰；**禁止作为正文色** |
| `line` | 分割线、描边（暖描边） |
| `surface` | 卡片/列表项白底 |

> `muted` / `surface-2` / `sidebar-active` 见 1.1，不在此重复定义。

### 1.3 状态色（仅语义状态使用，禁作装饰）

| 令牌 | 用途 |
|---|---|
| `success` / `success-ink` | 成功、已签约、已收款 |
| `warning` / `warning-ink` | 待办、即将到期、注意 |
| `warning-soft` / `warning-light` | 预警卡/待办条的浅底 / 描边 |
| `error` / `error-ink` / `error-hover` | 错误、欠费、失败 / 危险操作 hover |
| `info` / `info-ink` | 信息、提示、进行中 |
| `purple` | 合同/流程类中性紫（**唯一紫色**，禁另起 `#8b5cf6`） |

对比度规则（见 2.4）：
- 高饱和状态色（`success` / `warning` / `error` / `info`）**只作「面」**：徽章底、进度条、状态点。
- 状态色作文字，或作为实心徽章底承载白字时，一律用对应的 `*-ink` 加深档（Web `--state-*-ink`、App `colors.*Ink`、小程序 `--*-ink`）。
- 需要透明度叠加时统一用 `-rgb` 通道变量（如 `rgba(var(--success-rgb), 0.1)`），**不要新造浅底十六进制值**（如 `#e7f6ee` / `#fff6e6`）。

### 1.4 圆角（各端独立阶梯，语义一致）

三端**不共享具体像素值**（移动端需要更饱满的圆角），只共享语义档位。数值定义在各端令牌文件内，本文不再列出：

| 端 | 令牌 | 令牌文件 |
|---|---|---|
| Web | `--rent-radius-sm/md/lg/xl/full` | `frontend-web/src/styles/tokens.css` |
| App | `colors.radius.sm/md/lg/xl/xxl/full` | `mobile-app/src/theme/colors.ts` |
| 小程序 | `--radius-sm/md/lg/xl/full`（rpx） | `miniapp/src/app.scss` |

> 组件只使用本端令牌中的档位，**禁止裸写表外圆角**（如 12px / 14px）。Web 的 `lg/xl` 与 App 的 `lg/xl/xxl` 不是同一像素值，**不要跨端套用**。

### 1.5 阴影（静态面 alpha ≤ 0.05；深阴影仅浮层）

阴影色基准统一为**暖墨** `rgba(28, 39, 51, α)`（禁止旧的冷调 `rgba(15, 23, 42, α)`）。具体模糊/扩散值以各端令牌文件为准（Web `--rent-shadow-1..3`、App `colors.shadow.*`、小程序 `--shadow-*`），但**层级语义必须一致**：

| 层级 | 语义 |
|---|---|
| `shadow-1` / `shadow.sm` / `--shadow-sm` | 静态卡片（α ≤ 0.05） |
| `shadow-2` / `shadow.md` / `--shadow-md` | 卡片悬浮 / hover |
| `shadow-3` / `shadow.lg` / `--shadow-lg` | Modal / 浮层 |
| `shadow-primary` | 主色 CTA / Hero（仅 CTA 使用） |

> 副作用提醒：静态卡片优先"无阴影 + `border`"，只有需要浮起时才用 `shadow-2`，避免大面积散影。

### 1.6 间距（4/8 网格）

间距刻度以各端令牌文件为准（Web `--rent-s-1..8`、App `colors.spacing`、小程序页面内 8rpx 倍数），语义顺序一致：**4 · 8 · 12 · 16 · 24 · 32 · 48 · 80**。组件间间距、卡片内边距、列表行高都从本端刻度中取值，禁止裸写表外数字。

---

## 2. 设计原则

### 2.1 简洁清爽（核心）
- 一屏一个主任务：每页只有一个主 CTA，避免堆砌按钮。
- 页面底色统一 `background`；内容承载一律用白色 `card`，不叠多层彩底。
- 克制信息密度：卡片内最多两级文本层级（主文本 + 辅助文本），多余信息折叠或省略。
- 不使用渐变、不用花哨边框动画；用留白与层级表达结构。

### 2.2 导航与结构
- 底部 Tab 不超过 5 项；层级浅，可预测返回（系统返回键/返回箭头必须可用）。
- 列表项整行可点击，点击有 150–250ms 的轻反馈（背景变 `surface-2` 或轻微透明度）。
- 有滚动内容的页面用整页滚动，不做双内滚（避免嵌套滚动与 CLS）。

### 2.3 触控与交互
- 触控目标最小 **44×44pt**（小程序/RN 端），间距不小于 8px。
- 任何提交/网络请求必须有加载态（按钮 loading 或骨架屏），且显示成功/失败结果。
- 表单：标签始终可见（不依赖 placeholder 当标签）；错误提示紧贴对应字段。
- 无 hover 的移动端上，关键操作不用"仅 hover 可见"的模式。

### 2.4 可访问性
- 正文文本对比度 ≥ 4.5:1；大号标题 ≥ 3:1。禁用"灰上加灰"（如 `ink-3` 文本放 `muted` 底上作正文）。
- 正文最小字号以各端字号令牌为准（Web `--rent-fs-base`、App `colors.fontSize.base`、小程序 `28rpx`），辅助文本不小于 12px；禁止低于 12px 的正文。
- 图标按钮必须有可读标签（accessibilityLabel / aria-label）或伴随文字。
- 图标一律用 SVG/矢量图标组件，**禁用 emoji 作图标**。
- 动效克制动：单次 200–350ms，尊重用户"减弱动态效果"系统设置（reduced motion）。

### 2.5 视觉一致性
- 全端遵守同一套令牌：同一含义的底色、描边、状态色不能在同一端内出现多个不同值。
- 圆角只用 `radius-sm/md/lg/xl/full` 五档（见 1.4），不随意加表外值（如 12px、14px）。
- 阴影只用 1/2/3 三档；静态卡片用 `shadow-1` 或不用，避免大面积散影。

---

## 3. 组件规范速查

| 组件 | 规范 |
|---|---|
| 主按钮 | `primary` 底 + `primary-foreground` 文字，`radius-md`，高度 ≥44 |
| 次按钮 | 白底 + `border` 描边 + `ink` 文字 |
| 危险按钮 | `error` 底 + 白字 |
| 卡片 | 白底 + `border` 1px + `radius-lg`，内边距 16–20 |
| Badge | `radius-full` 胶囊，状态色 10% 透明度底 + 对应 `*-ink` 文字 |
| 输入框 | 白底 + `border` 1px，聚焦时 `ring` 描边 + 3px `rgba(20,184,166,0.1)` 光环 |
| 导航高亮 | 文字 `ink` + 底色 `sidebar-active`（品牌绿在浅青底上仅 2.13:1，不作文字） |
| 表头/分组底 | `surface-2` |
| 分割线 | `line` 1px |
| 空态 | 居中图标（浅色）+ 说明文字用 `ink-2`（`ink-3` 可作辅助，`ink-4` / `ink-disabled` 仅限占位/禁用） |

### 3.1 组件选型边界（B 端 / C 端）

先判断页面受众，再选组件，避免同一能力两套实现：

| 场景 | 判定 | 组件来源 |
|---|---|---|
| 管理后台的表单、表格、弹窗、批量操作、系统配置 | B 端 | antd（`Form` / `Table` / `Modal` / `Drawer` / `DatePicker` 等），颜色/圆角由令牌覆盖 |
| 官网、公开列表、房源详情、租客/业主展示页 | C 端 | `.rent-*` 组件与页面 CSS；不引入 antd 表单/表格/弹窗 |
| 浮层与反馈（下拉、气泡、加载、toast） | 两端通用 | 允许 antd `Dropdown` / `Popover` / `Spin` / `message`，避免自造重复能力 |
| 同页混合（如工作台里的数据卡片 + 操作表格） | 按区块归属 | 展示区块走 `.rent-*`，提交/管理区块走 antd，不把 antd 样式硬套到展示卡 |

现状与例外：C 端三页（Home / PublicListings / PropertyDetail）已符合；B 端 CRM 看板、Payments 自绘表格属于业务特例，替换需单独评审，不做批量重写。

---

## 4. 禁止项（Anti-patterns）

- 禁止直接写十六进制色值（除令牌定义本身），一律走各端令牌。
- 禁止使用 `#1677ff` / `#1890ff`（antd 蓝）等与品牌冲突的蓝色作品牌元素。
- **禁止 antd 色板残留**：`#cf1322` / `#fff1f0` / `#fa8c16` / `#fffbe6` / `#fff7e6` / `#d46b08` / `#f5f5f5` / `#e5e5e5`。
- **禁止 Tailwind / slate 冷灰残留**：`#9ca3af` / `#e5e7eb` / `#c4c4c4` / `#f2f3f5` / `#94a3b8` / `#64748b`（除 `muted-foreground` 的 `#6b7280`）。
- 禁止自造浅底/浅色状态值（如 `#e7f6ee` / `#fff6e6` / `#fdecec` / `#e6f4fd`），统一用 `rgba(var(--*-rgb), 0.1)`。
- 禁止装饰性渐变背景/渐变按钮（**存量例外**：Web 登录页品牌区、小程序 admin 页头使用了 teal 渐变，待裁定 —— 见 §5.5）。
- 禁止 emoji 当功能图标。
- 禁止正文小于 12px、禁止文本对比度低于 4.5:1。
- 禁止 Tab 超过 5 项、禁止深层无返回的页面栈。

---

## 5. 三端令牌映射

### 5.1 令牌文件（三端唯一来源）

| 端 | 文件 | 命名前缀 | 引用方式 |
|---|---|---|---|
| Web (React) | `frontend-web/src/styles/tokens.css` | `--rent-*` / `--state-*` | `var(--rent-primary)` |
| App (React Native) | `mobile-app/src/theme/colors.ts` | `colors.*` | `colors.primary`、`colors.shadow.md` |
| 小程序 (Taro) | `miniapp/src/app.scss` | `--*`（无前缀） | `var(--primary)` |

命名对照（同一含义）：

| Web | App | 小程序 |
|---|---|---|
| `--rent-background` | `colors.background` | `--bg` |
| `--rent-ink` / `-2` / `-3` | `colors.ink` / `ink2` / `ink3` | `--ink` / `--ink-2` / `--ink-3` |
| `--rent-primary` | `colors.primary` | `--primary` |
| `--rent-sidebar-active` | `colors.sidebarActive` | `--sidebar-active` |
| `--rent-surface-2` | `colors.surface2` | `--surface-2` |
| `--state-success` | `colors.success` | `--success` |
| `--rent-radius-md` | `colors.radius.md` | `--radius-md` |

### 5.2 App（React Native）
`mobile-app/src/theme/colors.ts` 导出完整语义对象，组件通过 `import colors from '@/theme/colors'` 引用；`colors.alpha(colors.primaryRgb, 0.1)` 做透明度叠加。所有 StyleSheet 中的颜色必须用 `colors.xxx`。

> 存量硬编码热点（待清理）：`tenant/PaymentsScreen.tsx`、`tenant/MaintenanceScreen.tsx`（浅底 `#fff6e6/#e7f6ee/#fdecec/#e6f4fd/#f2f3f5`）、`owner/IncomeScreen.tsx`（`#34d399`）、`admin/AdminReviewScreen.tsx` 与 `employee/CalendarScreen.tsx`（`#8b5cf6` → 应为 `colors.purple` `#7a5cd6`）。`screens/TestScreen.tsx` 为开发沙箱，不参与规范。

### 5.3 小程序（Taro）

`miniapp/src/app.scss` 的 `page { }` 内定义 CSS 变量（`--primary` / `--primary-text` / `--ink-*` / `--*-ink` / `--radius-*` / `--shadow-*` 等），**数值只在该文件维护**，本文与页面 scss 均不重复。页面 scss 一律引用 `var(--xxx)`；`app.config.ts` 与页面 `*.config.ts` 的导航栏/TabBar 颜色固定为品牌 teal `#14b8a6`。

> 存量硬编码热点（待清理）：状态映射表大量直写令牌值（`viewings`/`payments`/`maintenance`/`listings`/`home` 的 `index.tsx`，如 `'#d97706'`），以及 antd/冷灰残留 `#cf1322` `#fff1f0` `#fffbe6` `#fa8c16` `#d46b08` `#999999` `#f5f5f5` `#9ca3af` `#e5e7eb` `#c4c4c4` `#94a3b8` `#8b5cf6`（详见 §4 与 §5.5）。

### 5.4 Web（React）
`frontend-web/src/styles/tokens.css` 的 `:root`（浅色）+ `.dark`（暗色）定义 `--rent-*`，各页 CSS 只引用变量。Web 端为三端中令牌化最彻底的一端，**作为基准实现**。

### 5.5 已知未对齐项（收口清单）

| # | 问题 | 现状 | 目标 |
|---|---|---|---|
| 1 | 圆角阶梯 | 各端已按自身令牌收敛（Web 6/10/14/20；App 8/12/16/20/24；小程序 12/20/36/48rpx） | 已完成；各端独立，**不追求像素一致**（见 §1.4） |
| 2 | 中性紫 | Web `#7a5cd6`；App/小程序硬编码 `#8b5cf6` | 统一 `#7a5cd6` |
| 3 | 冷灰渗漏 | 各端 `surface-3` / `fieldFill` / `avatar-bg` 已换暖调，`#94a3b8` 收口为 `ink-4` | `ink-3` 作辅助文字；`ink-4` / `ink-disabled` 仅占位与禁用 |
| 4 | 浅底自造 | App `#fff6e6` `#e7f6ee` `#fdecec` `#e6f4fd` | `rgba(var(--*-rgb), 0.1)` |
| 5 | Foreground | 三端均已统一为 `#1c2733` | 已完成 |
| 6 | 暗色模式 | Web 有完整 `.dark`；App / 小程序均无 | 明确是否需要在移动端支持 |
| 7 | 渐变禁令 | Web 登录页品牌区、小程序 `admin/accounts` 页头为 teal 渐变 | 裁定"品牌区允许 / 其他禁止"或全部改平色 |