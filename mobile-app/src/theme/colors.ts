/**
 * VIP Rental 移动端设计令牌（独立一套，不与 Web 共享数值）
 *
 * 设计取向：移动端以「触控 + 单手阅读」为准 —— 字号整体比 Web 大一档，
 * 圆角更饱满，间距按 4pt 网格，所有可点区域不小于 44。
 * Web 的令牌见 frontend-web/src/styles/tokens.css；两端只共享语义（主色、
 * 状态色的含义），具体尺度各自定义。
 *
 * 对比度（WCAG AA 正文 4.5:1）：
 * - 全站唯一青色是主题色 #14b8a6，不派生深青（#0f766e/#0d9488）或淡青（#e6f7f5/#d9f2ee）。
 * - 需要色的地方直接用 #14b8a6；其余面一律中性灰，状态色另用绿/橙/红/蓝。
 * - 主色底上的前景使用中性深墨 #1c2733（白字仅 2.49:1）。
 * - ink3 #5f6b78：白底 5.44:1、surface2 4.83:1（原 #98a1ab 白底 2.62:1，
 *   且 App 内被引用 665 次，多为 11/12px 辅助文字）
 * - 白字仅保留在深色底（照片压暗层、深色卡片）上，与品牌青无关。
 *
 * 组件内禁止硬编码色值 / 字号 / 圆角，一律引用本对象。
 */
