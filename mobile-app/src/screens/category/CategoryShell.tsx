import { LIST_PAGE_SIZE } from '@/lib/pagination';
/**
 * 贝壳式分类页共用外壳（App）。
 *
 * 5 个 C 端分类页（租房 / 新房 / 二手房 / 商铺办公 / 厂房）共用同一套 6 段骨架，
 * 差异只在中段模块与卡片字段。本文件提供骨架的通用原语，各页面按需组合：
 *  1) CategoryTopBar     顶部栏（磨砂玻璃：rgba(255,255,255,0.88) + blur(14px)）
 *  2) EntryGrid          入口宫格（2×5，彩色圆角方块图标 + 文字）
 *  3) CapsuleRow         数据胶囊（新房页）
 *  4) PlainTabs          纯文字 Tab（选中深墨加粗 / 未选中浅灰，无底色无描边）
 *  5) MarketCompareCard  行情对比卡 / ServiceBar 服务条 / BannerCard 严选横幅
 *  6) CategoryListScreen 列表页外壳：Tab + 筛选行（顶部下拉面板 + 方块选项）+ 卡片列表
 *
 * 颜色一律取 theme/colors 令牌，禁止硬编码色值、禁止渐变。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import ListState from '@/components/ListState';
import LoadingState from '@/components/LoadingState';
import { usePanelToggle } from '@/components/PanelBackdrop';
import { notifyError } from '@/utils/feedback';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** 磨砂玻璃顶栏背景：对齐贝壳顶部导航（半透明白 + 模糊）。
 *  与项目其余 App 页面口径一致——用半透明实底 View 近似磨砂效果，
 *  不引入 expo-blur 这类原生依赖（Expo Go 下不可用且项目未装）。 */
const FROSTED_BG = colors.alpha('255,255,255', 0.88);

export interface GridItem {
  key: string;
  label: string;
  icon: IoniconName;
  color: string;
  tint: string;
  onPress?: () => void;
}

