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

### 1.1 语义色

| 令牌 | 值 | 用途 |
|---|---|---|
| `background` | `#fbf9f6` | 页面/列表底色（温暖米白） |
| `foreground` | `#1c2733` | 全局文本主色 |
| `card` | `#ffffff` | 卡片 / 弹层 / 输入框底 |
| `card-foreground` | `#1c2733` | 卡片内文本主色 |
| `popover` | `#ffffff` | 弹层底 |
| `popover-foreground` | `#1c2733` | 弹层文本 |
| `primary` | `#14b8a6` | 品牌主色（CTA、选中态、Tab 高亮、链接） |
| `primary-hover` | `#0d9488` | 主色 hover/按下态（`accent` 同值） |
| `primary-foreground` | `#ffffff` | 主色按钮上的文字/图标 |
| `muted` | `#f3f1ec` | 弱化底（表头、占位区块、hover 底） |
| `muted-foreground` | `#6b7280` | 弱化文本 |
| `border` | `#ece7df` | 细边框、分隔线 |
| `input` | `#ece7df` | 输入框描边 |
| `ring` | `#14b8a6` | 焦点环 / 选中描边 |
| `sidebar-active` | `#d9f2ee` | 导航选中底色（浅 teal） |
| `surface-2` | `#f4f1ec` | 次级底、表头、选中底淡色 |

### 1.2 中性色阶梯（直接引用如 `ink` / `ink-2` / `ink-3`）

| 令牌 | 值 | 用途 |
|---|---|---|
| `ink` | `#1c2733` | 标题、主文本、金额数字（暖墨） |
| `ink-2` | `#55606c` | 正文、次级文本 |
| `ink-3` | `#98a1ab` | 占位符、辅助说明、时间戳 |
| `line` | `#ece7df` | 分割线、描边（暖描边） |
| `surface` | `#ffffff` | 卡片/列表项白底 |

> `muted` / `surface-2` / `sidebar-active` 见 1.1，不在此重复定义。

### 1.3 状态色（仅语义状态使用，禁作装饰）

| 令牌 | 值 | 用途 |
|---|---|---|
| `success` | `#16a34a` | 成功、已签约、已收款 |
| `warning` | `#d97706` | 待办、即将到期、注意 |
| `warning-soft` | `#fdf5e9` | 预警卡/待办条的浅底 |
| `warning-light` | `#f4d9ad` | 预警卡描边 |
| `error` | `#dc2626` | 错误、欠费、失败 |
| `error-hover` | `#b91c1c` | 危险操作 hover/按下态 |
| `info` | `#0ea5e9` | 信息、提示、进行中 |
| `purple` | `#7a5cd6` | 合同/流程类中性紫（**唯一紫色**，禁另起 `#8b5cf6`） |

状态色使用时注意对比度（见 2.4）。需要透明度叠加时统一用 `-rgb` 通道变量（如 `rgba(var(--success-rgb), 0.1)`），**不要新造浅底十六进制值**（如 `#e7f6ee` / `#fff6e6`）。

### 1.4 圆角（温和阶梯，上限 24px）

**基准值以 px 为准**，三端同名令牌必须映射到同一 px 值：

| 令牌 | px（Web / RN） | 小程序（rpx，= px×2） | 用途 |
|---|---|---|---|
| `radius-sm` | `6` | `12rpx` | 小标签、日期格子 |
| `radius-md` | `10` | `20rpx` | 按钮、输入框、筛选控件 |
| `radius-lg` | `18` | `36rpx` | 卡片、弹层、房源卡 |
| `radius-xl` | `24` | `48rpx` | Hero 大卡片、Banner |
| `radius-full` | `9999` | `999rpx` | 胶囊、Badge、头像 |

> ⚠️ 当前 `mobile-app` 的 `radius.lg = 14 / xl = 18 / xxl = 24`，`小程序` 的 `radius-sm..xl = 8/16/24/32rpx`（≈4/8/12/16px）**均低于基准一档**，需按上表对齐（见 §5.5）。

### 1.5 阴影（静态面 alpha ≤ 0.05；深阴影仅浮层）

阴影色基准统一为**暖墨** `rgba(28, 39, 51, α)`（禁止旧的冷调 `rgba(15, 23, 42, α)`）。模糊/扩散值允许按平台微调（RN 用 elevation、小程序用 rpx），但**层级语义必须一致**：

