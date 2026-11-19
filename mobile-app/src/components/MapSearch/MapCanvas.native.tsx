import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import type { MapCanvasProps } from './types';

/**
 * 原生地图画布（贝壳式）：全屏地图 + 价格气泡 marker + 右侧定位/缩放。
 *
 * 只在 iOS / Android 打包时被 Metro 解析（MapCanvas.web.tsx 负责浏览器预览）；
 * 因此 react-native-maps 不会被 Web 构建引入。
 */
export default function MapCanvas({
  points,
  selectedId,
  initialRegion,
  focus,
  userPos,
  bottomInset,
  onSelect,
  onBoundsChange,
  onLocateUnavailable,
}: MapCanvasProps) {
  const { t } = useI18n();
  const mapRef = useRef<MapView | null>(null);
  // 程序化居中（点卡片/点气泡）不应触发「按视野重拉」，否则列表会被收缩成一条
  const skipNextRegionRef = useRef(true);

  useEffect(() => {
    if (!focus) return;
    skipNextRegionRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: focus.lat,
        longitude: focus.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.012,
      },
      350,
    );
  }, [focus?.ts]);

  const handleRegionChange = (region: Region) => {
    if (skipNextRegionRef.current) {
      skipNextRegionRef.current = false;
      return;
    }
    onBoundsChange({
      min_lat: region.latitude - region.latitudeDelta / 2,
      max_lat: region.latitude + region.latitudeDelta / 2,
      min_lng: region.longitude - region.longitudeDelta / 2,
      max_lng: region.longitude + region.longitudeDelta / 2,
    });
  };

  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    skipNextRegionRef.current = true;
    map
      .getCamera()
      .then((camera) => {
        const zoom = Math.min(Math.max((camera.zoom ?? 13) + delta, 3), 20);
        return map.animateCamera({ ...camera, zoom }, { duration: 220 });
      })
      .catch(() => {
        /* 相机读取失败时保持当前视野 */
      });
  };

  const locate = () => {
    if (!userPos) {
      onLocateUnavailable();
      return;
    }
    mapRef.current?.animateToRegion(
      {
        latitude: userPos.lat,
        longitude: userPos.lng,
        latitudeDelta: 0.03,
        longitudeDelta: 0.02,
      },
      350,
    );
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onRegionChangeComplete={handleRegionChange}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {points.map((p) => {
          const on = p.id === selectedId;
          return (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              onPress={() => onSelect(p.id)}
              anchor={{ x: 0.5, y: 1 }}
              zIndex={on ? 2 : 1}
            >
              <View style={styles.markerWrap}>
                <View style={[styles.bubble, on && styles.bubbleOn]}>
                  <Text style={[styles.bubbleText, on && styles.bubbleTextOn]} numberOfLines={1}>
                    {p.priceLabel}
                  </Text>
                </View>
                <View style={[styles.tail, on && styles.tailOn]} />
              </View>
            </Marker>
          );
        })}
        {userPos ? (
          <Marker
            coordinate={{ latitude: userPos.lat, longitude: userPos.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={0}
          >
            <View style={styles.userDotOuter}>
              <View style={styles.userDot} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {/* 右侧悬浮控件：定位 + 缩放（与贝壳地图右侧一组按钮同位置） */}
      <View style={[styles.controls, { bottom: bottomInset + 16 }]}>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={locate}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('map.recenter')}
        >
          <Ionicons name="locate" size={20} color={colors.ink2} />
        </TouchableOpacity>
        <View style={styles.zoomGroup}>
          <TouchableOpacity
            style={styles.zoomBtn}
            onPress={() => zoomBy(1)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomIn')}
          >
            <Ionicons name="add" size={20} color={colors.ink2} />
          </TouchableOpacity>
          <View style={styles.zoomSplit} />
          <TouchableOpacity
            style={styles.zoomBtn}
            onPress={() => zoomBy(-1)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomOut')}
          >
            <Ionicons name="remove" size={20} color={colors.ink2} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  markerWrap: { alignItems: 'center' },
  bubble: {
    minWidth: 56,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    ...(Platform.OS === 'android' ? { elevation: 3 } : colors.shadow.sm),
  },
  bubbleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  bubbleText: {
    fontSize: colors.fontSize.caption,
    fontWeight: colors.fontWeight.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  bubbleTextOn: { color: colors.primaryForeground },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.card,
  },
  tailOn: { borderTopColor: colors.primary },
  userDotOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.alpha('20, 184, 166', 0.2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  controls: { position: 'absolute', right: 12, alignItems: 'center', gap: 10 },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.md,
  },
  zoomGroup: {
    borderRadius: colors.radius.md,
    backgroundColor: colors.card,
    overflow: 'hidden',
    ...colors.shadow.md,
  },
  zoomBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  zoomSplit: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
