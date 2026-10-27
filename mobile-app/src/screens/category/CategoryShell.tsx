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
  useWindowDimensions,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';

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
            />
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
      <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
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
      <TouchableOpacity style={styles.bannerBtn} activeOpacity={0.8} onPress={onPress}>
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
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.block, active && styles.blockActive]} activeOpacity={0.8} onPress={onPress}>
      <Text style={[styles.blockText, active && styles.blockTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** 筛选面板（贝壳式）：从筛选条下沿整幅展开、铺到屏幕底部；
 *  多组时左栏分组导航 + 右栏选项块，底部「重置 / 确定」常驻。
 *  面板内只改本地 draft，点「确定」才把本组叶子一次性合并回已应用值。 */
function FilterPanel({
  group,
  values,
  onApply,
  onClose,
  topOffset,
}: {
  group: FilterGroup;
  values: FilterValues;
  onApply: (patch: FilterValues) => void;
  onClose: () => void;
  topOffset: number;
}) {
  const { t } = useI18n();
  const { height: winH } = useWindowDimensions();
  const leaves = useMemo(
    () => (group.children && group.children.length ? group.children : [group]),
    [group],
  );
  const keys = useMemo(() => leaves.map((g) => g.key), [leaves]);
  const [draft, setDraft] = useState<FilterValues>(() => {
    const init: FilterValues = {};
    leaves.forEach((g) => {
      init[g.key] = values[g.key] ?? '';
    });
    return init;
  });
  const [subKey, setSubKey] = useState(leaves[0]?.key ?? '');
  const contentRef = useRef<ScrollView>(null);
  /** 各组在右栏内容中的 y 偏移（onLayout 记录），供左栏点击跳转 / 滚动联动使用 */
  const offsetsRef = useRef<Record<string, number>>({});

  /** 左栏点击：先把目标组设为高亮，再滚动到该组（只在点击时 scrollTo，滚动回调里不调用）。 */
  const jumpTo = (key: string) => {
    setSubKey(key);
    const y = offsetsRef.current[key];
    if (y != null) contentRef.current?.scrollTo({ y, animated: true });
  };

  /** 右栏滚动：取「最接近视口顶部」的分组联动左栏高亮；滚到底时高亮最后一组。 */
  const handleContentScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const maxY = Math.max(0, contentSize.height - layoutMeasurement.height);
    let current = leaves[0]?.key ?? '';
    if (maxY > 4 && contentOffset.y >= maxY - 2) {
      current = leaves[leaves.length - 1]?.key ?? current;
    } else {
      let best = -Infinity;
      for (const g of leaves) {
        const oy = offsetsRef.current[g.key];
        if (oy == null) continue;
        if (oy <= contentOffset.y + 12 && oy > best) {
          best = oy;
          current = g.key;
        }
      }
    }
    setSubKey((prev) => (prev === current ? prev : current));
  };

  const setDraftValue = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const resetDraft = () => {
    const cleared: FilterValues = {};
    keys.forEach((k) => {
      cleared[k] = '';
    });
    setDraft(cleared);
  };

  const confirm = () => {
    onApply(draft);
    onClose();
  };

  // 贝壳式下拉：从筛选条下沿展开的有限高度面板（约屏幕 58%），
  // 下面仍露出房源列表；点面板外任意处关闭并放弃草稿。
  const panelTop = Math.max(0, topOffset);
  const panelHeight = Math.min(
    Math.round(winH * 0.58),
    Math.max(260, winH - panelTop - 8),
  );

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.panelLayer}>
        <TouchableOpacity style={{ height: panelTop }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.panel, { height: panelHeight }]}>
          <View style={styles.panelBody}>
            {leaves.length > 1 ? (
              <ScrollView
                style={styles.panelNav}
                contentContainerStyle={styles.panelNavInner}
                showsVerticalScrollIndicator={false}
              >
                {leaves.map((g) => {
                  const active = g.key === subKey;
                  return (
                    <TouchableOpacity
                      key={g.key}
                      style={[styles.panelNavItem, active && styles.panelNavItemActive]}
                      activeOpacity={0.8}
                      onPress={() => jumpTo(g.key)}
                    >
                      <Text
                        style={[styles.panelNavText, active && styles.panelNavTextActive]}
                        numberOfLines={1}
                      >
                        {g.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}
            <ScrollView
              ref={contentRef}
              style={styles.panelContent}
              contentContainerStyle={styles.panelContentInner}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={handleContentScroll}
            >
              {leaves.map((leaf) => (
                <View
                  key={leaf.key}
                  style={styles.panelSection}
                  onLayout={(e) => {
                    offsetsRef.current[leaf.key] = e.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.panelSectionTitle}>{leaf.label}</Text>
                  <View style={styles.blockWrap}>
                    <BlockOption
                      label={t('category.filterAny')}
                      active={!draft[leaf.key]}
                      onPress={() => setDraftValue(leaf.key, '')}
                    />
                    {(leaf.options ?? []).map((op) => (
                      <BlockOption
                        key={op.value}
                        label={op.label}
                        active={draft[leaf.key] === op.value}
                        onPress={() => setDraftValue(leaf.key, op.value)}
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
        <TouchableOpacity style={styles.panelOutside} activeOpacity={1} onPress={onClose} />
      </View>
    </Modal>
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
}: {
  groups: FilterGroup[];
  values: FilterValues;
  /** 快捷标签：一点即生效 */
  onChange: (key: string, value: string) => void;
  /** 面板「确定」：本组叶子一次性合并 */
  onApply?: (patch: FilterValues) => void;
  quickTags?: QuickTag[];
  onReset?: () => void;
}) {
  const { t } = useI18n();
  const rowRef = useRef<any>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [topOffset, setTopOffset] = useState(120);
  const insets = useSafeAreaInsets();

  const open = useCallback(
    (key: string) => {
      rowRef.current?.measureInWindow?.((_x: number, y: number, _w: number, h: number) => {
        setTopOffset(Math.max(insets.top + 48, y + h));
      });
      setOpenKey(key);
    },
    [insets.top],
  );

  const openGroup = groups.find((g) => g.key === openKey);

  return (
    <>
      <View style={styles.filterRow} ref={rowRef}>
        {groups.map((g) => {
          const active = groupActive(g, values);
          const label = groupTriggerLabel(g, values);
          return (
            <TouchableOpacity
              key={g.key}
              style={styles.filterTrigger}
              activeOpacity={0.8}
              onPress={() => open(g.key)}
            >
              <Text style={[styles.filterTriggerText, active && styles.filterTriggerTextActive]} numberOfLines={1}>
                {label}
              </Text>
              <Ionicons
                name="chevron-down"
                size={12}
                color={active ? colors.primary : colors.ink3}
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

      {openGroup ? (
        <FilterPanel
          key={openGroup.key}
          group={openGroup}
          values={values}
          onApply={(patch) => onApply?.(patch)}
          onClose={() => setOpenKey(null)}
          topOffset={topOffset}
        />
      ) : null}
    </>
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

const PAGE_SIZE = 20;
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
  emptyIcon = 'home-outline',
}: CategoryListScreenProps<T>) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [values, setValues] = useState<FilterValues>({ ...DEFAULT_VALUES, ...defaultFilterValues });
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const reqSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 350);
    return () => clearTimeout(timer);
  }, [keyword]);

  const query = useMemo(
    () => buildQuery({ values, keyword: debounced, tab: tabValue, sort: values.sort ?? 'latest' }),
    [buildQuery, values, debounced, tabValue],
  );

  const load = useCallback(
    async (targetPage: number) => {
      const seq = ++reqSeq.current;
      if (targetPage === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetchPage(targetPage, query);
        if (seq !== reqSeq.current) return;
        setTotal(res.total);
        setPage(targetPage);
        setItems((prev) => (targetPage === 1 ? res.items : [...prev, ...res.items]));
      } catch {
        if (seq !== reqSeq.current) return;
        if (targetPage === 1) {
          setItems([]);
          setTotal(0);
        }
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

  return (
    <View style={styles.container}>
      <CategoryTopBar
        title={title}
        city={city}
        onCityPress={onCityPress}
        searchPlaceholder={searchPlaceholder}
        keyword={keyword}
        onKeywordChange={setKeyword}
        rightActions={rightActions}
      />

      {loading ? (
        <LoadingState label={t('category.loading')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
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
              <FilterBar
                groups={filterGroups}
                values={values}
                onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
                onApply={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
                quickTags={quickTags}
                onReset={() => setValues((prev) => ({ sort: prev.sort ?? 'latest' }))}
              />
              <Text style={styles.count}>{t('category.resultCount', { n: total })}</Text>
              {items.length === 0 ? (
                <EmptyState icon={emptyIcon} title={emptyTitle} sub={emptySub} />
              ) : null}
            </View>
          }
          renderItem={({ item }) => <>{renderCard(item)}</>}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (loading || loadingMore || !hasMore) return;
            void load(page + 1);
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load(1);
                setRefreshing(false);
              }}
              tintColor={colors.primary}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.primary} />
            ) : null
          }
        />
      )}
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
  topTitle: { flex: 1, fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
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
  cityText: { maxWidth: 84, fontSize: colors.fontSize.sm, color: colors.ink2, fontWeight: '500' },
  topSearch: {
    flex: 1,
    height: 34,
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
  capsuleValue: { fontSize: colors.fontSize.lg, fontWeight: '800', color: colors.ink },
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
  plainTab: { paddingVertical: colors.spacing.xs },
  plainTabText: { fontSize: 15, color: colors.ink3, fontWeight: '500' },
  plainTabTextActive: { color: colors.ink, fontWeight: '700' },

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
  bannerBtnText: { fontSize: colors.fontSize.sm, color: colors.accent, fontWeight: '700' },

  // 筛选行：贝壳式纯文字 + 小三角，各项均分，底部 hairline 分隔
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 10,
  },
  filterTriggerText: { flexShrink: 1, fontSize: colors.fontSize.base, color: colors.ink2, maxWidth: 120 },
  filterTriggerTextActive: { color: colors.primary, fontWeight: '600' },

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
  quickTagTextActive: { color: colors.accent, fontWeight: '600' },

  count: { fontSize: colors.fontSize.sm, color: colors.ink3, paddingHorizontal: 16, marginTop: 4, marginBottom: 8 },

  // 筛选面板（贝壳式下拉：筛选条下沿展开的有限高度面板，下方露出列表，点外部关闭）
  panelLayer: { flex: 1 },
  panel: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    overflow: 'hidden',
    ...colors.shadow.lg,
  },
  panelOutside: { flex: 1 },
  panelBody: { flex: 1, flexDirection: 'row' },
  // 左栏分组导航：底色略深于右栏，选中项白底 + 主色文字 + 左侧主色竖条
  panelNav: { width: 90, backgroundColor: colors.fieldFill },
  panelNavInner: { paddingVertical: colors.spacing.sm },
  panelNavItem: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  panelNavItemActive: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  panelNavText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  panelNavTextActive: { color: colors.primary, fontWeight: '700' },
  // 右栏选项区：所有分组连续排列，各自带分组标题
  panelContent: { flex: 1 },
  panelContentInner: { padding: colors.spacing.lg },
  panelSection: { marginBottom: colors.spacing.lg },
  panelSectionTitle: { fontSize: colors.fontSize.sm, color: colors.ink3, marginBottom: 10 },
  blockWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: colors.spacing.md },
  block: {
    minWidth: 80,
    height: 40,
    borderRadius: 4,
    backgroundColor: colors.fieldFill,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockActive: {
    backgroundColor: colors.sidebarActive,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  blockText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  blockTextActive: { color: colors.accent, fontWeight: '700' },
  // 底部固定「重置 / 确定」
  panelFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.md,
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: colors.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
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
});

export default CategoryListScreen;
