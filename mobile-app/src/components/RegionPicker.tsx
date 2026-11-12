/**
 * 列表级区域筛选（App）。
 *
 * 三级级联：国家 → 城市 → 区。只影响当前列表的查询参数 region / city / district，
 * 不是账号级定位器。每次只显示当前层级的选项，选完上级才显示下级；每级均含「全部」。
 * 数据源：复用三端共享的静态 AREA_GROUPS（国家 → 城市 → 城区），作为后端区域数据的
 * 只读本地镜像，组件挂载即加载并常驻缓存。
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { AREA_GROUPS, type CityGroup } from '@/data/locationArea';
import { cityDisplayName, countryDisplayName } from '@/data/locationNames';
import { useI18n } from '@/i18n';

export interface RegionSelection {
  /** 国家 */
  region?: string;
  /** 城市（cityLabel） */
  city?: string;
  /** 区 */
  district?: string;
}

interface Props {
  value: RegionSelection | null;
  onChange: (sel: RegionSelection | null) => void;
}

const countriesOf = (): string[] => {
  const seen: string[] = [];
  AREA_GROUPS.forEach((g) => {
    if (!seen.includes(g.country)) seen.push(g.country);
  });
  return seen;
};

const findCity = (region?: string, city?: string): CityGroup | undefined =>
  region && city
    ? AREA_GROUPS.find((g) => g.country === region && g.cityLabel === city)
    : undefined;

