# VIP Rental 多端 UI 设计原则

> 本文件是 App（React Native）、小程序（Taro）、Web 三端 UI 的唯一设计参照。
> **配色来源**：`rental-full-draft/pages/login.html` 的品牌设计令牌（Modern Light）。
> **风格基调**（由 ui-ux-pro-max 设计系统导出）：Minimalism & Swiss Style —— 简洁、清爽、留白充足、功能性优先、栅格化、无装饰噪音。

---

## 1. 设计令牌（Design Tokens）— 唯一配色来源

所有端的所有组件，**禁止直接写十六进制颜色**，一律使用下列语义令牌。令牌名与含义已与 login.html 对齐，跨端映射方式见第 5 节。

### 1.1 语义色

| 令牌 | 值 | 用途 |
|---|---|---|
| `background` | `#f2faf8` | 页面/列表底色（冷调浅灰绿） |
| `foreground` | `#0f172a` | 全局文本主色 |
| `card` | `#ffffff` | 卡片 / 弹层 / 输入框底 |
| `card-foreground` | `#0f172a` | 卡片内文本主色 |
| `popover` | `#ffffff` | 弹层底 |
| `popover-foreground` | `#0f172a` | 弹层文本 |
| `primary` | `#14b8a6` | 品牌主色（CTA、选中态、Tab 高亮、链接） |
| `primary-foreground` | `#ffffff` | 主色按钮上的文字/图标 |
| `muted` | `#f1f5f9` | 弱化底（表头、占位区块、hover 底） |
| `muted-foreground` | `#64748b` | 弱化文本 |
| `border` | `#e6eaf0` | 细边框、分隔线 |
| `input` | `#e6eaf0` | 输入框描边 |
| `ring` | `#14b8a6` | 焦点环 / 选中描边 |

### 1.2 中性色阶梯（直接引用如 `ink` / `ink-2` / `ink-3`）

| 令牌 | 值 | 用途 |
|---|---|---|
| `ink` | `#0f172a` | 标题、主文本、金额数字 |
| `ink-2` | `#475569` | 正文、次级文本 |
| `ink-3` | `#94a3b8` | 占位符、辅助说明、时间戳 |
| `line` | `#e6eaf0` | 分割线、描边 |
| `surface` | `#ffffff` | 卡片/列表项白底 |
| `surface-2` | `#f1f5f9` | 次级底、表头、选中底淡色 |
| `sidebar-active` | `#d9f2ee` | 导航选中底色（浅 teal） |

### 1.3 状态色（仅语义状态使用，禁作装饰）

| 令牌 | 值 | 用途 |
|---|---|---|
| `success` | `#16a34a` | 成功、已签约、已收款 |
| `warning` | `#d97706` | 待办、即将到期、注意 |
| `error` | `#dc2626` | 错误、欠费、失败 |
| `info` | `#0ea5e9` | 信息、提示、进行中 |

状态色使用时注意对比度（见 2.4）。

### 1.4 圆角（克制阶梯，上限 16px）

| 令牌 | 值 | 用途 |
|---|---|---|
| `radius-sm` | `4px` | 小标签、日期格子 |
| `radius-md` | `8px` | 按钮、输入框、卡片角 |
| `radius-lg` | `16px` | 大卡片、弹层 |
| `radius-full` | `9999px` | 胶囊、Badge、头像 |

### 1.5 阴影（静态面 alpha ≤ 0.05；深阴影仅浮层）

| 令牌 | 值 |
|---|---|
| `shadow-1` | `0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.03)` |
| `shadow-2` | `0 8px 24px -8px rgba(15,23,42,0.18)`（卡片悬浮） |
| `shadow-3` | `0 24px 60px -20px rgba(15,23,42,0.30)`（Modal/浮层） |

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
- 圆角阶梯 4/8/16 按名字表使用，不随意加 10px/12px 等表外值。
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

- 禁止直接写十六进制色值（除令牌定义本身）。
- 禁止使用 `#1677ff`（antd 蓝）等与品牌冲突的蓝色作品牌元素。
- 禁止渐变背景/渐变按钮。
- 禁止 emoji 当功能图标。
- 禁止正文小于 12px、禁止文本对比度低于 4.5:1。
- 禁止 Tab 超过 5 项、禁止深层无返回的页面栈。

---

## 5. 三端令牌映射

### 5.1 App（React Native）— `mobile-app/src/theme/colors.ts`
导出完整语义对象 `colors`（主色 `primary: '#14b8a6'`，背景 `#f2faf8`，文本 `#0f172a` 等），组件通过 `import colors from '@/theme/colors'` 引用。所有 StyleSheet 中的颜色用 `colors.xxx`，禁止硬编码。

### 5.2 小程序（Taro）— `miniapp/src/app.scss`
在全局样式顶部定义 CSS 变量：

```scss
page {
  --bg: #f2faf8;
  --ink: #0f172a;
  --ink-2: #475569;
  --ink-3: #94a3b8;
  --line: #e6eaf0;
  --card: #ffffff;
  --surface-2: #f1f5f9;
  --primary: #14b8a6;
  --primary-foreground: #ffffff;
  --sidebar-active: #d9f2ee;
  --success: #16a34a;
  --warning: #d97706;
  --error: #dc2626;
  --info: #0ea5e9;
}
```

页面 scss 一律引用 `var(--xxx)`；`app.config.ts` 的导航栏/ TabBar 颜色固定为品牌 teal `#14b8a6`。

### 5.3 Web（React）— `frontend-web/src/styles/tokens.css` + 各页 CSS
已由 `rental-full-draft` 组件库以 `--rent-*` 变量实现，保持与 login.html 相同令牌值，不做改动。