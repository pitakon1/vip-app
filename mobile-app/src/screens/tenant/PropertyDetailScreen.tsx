import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import colors from '@/theme/colors';
import { propertiesApi, translateApi } from '@/services/api';

interface PropertyItem {
  id: string;
  title: string;
  address?: string;
  description?: string;
  rent?: number;
}

export default function PropertyDetailScreen() {
  const isFocused = useIsFocused();
  const [property, setProperty] = useState<PropertyItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState('');
  const [target, setTarget] = useState<'en' | 'es' | 'ja' | 'ko'>('en');

  const load = useCallback(async () => {
    try {
      const res = await propertiesApi.list({ limit: 1 });
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.data ?? [];
      const first = Array.isArray(items) && items.length > 0 ? items[0] : null;
      setProperty(
        first
          ? {
              id: first.id,
              title: first.title ?? '房源',
              address: first.address,
              description: first.description,
              rent: first.rent,
            }
          : null,
      );
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取房源');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const handleTranslate = async () => {
    if (!property?.description) {
      Alert.alert('提示', '该房源暂无描述');
      return;
    }
    setTranslating(true);
    setTranslated('');
    try {
      const res = await translateApi.translate(property.description, target);
      const d = res.data as any;
      setTranslated(
        String(d?.translated_text ?? d?.translation ?? d?.text ?? JSON.stringify(d)),
      );
    } catch (err: any) {
      Alert.alert('翻译失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setTranslating(false);
    }
  };

  const langs: { key: typeof target; label: string }[] = [
    { key: 'en', label: 'EN' },
    { key: 'es', label: 'ES' },
    { key: 'ja', label: '日' },
    { key: 'ko', label: '韩' },
  ];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!property ? (
        <Text style={styles.empty}>暂无房源</Text>
      ) : (
        <>
          <Text style={styles.title}>{property.title}</Text>
          {property.rent ? (
            <Text style={styles.rent}>฿{property.rent.toLocaleString()}/月</Text>
          ) : null}
          {property.address ? (
            <Text style={styles.address}>{property.address}</Text>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>房源描述</Text>
            <Text style={styles.desc}>
              {property.description ?? '该房源暂无详细描述。'}
            </Text>
          </View>

          <View style={styles.translateArea}>
            <Text style={styles.sectionTitle}>Google 翻译</Text>
            {property.description ? (
              <View style={styles.langRow}>
                {langs.map((l) => (
                  <TouchableOpacity
                    key={l.key}
                    style={[
                      styles.langBtn,
                      target === l.key && styles.langBtnActive,
                    ]}
                    onPress={() => setTarget(l.key)}
                  >
                    <Text
                      style={[
                        styles.langText,
                        target === l.key && styles.langTextActive,
                      ]}
                    >
                      {l.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.transBtn, (translating || !property.description) && styles.btnDisabled]}
              onPress={handleTranslate}
              disabled={translating || !property.description}
            >
              {translating ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text style={styles.transText}>翻译描述</Text>
              )}
            </TouchableOpacity>
            {translated ? (
              <View style={styles.resultBox}>
                <Text style={styles.resultText}>{translated}</Text>
              </View>
            ) : null}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 48 },
  title: { fontSize: 22, fontWeight: '600', color: colors.text },
  rent: { fontSize: 20, color: colors.primary, fontWeight: '700', marginTop: 8 },
  address: { fontSize: 14, color: colors.ink2, marginTop: 8 },
  section: { backgroundColor: colors.surface, borderRadius: 10, padding: 16, marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 10 },
  desc: { fontSize: 14, color: colors.text, lineHeight: 22 },
  translateArea: { backgroundColor: colors.surface, borderRadius: 10, padding: 16, marginTop: 16 },
  langRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  langTextActive: { color: colors.primaryForeground },
  transBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  transText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '600' },
  resultBox: {
    marginTop: 14,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
  },
  resultText: { fontSize: 14, color: colors.text, lineHeight: 22 },
});