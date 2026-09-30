/**
 * 合作公司「手动输入 + 相似匹配」选择器
 * 输入公司名任意片段 → 防抖后按 `GET /admin/partners{keyword}` 模糊匹配，
 * 下方给出候选建议（前缀/包含命中优先），点选后回填 name 并回调 id。
 * 无匹配时给出提示，不强制选择。若需清空已选，由父级监听 onQueryEdited 自行处理。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { partnersAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';

interface PartnerOption {
  id: string;
  name: string;
}

interface Props {
  placeholder?: string;
  disabled?: boolean;
  /** 点选某个建议时回调（附带公司 id 与名称） */
  onSelect: (id: string, name: string) => void;
  /** 输入内容发生编辑（与当前已选不一致）时回调，供父级清空未提交的 partner_id */
  onQueryEdited?: () => void;
}

const DEBOUNCE_MS = 250;

export default function PartnerSearchPicker({ placeholder, disabled, onSelect, onQueryEdited }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PartnerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    try {
      const { data } = await partnersAdminApi.list({ page_size: 20, keyword: q });
      const d = data?.data ?? data;
      const items: any[] = (d?.items ?? d ?? []) as any[];
      const opts: PartnerOption[] = items.map((p) => ({ id: String(p.id), name: String(p?.name ?? '') }));
      // 命中排序：完全相等 > 前缀命中 > 包含命中
      const k = q.trim().toLowerCase();
      const rank = (s: string) => {
        const n = s.trim().toLowerCase();
        if (n === k) return 0;
        if (n.startsWith(k)) return 1;
        if (n.includes(k)) return 2;
        return 3;
      };
      opts.sort((a, b) => rank(a.name) - rank(b.name));
      setResults(opts);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const onChangeText = (text: string) => {
    setQuery(text);
    setOpen(true);
    if (onQueryEdited) onQueryEdited();
    const q = text.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(() => search(q), DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const select = (opt: PartnerOption) => {
    onSelect(opt.id, opt.name);
    setQuery(opt.name);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Ionicons name="business-outline" size={15} color={colors.ink3} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onChangeText}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || t('acc.searchPartnerPlaceholder')}
          placeholderTextColor={colors.ink3}
          editable={!disabled}
        />
        {loading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
      {open && query.trim().length > 0 && (
        <View style={styles.list}>
          {results.length === 0 ? (
            <Text style={styles.empty}>{t('acc.noPartnerMatch')}</Text>
          ) : (
            results.map((opt) => (
              <TouchableOpacity key={opt.id} style={styles.option} activeOpacity={0.7} onPress={() => !disabled && select(opt)}>
                <Ionicons name="business-outline" size={15} color={colors.primary} />
                <Text style={styles.optionText} numberOfLines={1}>{opt.name}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },
  list: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: { flex: 1, fontSize: 14, color: colors.ink },
  empty: { fontSize: 12, color: colors.ink3, paddingHorizontal: 12, paddingVertical: 12 },
});