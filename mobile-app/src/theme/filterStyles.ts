/**
 * 筛选区排版令牌 — 与 C 端房源浏览页（PublicListingsScreen）对齐。
 *
 * 三个列表页（public / admin / employee）的筛选 UI 共用这一套视觉语言：
 * 胶囊形筛选 chip + 结果数行。管理端 / 员工端自有的筛选维度
 * （状态、排序、只看视频、学校、更多 等）也复用这里的 chip 尺寸 / 圆角 /
 * 高度 / 字号 / 选中态，从而保证筛选区排版与 C 端浏览页完全一致。
 *
 * 取值逐项对齐 PublicListingsScreen 的 `chip` / `chipText` / `count`：
 *  - chip 固定 `height: 34`、`borderRadius: full`、hairline 描边、横向 padding 14
 *  - chipText 字号 `fontSize.sm`(12)、中性 ink2；选中态为实心主色底 + 白字
 *  - count 字号 sm(12)、ink3，水平 padding 16、上 10 / 下 8
 */
import { StyleSheet } from 'react-native';
import colors from './colors';

export const filterStyles = StyleSheet.create({
  /** 未选中 chip：胶囊、hairline 描边、固定高度 34、透明底 */
  chip: {
    height: 34,
    borderRadius: colors.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  /** 结果数行 */
  count: {
    fontSize: colors.fontSize.sm,
    color: colors.ink3,
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
});