export default function RegionPicker({ value, onChange }: Props) {
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();

  const [visible, setVisible] = useState(false);
  const [country, setCountry] = useState<string | undefined>(value?.region);
  const [cityLabel, setCityLabel] = useState<string | undefined>(value?.city);

  useEffect(() => {
    if (visible) {
      setCountry(value?.region);
      setCityLabel(value?.city);
    }
  }, [visible, value]);

  const countries = useMemo(countriesOf, []);
  // 国家列按最长国家名定宽（中文 2–4 字；英/泰名更长，按当前语言取）。
  // 三列各 flex:1 会让很窄的国家名占掉 1/3 宽度，城市/城区被挤压、右侧留大片空白。
  const countryColWidth = useMemo(() => {
    const maxLen = countries.reduce(
      (m, c) => Math.max(m, countryDisplayName(c, lang).length),
      0,
    );
    return Math.min(132, Math.max(76, maxLen * 16 + 16));
  }, [countries, lang]);
  const cities = useMemo(
    () => (country ? AREA_GROUPS.filter((g) => g.country === country) : []),
    [country],
  );
  const city = findCity(country, cityLabel);
  const districts = city?.children ?? [];

  const pickCountry = (c: string | undefined) => {
    if (!c) {
      onChange(null);
      setVisible(false);
      return;
    }
    setCountry(c);
    setCityLabel(undefined);
    onChange({ region: c });
  };

  const pickCity = (label: string | undefined) => {
    if (!label) {
      onChange({ region: country });
      setVisible(false);
      return;
    }
    setCityLabel(label);
    onChange({ region: country, city: label });
  };

  const pickDistrict = (label: string | undefined) => {
    if (!label) {
      onChange({ region: country, city: cityLabel });
      setVisible(false);
      return;
    }
    onChange({ region: country, city: cityLabel, district: label });
    setVisible(false);
  };

  const summary = value
    ? [
        countryDisplayName(value.region ?? '', lang),
        cityDisplayName(findCity(value.region, value.city)?.cityKey, value.city ?? '', lang),
        value.district,
      ]
        .filter(Boolean)
        .join(' · ')
    : t('regionFilter.allRegions');

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setVisible(true)}
        style={[styles.trigger, value && styles.triggerActive]}
        hitSlop={colors.touch.hitSlop}
        accessibilityRole="button"
        accessibilityState={{ expanded: visible }}
        accessibilityLabel={summary}
      >
        <Ionicons name="location-outline" size={13} color={value ? colors.primary : colors.ink2} />
        <Text style={[styles.triggerText, value && styles.triggerTextActive]} numberOfLines={1}>
          {summary}
        </Text>
        <Ionicons name="chevron-down" size={12} color={value ? colors.primary : colors.ink3} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.mask}>
          {/* 点击面板外的空白区域 = 收起（与筛选下拉面板一致） */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.head}>
              <Text style={styles.title}>{t('regionFilter.title')}</Text>
              <View style={styles.headRight}>
                <TouchableOpacity onPress={() => pickCountry(undefined)} hitSlop={8} style={styles.resetBtn}>
                  <Text style={styles.resetText}>{t('regionFilter.allRegions')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setVisible(false)} hitSlop={12}>
                  <Ionicons name="close" size={20} color={colors.ink3} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.columns}>
              <Column
                title={t('regionFilter.country')}
                options={countries.map((c) => ({ value: c, label: countryDisplayName(c, lang) }))}
                active={(o) => o === country}
                allActive={!country}
                disabled={false}
                onPick={pickCountry}
                width={countryColWidth}
              />
              <Column
                title={t('regionFilter.city')}
                options={cities.map((g) => ({
                  value: g.cityLabel,
                  label: cityDisplayName(g.cityKey, g.cityLabel, lang),
                }))}
                active={(o) => o === cityLabel}
                allActive={!cityLabel}
                disabled={!country}
                onPick={pickCity}
              />
              <Column
                title={t('regionFilter.district')}
                options={districts.map((d) => ({ value: d.label, label: d.label }))}
                active={(o) => o === value?.district}
                allActive={!value?.district}
                disabled={!city}
                onPick={pickDistrict}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Column({
  title,
  options,
  active,
  allActive,
  disabled,
  onPick,
  width,
}: {
  title: string;
  /** 选项：value 为下发给后端的原值（中文），label 为当前语言展示名 */
  options: { value: string; label: string }[];
  active: (o: string) => boolean;
  /** 「全部」是否处于选中态（各列选中值均为空时） */
  allActive: boolean;
  disabled: boolean;
  onPick: (o: string | undefined) => void;
  /** 固定列宽（国家列按最长国家名）；不传则等分剩余空间 */
  width?: number;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.col, width ? { flex: 0, width } : null]}>
      <Text style={styles.colTitle}>{title}</Text>
      {disabled || options.length === 0 ? (
        <View style={styles.colEmpty}>
          <Text style={styles.colEmptyText}>—</Text>
        </View>
      ) : (
        <ScrollView style={styles.colScroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onPick(undefined)}
            style={[styles.opt, styles.optAll, allActive && styles.optActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: allActive }}
            accessibilityLabel={t('common.all')}
          >
            <Text style={[styles.optText, allActive && styles.optTextActive]}>{t('common.all')}</Text>
          </TouchableOpacity>
          {options.map((o) => (
            <TouchableOpacity
              key={o.value}
              activeOpacity={0.7}
              onPress={() => onPick(o.value)}
              style={[styles.opt, active(o.value) && styles.optActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active(o.value) }}
              accessibilityLabel={o.label}
            >
              <Text style={[styles.optText, active(o.value) && styles.optTextActive]} numberOfLines={1}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 220,
  },
  triggerActive: { borderColor: colors.primary, backgroundColor: colors.sidebarActive },
  triggerText: { fontSize: colors.fontSize.caption, color: colors.ink2, fontWeight: '500', flexShrink: 1 },
  triggerTextActive: { color: colors.primary, fontWeight: '600' },

  mask: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    maxHeight: '82%',
    paddingHorizontal: 16,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resetBtn: {},
  resetText: { fontSize: colors.fontSize.caption, color: colors.primary, fontWeight: '600' },

  columns: { flexDirection: 'row', flex: 1 },
  col: { flex: 1, paddingTop: 12, minWidth: 0 },
  colTitle: {
    fontSize: 12,
    color: colors.ink3,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  colScroll: { maxHeight: 320 },
  colEmpty: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colEmptyText: { fontSize: 12, color: colors.ink3 },
  opt: {
    minHeight: colors.touch.min,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: colors.radius.md,
    marginBottom: 4,
  },
  optAll: { borderWidth: 1, borderColor: colors.border },
  optActive: { backgroundColor: colors.sidebarActive },
  optText: { fontSize: colors.fontSize.caption, color: colors.ink2 },
  optTextActive: { color: colors.primary, fontWeight: '700' },
});