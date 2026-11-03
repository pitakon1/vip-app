/**
 * 侧栏菜单 SVG path 常量表。
 *
 * 所有侧栏 / 移动端底部 Tab 图标从此处取 `d` 字符串，
 * 渲染参数（24px / stroke-width: 2 / fill: none）统一在 MainLayout 的 `icon()` helper 里设置。
 * 页面级图标（@ant-design/icons）不在此表范围。
 */

export const MENU_ICONS = {
  /** 2x2 面板分块 — tenant/employee dashboard */
  PANELS:        "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  /** 建筑（含门） — properties / my-properties / my-listings */
  BUILDING:      "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22",
  /** 4 格方 — admin dashboard */
  GRID_4:        "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  /** 扬声器 — marketing */
  MEGAPHONE:     "M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z M14 8a4 4 0 0 1 0 8",
  /** 美元符号 — income / commission-rules */
  DOLLAR:        "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  /** 信用卡 — payments */
  CREDIT_CARD:   "M1 4h22v16H1z M1 10h23",
  /** 扳手 — maintenance */
  WRENCH:        "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  /** 文件 — documents */
  FILE:          "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6",
  /** 星 — services */
  STAR:          "M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  /** 文件 + 勾 — contracts (check at 13) */
  FILE_CHECK:    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13l2 2 4-4",
  /** 文件 + 勾（位置 12）— broker-agreements */
  FILE_CHECK_ALT:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 12l2 2 4-4",
  /** 信息圆圈 — company / profile */
  INFO:          "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01",
  /** 时钟 — viewings / attendance */
  CLOCK:         "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
  /** 闪光 — performance */
  SPARKLES:      "M12 15l3.5-3.5 M12 3v0 M2 12h2 M20 12h2 M12 22v0",
  /** 单人头像 — leads / contacts */
  USER:          "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0",
  /** 聊天气泡 — chat / listing-review / dedupe-review（后者其实用 SWAP） */
  CHAT:          "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  /** 折线上升 — operations-board */
  TREND:         "M3 3v18h18 M7 14l4-5 3 3 5-7",
  /** 竖条 — trend */
  BARS:          "M18 20V10M12 20V4M6 20v-6",
  /** 盾牌 + 时钟 — attendance-manage */
  SHIELD_CLOCK:  "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2 M3 3l2 2 M21 3l-2 2",
  /** 双头像 — system users / partner-members */
  USERS:         "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  /** 立柱 — partners */
  COLUMNS:       "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01",
  /** 分组用户 — groups */
  GROUPED_USERS: "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M18 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 21v-1a5 5 0 0 1 5-5 5 5 0 0 1 5 5v1 M21 16.5V21 M19.5 18.75h3",
  /** 层叠菱形 — departments */
  LAYERS:        "M12 3l9 5-9 5-9-5 9-5z M3 12l9 5 9-5 M3 16l9 5 9-5",
  /** 地球 — data-scopes */
  GLOBE:         "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  /** 书 — data-dictionary */
  BOOK:          "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  /** 钥匙 — permissions */
  KEY:           "M21 2l-2 2 M3 22l2-2 M5 20l-2-2 M3 6h4 M7 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0z M9.5 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8z",
  /** 勾选圆圈 — review-center */
  CHECK_CIRCLE:  "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
  /** 双向箭头 — dedupe-review */
  SWAP:          "M8 3H5a2 2 0 0 0-2 2v3 M8 21H5a2 2 0 0 1-2-2v-3 M21 8V5a2 2 0 0 0-2-2h-3 M21 16v3a2 2 0 0 1-2 2h-3 M3 12h18",
  /** 徽章头像 — employees */
  BADGE_USER:    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  /** 齿轮 — settings */
  COG:           "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  /** 日历 — partner-attendance */
  CALENDAR:      "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
} as const

export type MenuIconKey = keyof typeof MENU_ICONS
