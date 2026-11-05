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
    /* 实色主色按钮上的文字：深墨字 5.80:1（白字仅 2.49:1） */
    colorTextLightSolid: '#0b2f2b',
    colorBgBase: '#ffffff',
    colorTextBase: '#1c2733',
    colorBgLayout: '#fbf9f6',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgSpotlight: '#ffffff',
    colorText: '#1c2733',
    colorTextSecondary: '#55606c',
    colorTextTertiary: '#5f6b78',
    colorTextQuaternary: '#5f6b78',
    colorBorder: '#ece7df',
    colorBorderSecondary: '#ece7df',
    colorFill: '#f3f1ec',
    colorFillSecondary: '#f3f1ec',
    colorFillTertiary: '#f3f1ec',
    colorFillQuaternary: '#fbf9f6',
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
      bodyBg: '#fbf9f6',
      headerPadding: '0 24px',
    },
    Menu: {
      itemBg: 'transparent',
      itemColor: '#55606c',
      itemHoverBg: '#f3f1ec',
      itemHoverColor: '#1c2733',
      itemSelectedBg: '#d9f2ee',
      /* 品牌绿在浅青底上只有 2.13:1，选中项文字用墨色 */
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
      headerBg: '#f3f1ec',
      headerColor: '#55606c',
      rowHoverBg: '#f3f1ec',
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
  },
}
