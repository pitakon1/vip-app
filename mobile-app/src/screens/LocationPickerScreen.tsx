/**
 * 全局定位选择页（App，全屏页面，对齐贝壳移动端的城市选择器）。
 * 交互按 Material 3 移动设计重构：
 *  - 顶部「国家」横向胶囊筛选（FilterChip）：默认选中当前定位国家，仅展示该国家的城市，
 *    点击切换国家；不再一次性列出所有国家城市，也不放右侧文字索引栏。
 *  - 顶部搜索全局匹配（跨国家搜城市/国家名）；当前定位 + 热门城市 辅助快速选择。
 *  - 选中国家 → 城市写入全局 useLocationStore。
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useLocationStore, LOCATION_GROUPS, type LocationSelection } from '@/stores/location';

interface CityRow {
  country: string;
  cityKey: string;
  cityLabel: string;
  districtCount: number;
}

export default function LocationPickerScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const selection = useLocationStore((s) => s.selection);
  const select = useLocationStore((s) => s.select);

  const [query, setQuery] = useState('');
  // 当前选中的国家 Tab：默认跟随已选城市的国家
  const [activeCountry, setActiveCountry] = useState<string>(
    selection.country || LOCATION_GROUPS[0]?.country || '',
  );

  const countries = useMemo(() => LOCATION_GROUPS.map((g) => g.country), []);
  const activeGroup = useMemo(
    () => LOCATION_GROUPS.find((g) => g.country === activeCountry),
    [activeCountry],
  );
  const activeCities = useMemo<CityRow[]>(
    () =>
      (activeGroup?.cities ?? []).map((c) => ({
        country: activeCountry,
        cityKey: c.cityKey,
        cityLabel: c.cityLabel,
        districtCount: c.children.length,
      })),
    [activeGroup, activeCountry],
  );

  /** 热门城市：每个国家取第一个城市（近似「该国主城」），最多 6 个 */
  const hotCities = useMemo(
    () => LOCATION_GROUPS.map((g) => g.cities[0]).filter(Boolean).slice(0, 6),
    [],
  );

  /** 搜索模式：跨所有国家模糊匹配城市 / 国家 */
  const results = useMemo<CityRow[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return LOCATION_GROUPS.flatMap((g) =>
      g.cities
        .filter(
          (c) => c.cityLabel.toLowerCase().includes(q) || g.country.toLowerCase().includes(q),
        )
        .map((c) => ({
          country: g.country,
          cityKey: c.cityKey,
          cityLabel: c.cityLabel,
          districtCount: c.children.length,
        })),
    );
  }, [query]);

  const handleSelect = useCallback(
    (sel: LocationSelection) => select(sel),
    [select],
  );

  const searchEmpty = query.trim().length > 0 && results.length === 0;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* 顶部搜索栏 */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.ink3} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="请输入城市或国家名称"
            placeholderTextColor={colors.ink3}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close-circle" size={16} color={colors.ink3} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {query.trim() ? (
        // ---- 搜索结果（全局）----
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.resultTitle}>搜索结果</Text>
          {searchEmpty ? (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={28} color={colors.ink3} />
              <Text style={styles.emptyText}>未找到匹配的城市</Text>
            </View>
          ) : (
            results.map((item) => (
              <CityRowView
                key={item.cityKey}
                item={item}
                active={selection.cityKey === item.cityKey}
                onSelect={() => handleSelect(item)}
              />
            ))
          )}
        </ScrollView>
      ) : (
        // ---- 浏览模式 ----
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 当前定位 */}
          <View style={styles.currentBox}>
            <View style={styles.currentIconCircle}>
              <Ionicons name="navigate" size={16} color={colors.primaryForeground} />
            </View>
            <View style={styles.currentMain}>
              <Text style={styles.currentLabel}>当前定位</Text>
              <Text style={styles.currentCity}>
                {selection.country} · {selection.cityLabel}
              </Text>
            </View>
            <View style={styles.rangeTag}>
              <Text style={styles.rangeTagText}>{selection.country}全城</Text>
            </View>
          </View>

          {/* 热门城市 */}
          <View style={styles.hotWrap}>
            <Text style={styles.groupTitle}>热门城市</Text>
            <View style={styles.hotGrid}>
              {hotCities.map((c) => {
                const active = selection.cityKey === c.cityKey;
                return (
                  <TouchableOpacity
                    key={c.cityKey}
                    style={[styles.hotChip, active && styles.hotChipActive]}
                    onPress={() => handleSelect({ country: c.country, cityKey: c.cityKey, cityLabel: c.cityLabel })}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.hotChipText, active && styles.hotChipTextActive]}>
                      {c.cityLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 国家胶囊 Tab：自动换行不滑屏，只展示当前国家的城市，点击切换 */}
          <View style={styles.countryTabsWrap}>
            <Text style={styles.groupTitle}>选择国家</Text>
            <View style={styles.countryTabs}>
              {countries.map((c) => {
                const active = c === activeCountry;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.countryChip, active && styles.countryChipActive]}
                    onPress={() => setActiveCountry(c)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.countryChipText, active && styles.countryChipTextActive]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 当前国家城市列表 */}
          <View style={styles.cityList}>
            <Text style={styles.resultTitle}>
              {activeCountry} · 城市
              <Text style={styles.cityCount}>（{activeCities.length}）</Text>
            </Text>
            {activeCities.length ? (
              activeCities.map((item) => (
                <CityRowView
                  key={item.cityKey}
                  item={item}
                  active={selection.cityKey === item.cityKey}
                  onSelect={() => handleSelect(item)}
                />
              ))
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>该国家暂无可选城市</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function CityRowView({
  item,
  active,
  onSelect,
}: {
  item: CityRow;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.cityRow, active && styles.cityRowActive]} onPress={onSelect} activeOpacity={0.6}>
      <View style={styles.cityMain}>
        <Text style={[styles.cityName, active && styles.cityNameActive]}>{item.cityLabel}</Text>
        <Text style={styles.citySub}>{item.districtCount} 个区</Text>
      </View>
      {active && (
        <View style={styles.checkBadge}>
          <Ionicons name="checkmark" size={12} color={colors.primaryForeground} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  listContent: { paddingBottom: 24 },

  // 搜索
  searchWrap: { paddingHorizontal: colors.spacing.lg, paddingVertical: colors.spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fieldFill,
    borderWidth: 1,
    borderColor: colors.fieldFillBorder,
    borderRadius: colors.radius.xl,
    height: 40,
    paddingHorizontal: colors.spacing.md,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 0 },

  // 当前定位
  currentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    marginHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.sm,
    padding: colors.spacing.md,
  },
  currentIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: colors.spacing.md,
  },
  currentMain: { flex: 1 },
  currentLabel: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  currentCity: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 2 },
  rangeTag: {
    backgroundColor: colors.sidebarActive,
    borderRadius: colors.radius.full,
    paddingHorizontal: colors.spacing.md,
    paddingVertical: 6,
  },
  rangeTagText: { fontSize: colors.fontSize.sm, color: colors.primary, fontWeight: '600' },

  // 热门城市
  hotWrap: { marginHorizontal: colors.spacing.lg, marginTop: colors.spacing.lg },
  groupTitle: { fontSize: colors.fontSize.sm, color: colors.ink3, marginBottom: 10 },
  hotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hotChip: {
    backgroundColor: colors.fieldFill,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.fieldFillBorder,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  hotChipActive: {
    backgroundColor: colors.sidebarActive,
    borderColor: colors.sidebarActive,
  },
  hotChipText: { fontSize: 14, color: colors.ink2 },
  hotChipTextActive: { color: colors.primary, fontWeight: '700' },

  // 国家 Tab
  countryTabsWrap: { marginHorizontal: colors.spacing.lg, marginTop: colors.spacing.lg },
  countryTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  countryChip: {
    borderRadius: colors.radius.full,
    backgroundColor: colors.fieldFill,
    borderWidth: 1,
    borderColor: colors.fieldFillBorder,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  countryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  countryChipText: { fontSize: 14, color: colors.ink2 },
  countryChipTextActive: { color: colors.primaryForeground, fontWeight: '700' },

  // 城市列表
  cityList: { marginTop: colors.spacing.lg },
  resultTitle: {
    fontSize: colors.fontSize.sm,
    color: colors.ink3,
    paddingHorizontal: colors.spacing.lg,
    marginBottom: 4,
  },
  cityCount: { fontSize: colors.fontSize.xs },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: colors.spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  cityRowActive: {},
  cityMain: { flex: 1 },
  cityName: { fontSize: 15, color: colors.ink },
  cityNameActive: { color: colors.primary, fontWeight: '700' },
  citySub: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 2 },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 14, color: colors.ink3, marginTop: 8 },
});