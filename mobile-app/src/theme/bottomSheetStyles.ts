/**
 * 底部弹层（Bottom Sheet）公共样式 —— 移动端批次 G 第二批统一来源。
 *
 * 结构约定（三段式）：
 *   Modal transparent + animationType="slide"
 *     bsMask     → justifyContent:'flex-end'（遮罩贴底）
 *       bsSheet  → maxHeight:'90%', overflow:'hidden'（外层限高+隐藏溢出）
 *         bsGrabber  → 36×4 视觉抓柄（非交互，纯视觉）
 *         ScrollView(contentContainerStyle=bsContent) → 中间内容可滚（flex:1 自动占据剩余）
 *         bsActions → flex-direction:'row', borderTop, 固定弹层底部
 *
 * 禁止新增依赖、禁止引入 Animated / Reanimated；仅依赖 React Native 内置 + colors + StyleSheet。
 * 需要 `<BottomSheet>` 组件时后续再建，当前只导出样式 token。
 */
import { StyleSheet } from 'react-native';
import colors from './colors';

export const bottomSheetStyles = StyleSheet.create({
  /** 遮罩：全屏半透明 + 子元素靠底部 */
  bsMask: { flex: 1, backgroundColor: colors.alpha(colors.inkRgb, 0.4), justifyContent: 'flex-end' },

  /** 弹层外壳：贴底 + 顶部圆角 + 90% 视口限高 + 隐藏溢出 */
  bsSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: '90%',
    overflow: 'hidden',
  },

  /** 视觉抓柄（纯装饰，非 Touchable） */
  bsGrabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: colors.spacing.sm,
    marginBottom: colors.spacing.xs,
  },

  /** ScrollView contentContainerStyle：内容区内边距（统一 16） */
  bsContent: {
    paddingHorizontal: colors.spacing.lg,
    paddingTop: colors.spacing.sm,
    paddingBottom: colors.spacing.md,
  },

  /** 固定底部操作区：带 borderTop 与上方内容视觉分隔 */
  bsActions: {
    flexDirection: 'row',
    gap: colors.spacing.md,
    paddingHorizontal: colors.spacing.lg,
    paddingTop: colors.spacing.md,
    paddingBottom: colors.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