export const colors = {
  // ---- 主色（全站唯一青色 = #14b8a6，不派生深青/淡青）----
  primary: '#14b8a6',
  primaryRgb: '20, 184, 166',
  /** 主色底上的前景：中性深墨（不使用深青色） */
  primaryForeground: '#1c2733',
  /** 主色作为文字时与面同值：只用 #14b8a6 */
  primaryText: '#14b8a6',
  /** 深色 / 照片压暗层 / 高饱和状态色底上的前景：白字 */
  onDark: '#ffffff',
  /** 中性浅底（原主色浅底改为中性，避免淡青） */
  primarySoft: '#eef0f2',
  sidebarActive: '#e8ebee',
  /** 品牌亮青：与主色同值，保留历史引用 */
  primaryBright: '#14b8a6',
  primaryBrightRgb: '20, 184, 166',
  // 中性墨色的 rgb 三元组，供 colors.alpha() 生成半透明浮层
  inkRgb: '28, 39, 51',

  // ---- 语义色 ----
  background: '#f6fbfa',
  foreground: '#1c2733',
  card: '#ffffff',

  // ---- 中性阶梯（中性灰，不带青/暖色偏移）----
  ink: '#1c2733',
  ink2: '#55606c',
  ink3: '#5f6b78', // 辅助文字：所有底色面 ≥4.8:1
  line: '#e2e5e8',
  surface: '#ffffff',
  surface2: '#eceef1',
  muted: '#f3f4f6',
  mutedForeground: '#5f6b78',
  border: '#e2e5e8',
  input: '#e2e5e8',
  // 输入填充 / 分段控件底（中性浅灰）
  fieldFill: '#f4f5f7',
  fieldFillBorder: '#dfe2e5',

  // 兼容别名（历史组件使用 colors.text）
  text: '#1c2733',

  // ---- 状态色（保留高饱和品牌语义；文字另行加深使用）----
  success: '#16a34a',
  successRgb: '22, 163, 74',
  successLight: 'rgba(22,163,74,0.08)',
  /** 状态文字 / 实心标签底：白底 5.02:1；原 #16a34a 作文字仅 3.1:1 */
  successInk: '#15803d',
  warning: '#d97706',
  warningRgb: '217, 119, 6',
  warningLight: 'rgba(217,119,6,0.08)',
  /** 状态文字 / 实心标签底：白底 5.4:1 */
  warningInk: '#a64c07',
  /** 预警卡浅底 / 描边（与 Web --state-warning-soft / -light 对齐） */
  warningSoft: '#fdf5e9',
  warningBorder: '#f4d9ad',
  error: '#dc2626',
  errorRgb: '220, 38, 38',
  errorLight: 'rgba(220,38,38,0.08)',
  /** 状态文字 / 实心标签底：白底 6.2:1 */
  errorInk: '#b91c1c',
  info: '#0ea5e9',
  infoRgb: '14, 165, 233',
  /** 状态文字 / 实心标签底：白底 5.93:1 */
  infoInk: '#0369a1',

  /**
   * ---- 标签（徽标）----
   * 全站只有一套中性标签：浅中性底 + 深中性字 + 1px 中性描边。
   * 不再按房源/学校类别分色 —— 卡面只保留价格一个强调色。
   * 底比中性 chip（surface2）亮一档，保证层级但不抢眼；8.32:1。
   */
  badge: {
    bg: '#f4f5f7',
    border: '#e2e5e8',
    fg: '#3f4a54',
  },

  // ---- 第三方品牌色（OAuth 按钮）----
  googleBlue: '#4285F4',
  googleRed: '#EA4335',
  googleGreen: '#34A853',
  googleYellow: '#FBBC05',
  /** 微信品牌绿（第三方品牌色，不并入主色/状态色） */
  wechatGreen: '#07C160',
  wechatGreenRgb: '7, 193, 96',
  black: '#000000',

  // ---- 浅色强调底 / 描边（选中态、错误态）：中性浅底，不再用淡青 ----
  tint: '#eef0f2',
  tintBorder: '#c9cfd5',
  errorBorder: 'rgba(220, 38, 38, 0.28)',

  // ---- 代码 / JSON 查看器（开发调试页）----
  codeBg: '#1e1e1e',
  codeText: '#d4d4d4',

  // ---- 透明度辅助 ----
  alpha: (rgb: string, a: number) => `rgba(${rgb}, ${a})`,

  // ---- 阴影（更柔和、空气感；只保留 4 档使用场景）----
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
      shadowOpacity: 0.3,
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

  /**
   * ---- 圆角（App 五档，全部落在 4pt 网格）----
   * sm 8  ：标签、缩略图、小图标底
   * md 12 ：按钮、输入框、筛选控件
   * lg 16 ：列表卡、信息卡
   * xl 20 ：大卡 / Hero / 宫格
   * xxl 24：BottomSheet、Modal
   * full  ：胶囊 / 圆形
   * 旧值 6/10/14/18/24 的“半档漂移”被消除；App 比 Web 多一档（20），
   * 因为移动端存在整屏卡片与弹层，需要更大的视觉柔化。
   */
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    full: 999,
  },

  // ---- 间距（4pt 网格）----
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    huge: 40,
  },

  // ---- 字号（移动端独立阶梯：12 / 14 / 16 / 20 / 24，与 Web 各自一套，不互相迁就）----
  // 用方括号访问：colors.fontSize['2xl']（键名不是合法标识符）
  // lg/title/3xl 保留键名以兼容既有调用点，取值并入同一阶梯。
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 16,
    title: 20,
    xl: 20,
    '2xl': 24,
    '3xl': 24,
  },

  // ---- 行高（与字号档配套，避免组件裸写 1.3/1.5）----
  lineHeight: {
    tight: 18,   // xs / 大数字
    snug: 20,    // sm
    base: 24,    // base
    titleSm: 24, // title(18)
    relaxed: 26, // lg
    title: 28,   // xl
    display: 34, // 2xl / 3xl
  },

  // ---- 字重（标题封顶 700，正文 400/500；中文/泰文小字号禁用 800）----
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  // ---- 可点区域（iOS HIG / Material 最小 44）----
  // 视觉尺寸可小于 44，用 hitSlop 或外层 padding 补足到 44
  touch: {
    min: 44,
    /** 34px 视觉控件补足到 44 时的默认外扩 */
    hitSlop: { top: 5, bottom: 5, left: 5, right: 5 },
  },

  // ---- 安全区（无极光/刘海数据时的最小兜底；实际优先 useSafeAreaInsets）----
  safeArea: {
    minTop: 44,
    minBottom: 20,
    horizontal: 16,
  },

  // ---- 布局 ---- 
  layout: {
    gutter: 16,
    maxContentWidth: 720,
    tabletBreakpoint: 768,
  },
};

export default colors;
