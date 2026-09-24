import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useI18n, LANGS, LANG_LABELS } from '@/i18n';
import colors from '@/theme/colors';

/**
 * 语言选择（全屏下钻子页，微信「设置→通用→多语言」式）。
 * 由「我的」设置区块「语言」行进入；选择后即时生效并返回。
 */
export default function SettingsLanguageScreen() {
  const { lang, setLang } = useI18n();

  return (
    <View style={styles.container}>
      <FlatList
        data={LANGS}
        keyExtractor={(id) => id}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const selected = lang === item;
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => setLang(item)}
              accessibilityRole="button"
            >
              <Text style={styles.text}>{LANG_LABELS[item]}</Text>
              {selected ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  text: {
    fontSize: 15,
    color: colors.text,
  },
});