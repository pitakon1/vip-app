import type { ThemeConfig } from 'antd'

/**
 * Ant Design 主题配置 —— Web 端令牌的 JS 镜像。
 * 数值必须与 styles/tokens.css 保持一致；改令牌时两处同步，
 * 避免 antd 组件（按钮/表格/Menu）与自有组件出现两套主色和圆角。
 */
export const rentTheme: ThemeConfig = {
  token: {
    colorPrimary: '#14b8a6',
    colorInfo: '#14b8a6',
    colorSuccess: '#15803d',
    colorWarning: '#a64c07',
    colorError: '#dc2626',
    colorLink: '#14b8a6',
    /* 主色按钮上的文字：中性深墨 */
    colorTextLightSolid: '#1c2733',
    colorBgBase: '#ffffff',
    colorTextBase: '#1c2733',
    colorBgLayout: '#f6fbfa',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgSpotlight: '#ffffff',
    colorText: '#1c2733',
    colorTextSecondary: '#55606c',
    colorTextTertiary: '#5f6b78',
    colorTextQuaternary: '#5f6b78',
    colorBorder: '#e2e5e8',
    colorBorderSecondary: '#e2e5e8',
    colorFill: '#f3f4f6',
    colorFillSecondary: '#f3f4f6',
    colorFillTertiary: '#f3f4f6',
    colorFillQuaternary: '#f1f3f5',
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 6,
    fontFamily:
      '"Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    fontSize: 14,
    controlHeight: 36,
    controlHeightLG: 44,
    boxShadow:
      '0 1px 2px rgba(28, 39, 51, 0.04), 0 1px 3px rgba(28, 39, 51, 0.03)',
    boxShadowSecondary: '0 10px 30px -10px rgba(28, 39, 51, 0.14)',
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      headerHeight: 56,
      siderBg: '#ffffff',
      bodyBg: '#f6fbfa',
      headerPadding: '0 24px',
    },
    Menu: {
      itemBg: 'transparent',
      itemColor: '#55606c',
      itemHoverBg: '#f3f4f6',
      itemHoverColor: '#1c2733',
      itemSelectedBg: '#e8ebee',
      /* 选中项文字统一用墨色，主题色只用于图标/强调线 */
      itemSelectedColor: '#1c2733',
      itemHeight: 40,
      iconSize: 18,
      activeBarHeight: 0,
      activeBarBorderWidth: 0,
    },
    Card: {
      headerHeight: 56,
      paddingLG: 20,
    },
    Button: {
      borderRadius: 10,
      controlHeight: 36,
      fontWeight: 500,
    },
    Table: {
      headerBg: '#f3f4f6',
      headerColor: '#55606c',
      rowHoverBg: '#f3f4f6',
      borderColor: 'var(--rent-border)',
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
    },
    Input: {
      borderRadius: 10,
      controlHeight: 36,
      activeShadow: '0 0 0 3px rgba(20, 184, 166, 0.1)',
    },
    Select: { borderRadius: 10, controlHeight: 36 },
    Badge: { borderRadiusSM: 6 },
    Tag: { borderRadiusSM: 6 },
    Statistic: { contentFontSize: 28 },
    /* Modal / Drawer 属于浮层，圆角取 Web 的 xl 档（20），与卡片 lg（14）区分 */
    Modal: { borderRadiusLG: 20 },
    Drawer: { borderRadiusLG: 20 },
  },
}
