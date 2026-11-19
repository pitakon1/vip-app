/**
 * 统一筛选栏（对齐房源浏览页 ListingsFeed 的贝壳式交互）。
 *
 * 视觉与行为口径（三端一致）：
 *  - 筛选条 = 一行纯文字 tab + 下拉箭头，选中 / 展开态用主色 + 底部主色下划线；
 *  - 点击 tab 就地在其下展开面板，与筛选条同宽、同底色、无圆角、无间隙；
 *  - 面板内先左侧一级类目竖栏（可选），右侧大号矩形选项卡片；
 *  - 底部固定「重置 / 确定」操作条；
 *  - 遮罩只压面板下方的列表区（由页面用 PanelBackdrop + usePanelAnchor 实现）。
 *
 * 本组件只收口「筛选条 + 面板外壳 + 选项卡片」这些跨页共用的部分；
 * 各页筛选维度差异很大，面板内容仍由页面传入。
 */
import React, { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';

export interface FilterTabDef {
  key: string;
  label: string;
  active?: boolean;
  badge?: number;
}

/** 筛选条：单行横向滚动，纯文字 + 箭头，无边框胶囊 */
export function FilterTabBar({
  tabs,
  openKey,
  onToggle,
}: {
  tabs: FilterTabDef[];
  openKey: string | null;
  onToggle: (key: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabsRow}
      contentContainerStyle={styles.tabsContent}
    >
      {tabs.map((tb) => (
        <TouchableOpacity
          key={tb.key}
          style={[
            styles.tab,
            openKey === tb.key && styles.tabOpen,
            tb.active && styles.tabActive,
          ]}
          onPress={() => onToggle(tb.key)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: !!tb.active, expanded: openKey === tb.key }}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.tabLabel,
              (openKey === tb.key || tb.active) && styles.tabLabelActive,
            ]}
          >
            {tb.label}
          </Text>
          {!!tb.badge && tb.badge > 0 ? (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{tb.badge}</Text>
            </View>
          ) : null}
          <Ionicons
            name={openKey === tb.key ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={tb.active || openKey === tb.key ? colors.primary : colors.ink3}
          />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

/** 展开面板外壳：与筛选条同宽同底，底部固定操作条 */
export function FilterPanel({
  children,
  onReset,
  onConfirm,
  resetLabel,
  confirmLabel,
  confirmDisabled,
}: {
  children: ReactNode;
  onReset?: () => void;
  onConfirm?: () => void;
  resetLabel: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
}) {
  return (
    <View style={styles.panel}>
      {children}
      {onReset || onConfirm ? (
        <View style={styles.panelActions}>
          <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.7}>
            <Text style={styles.resetText}>{resetLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, confirmDisabled && styles.confirmBtnDisabled]}
            onPress={onConfirm}
            activeOpacity={0.7}
            disabled={confirmDisabled}
          >
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

/** 面板内分组标题 */
export function FilterGroupTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.groupTitle}>{children}</Text>;
}

/** 选项卡片：大号矩形、浅灰底，选中 = 浅中性底 + 主色描边 + 主色字
 *  value 传数组即多选模式，选中判定改为「包含」；点击仍交给调用方切换。 */
export function FilterOptionGrid({
  title,
  options,
  value,
  onChange,
}: {
  title?: string;
  options: { key: string; label: string }[];
  value: string | string[];
  onChange: (key: string) => void;
}) {
  return (
    <>
      {title ? <FilterGroupTitle>{title}</FilterGroupTitle> : null}
      <View style={styles.optionGrid}>
        {options.map((o) => {
          const on = Array.isArray(value) ? value.includes(o.key) : value === o.key;
          return (
            <TouchableOpacity
              key={o.key || 'any'}
              style={[styles.optionCard, on && styles.optionCardActive]}
              onPress={() => onChange(o.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.optionText, on && styles.optionTextActive]} numberOfLines={1}>
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

/** 左侧一级类目竖栏（贝壳式）：选中白底 + 左侧主色条 */
export function FilterRail({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={styles.rail}>
      {items.map((it) => {
        const on = value === it.key;
        return (
          <TouchableOpacity
            key={it.key}
            style={[styles.railItem, on && styles.railItemActive]}
            onPress={() => onChange(it.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.railText, on && styles.railTextActive]}>{it.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** 标准筛选栏组合：tabs + 就地展开面板 */
export default function FilterBar({
  tabs,
  openKey,
  onToggle,
  anchorRef,
  onLayoutAnchor,
  children,
  tone,
}: {
  tabs: FilterTabDef[];
  openKey: string | null;
  onToggle: (key: string) => void;
  anchorRef?: React.Ref<View>;
  onLayoutAnchor?: () => void;
  children: ReactNode;
  tone?: 'default' | 'plain';
}) {
  return (
    <View ref={anchorRef} onLayout={onLayoutAnchor} style={styles.zone}>
      <FilterTabBar tabs={tabs} openKey={openKey} onToggle={onToggle} />
      {openKey ? <View style={tone === 'plain' ? styles.panelPlain : styles.panel}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: { position: 'relative' },
  tabsRow: {
    flexGrow: 0,
    marginHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    overflow: 'hidden',
  },
  tabsContent: { flexGrow: 1 },
  tab: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  tabOpen: { backgroundColor: colors.surface2 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabLabel: {
    fontSize: colors.fontSize.sm,
    color: colors.ink2,
    fontWeight: '500',
    maxWidth: 92,
  },
  tabLabelActive: { color: colors.primary, fontWeight: '600' },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: colors.radius.full,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: colors.onDark,
    fontSize: colors.fontSize.xs,
    fontWeight: '600',
    lineHeight: colors.lineHeight.tight,
  },
  panel: {
    marginTop: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  panelPlain: {
    marginTop: 0,
    backgroundColor: colors.surface,
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  groupTitle: { fontSize: 12, color: colors.ink2, marginBottom: 8, marginTop: 4 },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  optionCard: {
    // 约 105×44 的矩形卡片，两列流式；44 同时满足移动端触控下限
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 44,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  optionCardActive: {
    backgroundColor: colors.tint,
    borderColor: colors.primary,
  },
  optionText: { fontSize: colors.fontSize.sm, color: colors.ink },
  optionTextActive: { color: colors.primary, fontWeight: '600' },
  panelActions: { flexDirection: 'row', gap: 12, paddingTop: 12 },
  resetBtn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: colors.radius.sm,
    backgroundColor: colors.surface2,
  },
  resetText: { fontSize: colors.fontSize.base, color: colors.ink, fontWeight: '500' },
  confirmBtn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: colors.radius.sm,
    backgroundColor: colors.primary,
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmText: { fontSize: colors.fontSize.base, color: colors.primaryForeground, fontWeight: '600' },
  rail: { width: 84, alignSelf: 'stretch', backgroundColor: colors.surface2 },
  railItem: { height: 48, justifyContent: 'center', paddingLeft: 16 },
  railItemActive: { backgroundColor: colors.surface },
  railText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  railTextActive: { color: colors.primary, fontWeight: '600' },
});