| 令牌 | Web（`--rent-shadow-*`） | 语义 |
|---|---|---|
| `shadow-1` | `0 1px 2px rgba(28,39,51,.04), 0 1px 3px rgba(28,39,51,.03)` | 静态卡片（α ≤ 0.05） |
| `shadow-2` | `0 10px 30px -10px rgba(28,39,51,.14)` | 卡片悬浮 / hover |
| `shadow-3` | `0 28px 70px -24px rgba(28,39,51,.26)` | Modal / 浮层 |
| `shadow-primary` | `0 8px 24px -4px rgba(20,184,166,.35)` | 主色 CTA / Hero（品牌青绿投影） |

> 副作用提醒：静态卡片优先"无阴影 + `border`"，只有需要浮起时才用 `shadow-2`，避免大面积散影。

### 1.6 间距（8pt 网格）

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 80`（对应 `s-1`…`s-8`）。组件间间距、卡片内边距、列表行高都取自该刻度。

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
- 正文最小字号 14px（RN 14 / 小程序 28rpx），辅助文本 12px；禁止低于 12px 的正文。
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
| Badge | `radius-full` 胶囊，状态色 10% 透明度底 + 状态色文字（如 `rgba(22,163,74,0.1)` + #16a34a） |
| 输入框 | 白底 + `border` 1px，聚焦时 `ring` 描边 + 3px `rgba(20,184,166,0.1)` 光环 |
| 导航高亮 | 文字 `primary` + 底色 `sidebar-active`（Tab/胶囊） |
| 表头/分组底 | `surface-2` |
| 分割线 | `line` 1px |
| 空态 | 居中图标（浅色）+ 说明文字用 `ink-3` |

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
在 `miniapp/src/app.scss` 的 `page { }` 内定义 CSS 变量：

```scss
page {
  --primary: #14b8a6;   --primary-rgb: 20, 184, 166;  --primary-hover: #0d9488;
  --bg: #fbf9f6;        --card: #ffffff;
  --ink: #1c2733;       --ink-2: #55606c;            --ink-3: #98a1ab;
  --line: #ece7df;      --surface-2: #f4f1ec;         --sidebar-active: #d9f2ee;
  --success: #16a34a;   --warning: #d97706;           --error: #dc2626;  --info: #0ea5e9;
  --radius-sm: 12rpx;   --radius-md: 20rpx;           --radius-lg: 36rpx;  --radius-xl: 48rpx;
}
```

页面 scss 一律引用 `var(--xxx)`；`app.config.ts` 与页面 `*.config.ts` 的导航栏/TabBar 颜色固定为品牌 teal `#14b8a6`。

> 存量硬编码热点（待清理）：状态映射表大量直写令牌值（`viewings`/`payments`/`maintenance`/`listings`/`home` 的 `index.tsx`，如 `'#d97706'`），以及 antd/冷灰残留 `#cf1322` `#fff1f0` `#fffbe6` `#fa8c16` `#d46b08` `#999999` `#f5f5f5` `#9ca3af` `#e5e7eb` `#c4c4c4` `#94a3b8` `#8b5cf6`（详见 §4 与 §5.5）。

### 5.4 Web（React）
`frontend-web/src/styles/tokens.css` 的 `:root`（浅色）+ `.dark`（暗色）定义 `--rent-*`，各页 CSS 只引用变量。Web 端为三端中令牌化最彻底的一端，**作为基准实现**。

### 5.5 已知未对齐项（收口清单）

| # | 问题 | 现状 | 目标 |
|---|---|---|---|
| 1 | 圆角阶梯 | Web `6/10/18`；App `6/10/14/18/24`；小程序 `8/16/24/32rpx`(≈4/8/12/16px) | 三端统一到 §1.4 基准 `6/10/18/24` |
| 2 | 中性紫 | Web `#7a5cd6`；App/小程序硬编码 `#8b5cf6` | 统一 `#7a5cd6` |
| 3 | 冷灰渗漏 | App `#f2f3f5`；小程序 `#999999` `#f5f5f5` `#9ca3af` `#e5e7eb` `#c4c4c4` `#94a3b8` | 统一到 `ink-3` `#98a1ab` / `surface-2` `#f4f1ec` |
| 4 | 浅底自造 | App `#fff6e6` `#e7f6ee` `#fdecec` `#e6f4fd` | `rgba(var(--*-rgb), 0.1)` |
| 5 | Foreground | Web `--rent-foreground: #16202b`；App/小程序 `#1c2733` | 统一 `#1c2733`（或 Web 显式声明为对照色） |
| 6 | 暗色模式 | Web 有完整 `.dark`；App / 小程序均无 | 明确是否需要在移动端支持 |
| 7 | 渐变禁令 | Web 登录页品牌区、小程序 `admin/accounts` 页头为 teal 渐变 | 裁定"品牌区允许 / 其他禁止"或全部改平色 |