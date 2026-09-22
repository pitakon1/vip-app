/**
 * 轻量响应式工具 — 平板 / 横屏自适应
 * 仅按窗口宽度断点做渐进增强，不改动手机端布局：
 * - isTablet   ：宽屏设备（宽度 >= BREAKPOINT_TABLET），启用内容居中与多栏
 * - isLandscape：横屏（width > height），与 isTablet 效果一致，可单独判断
 * - contentMaxWidth：平板/大屏时内容容器最大宽度（居中），避免贴边拉满
 * - breakpointStyle(b)：(b) memo 对象中 tablet 时为自定义样式，手机端为空对象
 * - columns(n)：算出一行可排的列数（tablet 以最多 4 列为上限自适应，手机端恒为 1）
 */
import { useWindowDimensions } from 'react-native';

export const BREAKPOINT_TABLET = 768;

// 平板/横屏下的内容最大宽度（超过则居中收拢，避免左侧贴边过宽）
export const CONTENT_MAX_WIDTH = 880;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= BREAKPOINT_TABLET;
  const isLandscape = width > height;
  const rich = isTablet || isLandscape;
  return {
    isTablet,
    isLandscape,
    // 平板/横屏才限制内容宽度；手机端无需
    contentMaxWidth: rich ? CONTENT_MAX_WIDTH : undefined,
  };
}

/**
 * 返回「容器」样式：平板/横屏时内容居中并限宽，手机端为空。
 * 用于包一层外层滚动容器，让大屏内容不再贴边拉满。
 */
export function useResponsiveContainerStyle() {
  const { contentMaxWidth } = useResponsive();
  if (!contentMaxWidth) return {};
  return {
    width: '100%' as const,
    alignSelf: 'center' as const,
    maxWidth: contentMaxWidth,
  };
}

/**
 * 断点样式：b 中相邻段落为平板/横屏增强样式，手机端忽略（返回空对象）。
 * 示例：breakpointStyle({ tablet: { flexDirection: 'row', flexWrap: 'wrap' } })
 */
export function breakpointStyle<T extends Record<string, unknown>>(
  b: T & { tablet?: Partial<T> },
) {
  // 该函数仅处理静态配置；动态 tablet 判断请用 useResponsive + 具名样式
  return b;
}

/**
 * 多栏列数：isTablet 时按 n 自适应（上限 4 列），手机端恒为 1 列。
 */
export function gridCols(n: number, isTablet: boolean) {
  if (!isTablet) return 1;
  return Math.max(1, Math.min(4, n));
}