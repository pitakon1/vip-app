import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import type { MapCanvasProps } from './types';

/**
 * Web 预览占位：react-native-maps 没有 Web 实现，浏览器里不挂载地图底图。
 * 顶部筛选与底部卡片仍可用（数据来自同一接口），只是不显示底图与气泡。
 */
export default function MapCanvas(_props: MapCanvasProps) {
  const { t } = useI18n();
  return (
    <View style={styles.wrap}>
      <Ionicons name="map-outline" size={34} color={colors.ink3} />
      <Text style={styles.text}>{t('map.webUnavailable')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
  },
  text: {
    fontSize: colors.fontSize.sm,
    lineHeight: colors.lineHeight.snug,
    color: colors.ink3,
    textAlign: 'center',
  },
});
