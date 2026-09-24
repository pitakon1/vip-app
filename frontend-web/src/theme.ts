import type { ThemeConfig } from 'antd'

/**
 * Ant Design 主题配置，与 HaoFang.World 高端版设计令牌对齐。
 * 温暖米白基底 · 品牌青绿 · 柔和阴影 · 圆角层级，antd 组件自动贴合。
 */
export const rentTheme: ThemeConfig = {
  token: {
    colorPrimary: '#14b8a6',
    colorInfo: '#14b8a6',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorLink: '#14b8a6',
    colorBgBase: '#ffffff',
    colorTextBase: '#1c2733',
    colorBgLayout: '#fbf9f6',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgSpotlight: '#ffffff',
    colorText: '#1c2733',
    colorTextSecondary: '#55606c',
    colorTextTertiary: '#98a1ab',
    colorTextQuaternary: '#98a1ab',
    colorBorder: '#ece7df',
    colorBorderSecondary: '#ece7df',
    colorFill: '#f3f1ec',
    colorFillSecondary: '#f3f1ec',
    colorFillTertiary: '#f3f1ec',
    colorFillQuaternary: '#fbf9f6',
    borderRadius: 10,
    borderRadiusLG: 18,
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
      itemSelectedColor: '#14b8a6',
      itemHeight: 40,
      iconSize: 18,
      activeBarHeight: 0,
      activeBarBorderWidth: 0,
    },
    Card: {
      headerHeight: 56,
      paddingLG: 22,
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
