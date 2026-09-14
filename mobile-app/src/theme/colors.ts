/**
 * VIP Rental 统一设计令牌 — 高端版（Refined Premium）
 * 温暖米白基底 · 品牌青绿 · 柔和阴影 · 圆角层级
 * 唯一配色来源：UI-设计原则.md。组件内禁止硬编码色值，一律引用本对象。
 */
export const colors = {
  // ---- 主色 ----
  primary: '#14b8a6',
  primaryRgb: '20, 184, 166',
  primaryHover: '#0d9488',
  primaryForeground: '#ffffff',
  sidebarActive: '#d9f2ee',
  accent: '#0d9488',

  // ---- 语义色 ----
  background: '#fbf9f6',
  foreground: '#1c2733',
  card: '#ffffff',
  cardForeground: '#1c2733',
  popover: '#ffffff',
  popoverForeground: '#1c2733',
  ring: '#14b8a6',

  // ---- 中性阶梯（暖调墨色）----
  ink: '#1c2733',
  ink2: '#55606c',
  ink3: '#98a1ab',
  line: '#ece7df',
  surface: '#ffffff',
  surface2: '#f4f1ec',
  muted: '#f3f1ec',
  mutedForeground: '#6b7280',
  border: '#ece7df',
  input: '#ece7df',

  // 兼容别名（历史组件使用 colors.text）
  text: '#1c2733',

  // ---- 状态色 ----
  success: '#16a34a',
  successRgb: '22, 163, 74',
  successLight: 'rgba(22,163,74,0.08)',
  warning: '#d97706',
  warningRgb: '217, 119, 6',
  warningLight: 'rgba(217,119,6,0.08)',
  error: '#dc2626',
  errorRgb: '220, 38, 38',
  errorLight: 'rgba(220,38,38,0.08)',
  info: '#0ea5e9',
  infoRgb: '14, 165, 233',

  // ---- 透明度辅助 ----
  alpha: (rgb: string, a: number) => `rgba(${rgb}, ${a})`,

  // ---- 阴影（更柔和、空气感）----
  shadow: {
    sm: {
      shadowColor: '#1c2733',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    md: {
      shadowColor: '#1c2733',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.06,
      shadowRadius: 14,
      elevation: 3,
    },
    lg: {
      shadowColor: '#1c2733',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.09,
      shadowRadius: 28,
      elevation: 5,
    },
    primary: {
      shadowColor: '#14b8a6',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
      elevation: 4,
    },
    card: {
      shadowColor: '#1c2733',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
  },

  // ---- 圆角 ----
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
    xxl: 24,
    full: 999,
  },

  // ---- 间距 ----
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },

  // ---- 字号 ----
  fontSize: {
    xs: 11,
    sm: 12,
    base: 14,
    lg: 16,
    xl: 18,
    '2xl': 20,
    '3xl': 24,
    '4xl': 30,
  },
};

export default colors;
