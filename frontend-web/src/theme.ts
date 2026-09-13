import type { ThemeConfig } from 'antd'

/**
 * Ant Design 主题配置，与 HaoFang.World 设计稿令牌对齐。
 * 通过 ConfigProvider 全局应用，使 antd 组件自动贴合青绿主色 / 浅青底 / 细边框视觉。
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
    colorTextBase: '#0f172a',
    colorBgLayout: '#f2faf8',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgSpotlight: '#ffffff',
    colorText: '#0f172a',
    colorTextSecondary: '#475569',
    colorTextTertiary: '#94a3b8',
    colorTextQuaternary: '#94a3b8',
    colorBorder: '#e6eaf0',
    colorBorderSecondary: '#e6eaf0',
    colorFill: '#f1f5f9',
    colorFillSecondary: '#f1f5f9',
    colorFillTertiary: '#f1f5f9',
    colorFillQuaternary: '#f2faf8',
    borderRadius: 8,
    borderRadiusLG: 16,
    borderRadiusSM: 4,
    fontFamily:
      '"Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    fontSize: 14,
    controlHeight: 36,
    controlHeightLG: 44,
    boxShadow:
      '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.03)',
    boxShadowSecondary: '0 8px 24px -8px rgba(15, 23, 42, 0.18)',
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      headerHeight: 56,
      siderBg: '#ffffff',
      bodyBg: '#f2faf8',
      headerPadding: '0 24px',
    },
    Menu: {
      itemBg: 'transparent',
      itemColor: '#475569',
      itemHoverBg: '#f1f5f9',
      itemHoverColor: '#0f172a',
      itemSelectedBg: '#d9f2ee',
      itemSelectedColor: '#14b8a6',
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
      borderRadius: 8,
      controlHeight: 36,
      fontWeight: 500,
    },
    Table: {
      headerBg: '#f1f5f9',
      headerColor: '#475569',
      rowHoverBg: '#f1f5f9',
      borderColor: '#e6eaf0',
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
    },
    Input: {
      borderRadius: 8,
      controlHeight: 36,
      activeShadow: '0 0 0 3px rgba(20, 184, 166, 0.1)',
    },
    Select: { borderRadius: 8, controlHeight: 36 },
    Badge: { borderRadiusSM: 4 },
    Tag: { borderRadiusSM: 4 },
    Statistic: { contentFontSize: 28 },
  },
}
