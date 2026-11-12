/**
 * 筛选区排版令牌 — 与 C 端房源浏览页（PublicListingsScreen）对齐。
 *
 * 三个列表页（public / admin / employee）的筛选 UI 共用这一套视觉语言：
 * 胶囊形筛选 chip + 结果数行。管理端 / 员工端自有的筛选维度
 * （状态、排序、只看视频、学校、更多 等）也复用这里的 chip 尺寸 / 圆角 /
 * 高度 / 字号 / 选中态，从而保证筛选区排版与 C 端浏览页完全一致。
 *
 * 取值逐项对齐 PublicListingsScreen 的 `chip` / `chipText` / `count`：
 *  - chip 固定 `minHeight: touch.chip`(34)、`borderRadius: full`、hairline 描边、横向 padding 12
 *  - chipText 字号 `fontSize.sm`(13)、中性 ink2；选中态为实心主色底 + 白字
 *  - count 字号 sm(13)、ink3，水平 padding 16、上下 8
 */
import { StyleSheet } from 'react-native';
import colors from './colors';

export const filterStyles = StyleSheet.create({
  /** 未选中 chip：胶囊、hairline 描边、视觉高度 34、透明底 */
  chip: {
    minHeight: colors.touch.chip,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: colors.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: colors.fontSize.sm, lineHeight: colors.lineHeight.snug, color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: colors.fontWeight.semibold },
  /** 结果数行 */
  count: {
    fontSize: colors.fontSize.sm,
    lineHeight: colors.lineHeight.snug,
    color: colors.ink3,
    paddingHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.sm,
    marginBottom: colors.spacing.sm,
  },
});