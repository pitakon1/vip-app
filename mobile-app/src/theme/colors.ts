/**
 * VIP Rental 统一设计令牌 — 与 rental-full-draft/pages/login.html 品牌令牌对齐。
 * 唯一配色来源：UI-设计原则.md。组件内禁止硬编码色值，一律引用本对象。
 */
export const colors = {
  // ---- 主色 ----
  primary: '#14b8a6',
  primaryRgb: '20, 184, 166',
  primaryHover: '#0d9488',
  primaryForeground: '#ffffff',
  sidebarActive: '#d9f2ee',
  accent: '#06b6d4',

  // ---- 语义色 ----
  background: '#f2faf8',
  foreground: '#0f172a',
  card: '#ffffff',
  cardForeground: '#0f172a',
  popover: '#ffffff',
  popoverForeground: '#0f172a',
  ring: '#14b8a6',

  // ---- 中性阶梯 ----
  ink: '#0f172a',
  ink2: '#475569',
  ink3: '#94a3b8',
  line: '#e6eaf0',
  surface: '#ffffff',
  surface2: '#f1f5f9',
  muted: '#f1f5f9',
  mutedForeground: '#64748b',
  border: '#e6eaf0',
  input: '#e6eaf0',

  // 兼容别名（历史组件使用 colors.text）
  text: '#0f172a',

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

  // ---- 阴影 ----
  shadow: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 24,
      elevation: 5,
    },
    primary: {
      shadowColor: '#14b8a6',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 4,
    },
    card: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
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