export interface CapsuleItem {
  key: string;
  value: string | number;
  label: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

/** 一个筛选组 = 筛选行上的一枚触发块；`children` 存在时，面板一次性铺开多组（「更多」）。 */
export interface FilterGroup {
  key: string;
  label: string;
  options?: FilterOption[];
  children?: FilterGroup[];
}

export interface QuickTag {
  key: string;
  label: string;
  /** 绑定的筛选组 key；点击即在「该值 ↔ 不限」间切换。 */
  group?: string;
  value?: string;
  /** 置 true 时点击清空全部筛选（仅保留排序），对应「全部」标签。 */
  reset?: boolean;
}

/** 分类页筛选状态：组 key → 选中值（'' 表示「不限」）。 */
export type FilterValues = Record<string, string>;

// ==================== 顶部栏 ====================

export function CategoryTopBar({
  title,
  city,
  onCityPress,
  searchPlaceholder,
  keyword,
  onKeywordChange,
  rightActions,
}: {
  title: string;
  city?: string;
  onCityPress?: () => void;
  searchPlaceholder: string;
  keyword: string;
  onKeywordChange: (v: string) => void;
  rightActions?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useI18n();

  return (
    <View style={styles.topBarWrap}>
      <View style={[styles.topBarBlur, { paddingTop: insets.top }]}>
        <View style={styles.topBarRow}>
          <TouchableOpacity
            style={styles.circleBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('pub.back')}
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.topRight}>{rightActions}</View>
        </View>

        <View style={styles.topBarRow2}>
          <TouchableOpacity
            style={styles.cityPill}
            activeOpacity={0.7}
            hitSlop={colors.touch.hitSlop}
            onPress={onCityPress}
            accessibilityRole="button"
            accessibilityLabel={t('home.selectCity')}
          >
            <Ionicons name="location-outline" size={13} color={colors.ink2} />
            <Text style={styles.cityText} numberOfLines={1}>
              {city || t('home.currentCity')}
            </Text>
            <Ionicons name="chevron-down" size={11} color={colors.ink3} />
          </TouchableOpacity>
          <View style={styles.topSearch}>
            <Ionicons name="search" size={15} color={colors.ink3} />
            <TextInput
              style={styles.topSearchInput}
              value={keyword}
              onChangeText={onKeywordChange}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.ink3}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
              accessibilityLabel={searchPlaceholder}
            />
            {keyword ? (
              <TouchableOpacity
                onPress={() => onKeywordChange('')}
                hitSlop={colors.touch.hitSlop}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('common.clear')}
              >
                <Ionicons name="close-circle" size={16} color={colors.ink3} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

/** 顶栏右侧的圆形图标动作（收藏 / 消息）。 */
export function TopIconAction({ icon, onPress, label }: { icon: IoniconName; onPress: () => void; label: string }) {
  return (
    <TouchableOpacity
      style={styles.circleBtn}
      activeOpacity={0.7}
      hitSlop={colors.touch.hitSlop}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={colors.ink} />
    </TouchableOpacity>
  );
}

/** 分类页顶栏统一的右侧动作（收藏 / 消息）。 */
export function CategoryRightActions({ navigation }: { navigation: any }) {
  const { t } = useI18n();
  return (
    <>
      <TopIconAction
        icon="heart-outline"
        label={t('category.a11yFavorite')}
        onPress={() => navigation.navigate('Favorites')}
      />
      <TopIconAction
        icon="chatbubble-outline"
        label={t('category.a11yMessages')}
        onPress={() => navigation.navigate('ChatList')}
      />
    </>
  );
}

// ==================== 入口宫格（2×5）====================

export function EntryGrid({ items }: { items: GridItem[] }) {
  return (
    <View style={styles.grid}>
      {items.map((it) => (
        <TouchableOpacity
          key={it.key}
          style={styles.gridItem}
          activeOpacity={0.7}
          onPress={it.onPress}
          accessibilityRole="button"
          accessibilityLabel={it.label}
        >
          <View style={[styles.gridIcon, { backgroundColor: it.tint }]}>
            <Ionicons name={it.icon} size={24} color={it.color} />
          </View>
          <Text style={styles.gridLabel} numberOfLines={1}>
            {it.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ==================== 数据胶囊（新房页）====================

export function CapsuleRow({ items }: { items: CapsuleItem[] }) {
  return (
    <View style={styles.capsuleRow}>
      {items.map((it) => (
        <View key={it.key} style={styles.capsule}>
          <Text style={styles.capsuleValue} numberOfLines={1}>
            {it.value}
          </Text>
          <Text style={styles.capsuleLabel} numberOfLines={1}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ==================== 纯文字 Tab ====================

export function PlainTabs({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string }[];
  value?: string;
  onChange?: (key: string) => void;
}) {
  return (
    <View style={styles.plainTabs}>
      {items.map((it) => {
        const active = value === it.key;
        return (
          <TouchableOpacity
            key={it.key}
            style={styles.plainTab}
            activeOpacity={0.7}
            onPress={() => onChange?.(it.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={it.label}
          >
            <Text style={[styles.plainTabText, active && styles.plainTabTextActive]}>{it.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ==================== 行情对比卡 / 服务条 / 横幅 ====================

export function MarketCompareCard({
  left,
  right,
  actionLabel,
  onPress,
}: {
  left: { name: string; price: string };
  right: { name: string; price: string };
  actionLabel: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.compareCard} activeOpacity={onPress ? 0.85 : 1} onPress={onPress}>
      <View style={styles.compareSide}>
        <Text style={styles.compareDist} numberOfLines={1}>
          {left.name}
        </Text>
        <Text style={styles.comparePrice} numberOfLines={1}>
          {left.price}
        </Text>
      </View>
      <Text style={styles.compareVs}>VS</Text>
      <View style={styles.compareSide}>
        <Text style={styles.compareDist} numberOfLines={1}>
          {right.name}
        </Text>
        <Text style={styles.comparePrice} numberOfLines={1}>
          {right.price}
        </Text>
      </View>
      <Text style={styles.compareLink}>{actionLabel}</Text>
    </TouchableOpacity>
  );
}

export function ServiceBar({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.serviceBar}>
      <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
      <Text style={styles.serviceText} numberOfLines={1}>
        {text}
      </Text>
      <TouchableOpacity style={styles.serviceBtn} activeOpacity={0.8} onPress={onAction}>
        <Text style={styles.serviceBtnText}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function BannerCard({
  title,
  sub,
  actionLabel,
  onPress,
}: {
  title: string;
  sub: string;
  actionLabel: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.banner}>
      <View style={{ flex: 1 }}>
        <Text style={styles.bannerTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.bannerSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.bannerBtn}
        activeOpacity={0.8}
        hitSlop={{ top: 7, bottom: 7, left: 6, right: 6 }}
        onPress={onPress}
      >
        <Text style={styles.bannerBtnText}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ==================== 筛选：方块选项 + 顶部下拉面板 ====================

function BlockOption({
  label,
  active,
  onPress,
  width,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  width?: number;
}) {
  return (
    <TouchableOpacity
      style={[styles.block, width ? { width } : null, active && styles.blockActive]}
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={[styles.blockText, active && styles.blockTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * 筛选面板（对齐贝壳列表页）：面板从筛选条下沿整幅展开，与筛选条同宽同底色，
 * 无间隙、无圆角、不做浮动卡片；左侧为一级类目竖栏（区域/租金/房型/更多…），
 * 右侧只渲染当前类目的选项，超出高度时仅右栏滚动，左栏固定不滚；
 * 底部「重置 / 确定」固定在面板底部，不随内容滚动。
 * 面板下方列表区被遮罩压暗，遮罩不覆盖筛选条与面板本身。
 * 面板内只改本地 draft，点「确定」才把这些改动一次性合并回已应用值。 */
function FilterPanel({
  groups,
  activeKey,
  values,
  onApply,
  onClose,
  topOffset,
}: {
  groups: FilterGroup[];
  activeKey: string;
  values: FilterValues;
  onApply: (patch: FilterValues) => void;
  onClose: () => void;
  topOffset: number;
}) {
  const { t } = useI18n();
  const { height: winH } = useWindowDimensions();
  /** 一级类目 → 需要渲染/提交的叶子组（「更多」展开为多个子组） */
  const sectionsOf = useCallback(
    (g: FilterGroup) => (g.children && g.children.length ? g.children : [g]),
    [],
  );
  const allKeys = useMemo(
    () => groups.flatMap((g) => sectionsOf(g).map((leaf) => leaf.key)),
    [groups, sectionsOf],
  );
  const [draft, setDraft] = useState<FilterValues>(() => {
    const init: FilterValues = {};
    allKeys.forEach((k) => {
      init[k] = values[k] ?? '';
    });
    return init;
  });
  const [subKey, setSubKey] = useState(activeKey);
  const active = groups.find((g) => g.key === subKey) ?? groups[0];
  const sections = useMemo(() => sectionsOf(active), [active, sectionsOf]);
  const contentRef = useRef<ScrollView>(null);
  /** 左栏宽度随最长一级类目名自适应（按字号估宽 + 左右各 12 内边距），88~132 */
  const navWidth = useMemo(() => {
    const longest = groups.reduce((n, g) => Math.max(n, g.label.length), 0);
    return Math.min(132, Math.max(88, longest * colors.fontSize.sm + 24));
  }, [groups]);
  /** 右栏可视宽度（onLayout 实测），用于把选项块精确排成每行 3 个 */
  const [contentWidth, setContentWidth] = useState(0);
  const chipWidth = contentWidth > 0
    ? Math.floor((contentWidth - colors.spacing.lg * 2 - colors.spacing.sm * 2) / 3)
    : undefined;

  /** 左栏点击：切换类目，右栏回到顶部（左栏自身不滚动） */
  const jumpTo = (key: string) => {
    setSubKey(key);
    contentRef.current?.scrollTo({ y: 0, animated: false });
  };

  const setDraftValue = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  /** 只重置当前类目；排序没有「不限」语义，保持原值 */
  const resetDraft = () => {
    setDraft((prev) => {
      const next = { ...prev };
      sections.forEach((s) => {
        if (s.key !== 'sort') next[s.key] = '';
      });
      return next;
    });
  };

  const confirm = () => {
    onApply(draft);
    onClose();
  };

  // 贝壳 App 实测：面板紧贴筛选条下沿整幅下拉，高度随内容、超过上限时内部滚动
  const panelTop = Math.max(0, topOffset);
  const panelMaxHeight = Math.min(
    Math.round(winH * 0.68),
    Math.max(280, winH - panelTop - 8),
  );

  return (
    <View style={[styles.panelOverlay, { top: panelTop }]}>
      {/* 遮罩只压暗面板下方的列表区；面板与筛选条本身保持不透明、可操作 */}
      <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      <View style={[styles.panel, { maxHeight: panelMaxHeight }]}>
        <View style={styles.panelBody}>
          {/* 左侧一级类目竖栏：固定不滚动 */}
          <View style={[styles.panelNav, { width: navWidth }]}>
            <View style={styles.panelNavInner}>
              {groups.map((g) => {
                const on = g.key === active.key;
                return (
                  <TouchableOpacity
                    key={g.key}
                    style={[styles.panelNavItem, on && styles.panelNavItemActive]}
                    activeOpacity={0.8}
                    onPress={() => jumpTo(g.key)}
                  >
                    <Text
                      style={[styles.panelNavText, on && styles.panelNavTextActive]}
                      numberOfLines={1}
                    >
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {/* 右侧选项区：只渲染当前类目，超出高度时仅此区域滚动 */}
          <ScrollView
            ref={contentRef}
            style={styles.panelContent}
            contentContainerStyle={styles.panelContentInner}
            onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {sections.map((leaf) => (
              <View key={leaf.key} style={styles.panelSection}>
                <Text style={styles.panelSectionTitle}>{leaf.label}</Text>
                <View style={styles.blockWrap}>
                  <BlockOption
                    label={t('category.filterAny')}
                    active={!draft[leaf.key]}
                    onPress={() => setDraftValue(leaf.key, '')}
                    width={chipWidth}
                  />
                  {(leaf.options ?? []).map((op) => (
                    <BlockOption
                      key={op.value}
                      label={op.label}
                      active={draft[leaf.key] === op.value}
                      onPress={() => setDraftValue(leaf.key, op.value)}
                      width={chipWidth}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={styles.panelFooter}>
          <TouchableOpacity style={styles.panelReset} activeOpacity={0.8} onPress={resetDraft}>
            <Text style={styles.panelResetText}>{t('category.reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.panelConfirm} activeOpacity={0.85} onPress={confirm}>
            <Text style={styles.panelConfirmText}>{t('category.confirm')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/** 组是否已有已应用筛选：有 children 的组看任一子项。 */
function groupActive(g: FilterGroup, values: FilterValues): boolean {
  if (g.children && g.children.length) return g.children.some((c) => !!values[c.key]);
  return !!values[g.key];
}

export function FilterBar({
  groups,
  values,
  onChange,
  onApply,
  quickTags,
  onReset,
  openKey,
  onOpenGroup,
}: {
  groups: FilterGroup[];
  values: FilterValues;
  /** 快捷标签：一点即生效 */
  onChange: (key: string, value: string) => void;
  /** 面板「确定」：本组叶子一次性合并 */
  onApply?: (patch: FilterValues) => void;
  quickTags?: QuickTag[];
  onReset?: () => void;
  /** 当前展开的分组；面板由页面根容器渲染，以便与内容区同宽 */
  openKey?: string | null;
  onOpenGroup?: (group: FilterGroup, top: number) => void;
}) {
  const { t } = useI18n();
  const rowRef = useRef<any>(null);
  const insets = useSafeAreaInsets();

  const open = useCallback(
    (group: FilterGroup) => {
      rowRef.current?.measureInWindow?.((_x: number, y: number, _w: number, h: number) => {
        onOpenGroup?.(group, Math.max(insets.top + 48, y + h));
      });
    },
    [insets.top, onOpenGroup],
  );

  return (
    // 整条筛选栏（触发行 + 快捷标签行）作为测距实体：
    // 面板要贴的是这条栏的下沿，而不是触发行下沿，否则会盖住快捷标签
    <View ref={rowRef}>
      <View style={styles.filterRow}>
        {groups.map((g) => {
          const active = groupActive(g, values);
          const label = groupTriggerLabel(g, values);
          return (
            <TouchableOpacity
              key={g.key}
              style={styles.filterTrigger}
              activeOpacity={0.8}
              onPress={() => open(g)}
              accessibilityRole="button"
              accessibilityState={{ expanded: openKey === g.key }}
              accessibilityLabel={label}
            >
              <Text style={[styles.filterTriggerText, active && styles.filterTriggerTextActive]} numberOfLines={1}>
                {label}
              </Text>
              <Ionicons
                name="chevron-down"
                size={12}
                color={active ? colors.primary : colors.ink3}
                style={openKey === g.key ? styles.filterCaretOpen : undefined}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {quickTags && quickTags.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {quickTags.map((tag) => {
            const anyFilter = groups.some((g) => g.key !== 'sort' && groupActive(g, values));
            const active = tag.reset
              ? !anyFilter
              : !!tag.group && !!tag.value && values[tag.group] === tag.value;
            return (
              <TouchableOpacity
                key={tag.key}
                style={[styles.quickTag, active && styles.quickTagActive]}
                activeOpacity={0.8}
                hitSlop={{ top: 7, bottom: 7, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tag.label}
                onPress={() => {
                  if (tag.reset) {
                    onReset?.();
                    return;
                  }
                  if (!tag.group) return;
                  onChange(tag.group, values[tag.group] === tag.value ? '' : tag.value ?? '');
                }}
              >
                <Text style={[styles.quickTagText, active && styles.quickTagTextActive]} numberOfLines={1}>
                  {tag.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function optionLabel(g: FilterGroup, value: string): string {
  if (g.children && g.children.length) {
    for (const child of g.children) {
      const hit = child.options?.find((o) => o.value === value);
      if (hit) return hit.label;
    }
    return g.label;
  }
  return g.options?.find((o) => o.value === value)?.label ?? g.label;
}

/** 触发块文案：已选则显示所选值文案；「更多」中含已选子项时显示该子项文案。 */
function groupTriggerLabel(g: FilterGroup, values: FilterValues): string {
  if (g.children && g.children.length) {
    for (const child of g.children) {
      if (values[child.key]) return optionLabel(child, values[child.key] ?? '');
    }
    return g.label;
  }
  return values[g.key] ? optionLabel(g, values[g.key] ?? '') : g.label;
}

// ==================== 列表页外壳 ====================

export interface CategoryQueryState {
  values: FilterValues;
  keyword: string;
  tab?: string;
  sort: string;
}

interface CategoryListScreenProps<T> {
  title: string;
  city?: string;
  onCityPress?: () => void;
  searchPlaceholder: string;
  rightActions?: React.ReactNode;
  /** 宫格 / 胶囊 / 榜单 / 行情卡 / 服务条 / 横幅等中段模块 */
  top?: React.ReactNode;
  tabs?: { key: string; label: string }[];
  tabValue?: string;
  onTabChange?: (key: string) => void;
  /** 当 Tab 本身就是某个筛选组（如新房的「榜单」= 排序）时，指明该组 key：
   * Tab 选中值与筛选组值双向共用，避免同一语义出现两个独立状态。 */
  tabGroup?: string;
  filterGroups: FilterGroup[];
  quickTags?: QuickTag[];
  defaultFilterValues?: FilterValues;
  /** 页面把筛选状态映射成接口参数（纯函数，务必 useCallback([]) 稳定引用） */
  buildQuery: (state: CategoryQueryState) => any;
  /** 稳定的分页请求函数，接收 buildQuery 的结果 */
  fetchPage: (page: number, query: any) => Promise<{ items: T[]; total: number }>;
  renderCard: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string;
  emptyTitle: string;
  emptySub?: string;
  emptyIcon?: IoniconName;
}

const PAGE_SIZE = LIST_PAGE_SIZE;
const DEFAULT_VALUES: FilterValues = { sort: 'latest' };

export function CategoryListScreen<T>({
  title,
  city,
  onCityPress,
  searchPlaceholder,
  rightActions,
  top,
  tabs,
  tabValue,
  onTabChange,
  tabGroup,
  filterGroups,
  quickTags,
  defaultFilterValues,
  buildQuery,
  fetchPage,
  renderCard,
  keyExtractor,
  emptyTitle,
  emptySub,
}: CategoryListScreenProps<T>) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [values, setValues] = useState<FilterValues>({ ...DEFAULT_VALUES, ...defaultFilterValues });
  // 面板开关统一走共享 toggle：再次点击当前已展开的筛选项 = 收起
  const { openKey, toggle: toggleGroup, close: closeGroup } = usePanelToggle<string>();
  const [openTop, setOpenTop] = useState(0);
  const openGroup = openKey ? filterGroups.find((g) => g.key === openKey) ?? null : null;
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const reqSeq = useRef(0);
  // 吸顶：顶栏高度、筛选条在列表内容里的 y 偏移、以及当前是否已吸顶
  const [topBarH, setTopBarH] = useState(0);
  const [filterOffset, setFilterOffset] = useState(0);
  const [stuck, setStuck] = useState(false);
  // 筛选默认值（含排序）：不同分类的数据面接受不同的 sort 枚举，
  // 必须由页面显式下发，不能一律用 latest（/public/projects 会 422）。
  // 默认值按内容序列化做依赖：调用方若传内联对象（如新房 `{ sort: 'hot' }`），
  // 引用每次渲染都变，会让下面 query → load 的 memo 级联失效，进而 effect 无限重拉。
  const defaultValuesKey = JSON.stringify(defaultFilterValues ?? {});
  const baseValues = useMemo(
    () => ({ ...DEFAULT_VALUES, ...defaultFilterValues }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultValuesKey],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 350);
    return () => clearTimeout(timer);
  }, [keyword]);

  const query = useMemo(
    () => buildQuery({ values, keyword: debounced, tab: tabValue, sort: values.sort ?? baseValues.sort ?? 'latest' }),
    [buildQuery, values, debounced, tabValue, baseValues],
  );

  const load = useCallback(
    async (targetPage: number) => {
      const seq = ++reqSeq.current;
      if (targetPage === 1) {
        setLoading(true);
        setLoadError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await fetchPage(targetPage, query);
        if (seq !== reqSeq.current) return;
        setTotal(res.total);
        setPage(targetPage);
        setItems((prev) => (targetPage === 1 ? res.items : [...prev, ...res.items]));
      } catch (err) {
        if (seq !== reqSeq.current) return;
        if (targetPage === 1) setLoadError(t('loadFailed'));
        else notifyError(t('loadFailed'), err);
      } finally {
        if (seq === reqSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [fetchPage, query],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const hasMore = items.length < total;
  const filtered =
    !!debounced || Object.entries(values).some(([k, v]) => !!v && v !== baseValues[k]);

  const openHandler = (g: FilterGroup, top: number) => {
    if (openKey === g.key) {
      closeGroup();
      return;
    }
    setOpenTop(top);
    toggleGroup(g.key);
  };

  // 同一份筛选条既在列表头部（自然位置），也在吸顶时挂到顶栏下沿。
  // 只渲染其中一份可交互：吸顶后头部那份透明且不接收事件，占位高度不变，滚动不跳。
  const filterBar = (
    <FilterBar
      groups={filterGroups}
      values={values}
      onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
      onApply={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
      quickTags={quickTags}
      onReset={() => setValues(baseValues)}
      openKey={openKey}
      onOpenGroup={openHandler}
    />
  );

  return (
    <View style={styles.container}>
      <View onLayout={(e) => setTopBarH(e.nativeEvent.layout.height)}>
        <CategoryTopBar
          title={title}
          city={city}
          onCityPress={onCityPress}
          searchPlaceholder={searchPlaceholder}
          keyword={keyword}
          onKeywordChange={setKeyword}
          rightActions={rightActions}
        />
      </View>

      {loadError ? (
        <ListState
          error={loadError}
          retryLabel={t('retry')}
          onRetry={() => {
            setLoadError(null);
            void load(1);
          }}
        />
      ) : (
        <FlatList
          data={loading ? [] : items}
          keyExtractor={keyExtractor}
          // 面板展开期间锁定列表滚动，保证面板始终贴住筛选条下沿、不出现位移间隙
          scrollEnabled={!openGroup}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View>
              {top}
              {tabs && tabs.length > 0 ? (
                <PlainTabs
                  items={tabs}
                  value={tabGroup ? values[tabGroup] : tabValue}
                  onChange={tabGroup ? (k) => setValues((prev) => ({ ...prev, [tabGroup]: k })) : onTabChange}
                />
              ) : null}
              <View
                onLayout={(e) => setFilterOffset(e.nativeEvent.layout.y)}
                style={stuck ? styles.filterGhost : undefined}
                pointerEvents={stuck ? 'none' : 'auto'}
                accessibilityElementsHidden={stuck}
                importantForAccessibility={stuck ? 'no-hide-descendants' : 'auto'}
              >
                {filterBar}
              </View>
              {!loading ? (
                <Text style={styles.count}>{t('category.resultCount', { n: total })}</Text>
              ) : null}
              {!loading && items.length === 0 ? (
                <ListState empty filtered={filtered} emptyTitle={emptyTitle} emptySub={emptySub} />
              ) : null}
            </View>
          }
          renderItem={({ item }) => <>{renderCard(item)}</>}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            const next = filterOffset > 0 && y >= filterOffset - 1;
            setStuck((prev) => (prev === next ? prev : next));
          }}
          scrollEventThrottle={16}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (loading || loadingMore || !hasMore) return;
            void load(page + 1);
          }}
          refreshControl={
            openGroup ? undefined : (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await load(1);
                  setRefreshing(false);
                }}
                tintColor={colors.primary}
              />
            )
          }
          ListEmptyComponent={loading ? <LoadingState label={t('category.loading')} /> : null}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.primary} />
            ) : items.length > 0 && !hasMore ? (
              <Text style={styles.footer}>{t('pub.noMore')}</Text>
            ) : null
          }
        />
      )}
      {/* 吸顶筛选条：滚动过筛选条原始位置后，钉在顶栏下沿；面板随后从这里下沿无缝展开 */}
      {stuck ? (
        <View style={[styles.stickyFilter, { top: topBarH }]}>{filterBar}</View>
      ) : null}
      {openGroup ? (
        <FilterPanel
          key={openGroup.key}
          groups={filterGroups}
          activeKey={openGroup.key}
          values={values}
          topOffset={openTop}
          onApply={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
          onClose={closeGroup}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // 顶栏：磨砂玻璃，内容半透明白，下面盖一层 hairline 分隔
  topBarWrap: { zIndex: 10 },
  topBarBlur: {
    backgroundColor: FROSTED_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  topBarRow: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  circleBtn: {
    width: 34,
    height: 34,
    borderRadius: colors.radius.full,
    backgroundColor: colors.alpha(colors.inkRgb, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { flex: 1, fontSize: colors.fontSize.lg, fontWeight: colors.fontWeight.bold, color: colors.ink },
  topRight: { flexDirection: 'row', gap: 8, minWidth: 34, justifyContent: 'flex-end' },
  topBarRow2: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: colors.radius.full,
    backgroundColor: colors.fieldFill,
  },
  cityText: { maxWidth: 84, fontSize: colors.fontSize.sm, color: colors.ink2, fontWeight: colors.fontWeight.medium },
  topSearch: {
    flex: 1,
    minHeight: colors.touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.fieldFill,
    paddingHorizontal: 12,
  },
  topSearchInput: { flex: 1, fontSize: colors.fontSize.base, color: colors.ink, padding: 0 },

  // 宫格
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 12 },
  gridItem: { width: '20%', alignItems: 'center', marginBottom: 14 },
  gridIcon: {
    width: 46,
    height: 46,
    borderRadius: colors.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: { fontSize: colors.fontSize.xs, color: colors.ink2, marginTop: 6 },

  // 胶囊
  capsuleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    paddingVertical: 12,
    ...colors.shadow.card,
  },
  capsule: { flex: 1, alignItems: 'center' },
  capsuleValue: { fontSize: colors.fontSize.lg, fontWeight: colors.fontWeight.bold, color: colors.ink },
  capsuleLabel: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 3 },

  // 纯文字 Tab
  plainTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.xl,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: colors.spacing.sm,
  },
  plainTab: { minHeight: colors.touch.min, justifyContent: 'center', paddingVertical: colors.spacing.xs },
  plainTabText: { fontSize: colors.fontSize.base, color: colors.ink3, fontWeight: colors.fontWeight.medium },
  plainTabTextActive: { color: colors.ink, fontWeight: colors.fontWeight.bold },

  // 行情对比卡
  compareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.md,
    gap: 10,
    ...colors.shadow.card,
  },
  compareSide: { flex: 1 },
  compareDist: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  comparePrice: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.ink, marginTop: 2 },
  compareVs: { fontSize: colors.fontSize.sm, fontWeight: '700', color: colors.primary },
  compareLink: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '600' },

  // 服务条
  serviceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: colors.radius.lg,
    paddingHorizontal: colors.spacing.md,
    paddingVertical: 10,
  },
  serviceText: { flex: 1, fontSize: colors.fontSize.base, color: colors.ink, fontWeight: '600' },
  serviceBtn: {
    backgroundColor: colors.primary,
    borderRadius: colors.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  serviceBtnText: { fontSize: colors.fontSize.sm, color: colors.primaryForeground, fontWeight: '700' },

  // 横幅
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.md,
    ...colors.shadow.card,
  },
  bannerTitle: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.ink },
  bannerSub: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 3 },
  bannerBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: colors.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  bannerBtnText: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '700' },

  // 筛选行：贝壳式纯文字 + 小三角，各项均分，底部 hairline 分隔
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    // 与展开面板同底色：面板下沿无缝衔接，不出现一条浅灰缝
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterTrigger: {
    flex: 1,
    minHeight: colors.touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 10,
  },
  filterTriggerText: { flexShrink: 1, fontSize: colors.fontSize.base, color: colors.ink2, maxWidth: 120 },
  filterTriggerTextActive: { color: colors.primary, fontWeight: colors.fontWeight.semibold },

  // 快捷标签（方块样式，与筛选选项一致，不用胶囊）
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  quickTag: {
    height: 30,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.fieldFill,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTagActive: { backgroundColor: colors.sidebarActive },
  quickTagText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  quickTagTextActive: { color: colors.primary, fontWeight: colors.fontWeight.semibold },

  count: { fontSize: colors.fontSize.sm, color: colors.ink3, paddingHorizontal: 16, marginTop: 4, marginBottom: 8 },
  footer: { fontSize: colors.fontSize.sm, color: colors.ink3, textAlign: 'center', paddingVertical: 16 },

  // 吸顶态：头部那份筛选条只留占位（不可见、不可点），吸顶那份挂在顶栏下沿
  filterGhost: { opacity: 0 },
  stickyFilter: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
    backgroundColor: colors.surface,
  },

  // 筛选面板（贝壳式：紧贴筛选条下沿的整幅下拉；下方列表被遮罩压暗，面板不透明）
  panelOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
    backgroundColor: colors.alpha(colors.inkRgb, 0.35),
  },
  panel: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  panelOutside: { flex: 1 },
  panelBody: { flexDirection: 'row', flexShrink: 1 },
  // 左栏分组导航：宽度按最长分组名自适应（见 FilterPanel navWidth），浅灰底 + 右侧细分隔线
  panelNav: {
    flexShrink: 0,
    backgroundColor: colors.fieldFill,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  panelNavInner: { paddingVertical: colors.spacing.xs },
  panelNavItem: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  panelNavItemActive: {
    backgroundColor: colors.surface,
  },
  panelNavText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  panelNavTextActive: { color: colors.primary, fontWeight: '700' },
  // 右栏选项区：所有分组连续排列，各自带分组标题
  panelContent: { flex: 1, flexShrink: 1 },
  panelContentInner: { padding: colors.spacing.lg },
  panelSection: { marginBottom: colors.spacing.lg },
  panelSectionTitle: {
    fontSize: colors.fontSize.base,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 12,
  },
  blockWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: colors.spacing.sm },
  block: {
    // 兜底按 3 列估算，实际宽度由 FilterPanel 量出右栏宽度后按行内 width 覆盖
    width: '30%',
    height: 44,
    borderRadius: 4,
    backgroundColor: colors.fieldFill,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockActive: {
    backgroundColor: colors.sidebarActive,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  blockText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  blockTextActive: { color: colors.primary, fontWeight: '700' },
  // 底部固定「重置 / 确定」
  panelFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.md,
    paddingHorizontal: colors.spacing.md,
    paddingVertical: colors.spacing.md,
    backgroundColor: colors.surface,
  },
  panelReset: {
    flex: 1,
    height: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelResetText: { fontSize: colors.fontSize.base, fontWeight: '600', color: colors.ink2 },
  panelConfirm: {
    flex: 1,
    height: 44,
    borderRadius: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelConfirmText: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.primaryForeground },
  filterCaretOpen: { transform: [{ rotate: '180deg' }] },
});

export default CategoryListScreen;
