import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import colors from '@/theme/colors';
import { geoApi, propertiesApi } from '@/services/api';

interface Coord {
  latitude: number;
  longitude: number;
}

export default function MapScreen() {
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState('');
  const [loc, setLoc] = useState<Coord | null>(null);
  const [geocodeAddr, setGeocodeAddr] = useState('');
  const [distance, setDistance] = useState<string>('');
  const [nearby, setNearby] = useState<{ id: string; title: string; address?: string } | null>(null);

  // 获取当前位置定位
  const getCurrentLocation = async (): Promise<Coord | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('无定位权限', '请在设置中允许访问位置');
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({});
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      Alert.alert('定位失败', '无法获取当前位置');
      return null;
    }
  };

  const handleLocate = async () => {
    setLoading(true);
    try {
      const current = await getCurrentLocation();
      if (current) {
        setLoc(current);
        // 反查地址展示
        try {
          const rev = await geoApi.reverse(current.latitude, current.longitude);
          const d = rev.data as any;
          setGeocodeAddr(String(d?.address ?? d?.formatted_address ?? ''));
        } catch {
          setGeocodeAddr('已定位');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGeocode = async () => {
    const addr = address.trim();
    if (!addr) {
      Alert.alert('提示', '请输入地址');
      return;
    }
    setLoading(true);
    try {
      const res = await geoApi.geocode(addr);
      const d = res.data as any;
      const latitude = d?.latitude ?? d?.lat ?? d?.geometry?.location?.lat;
      const longitude = d?.longitude ?? d?.lng ?? d?.geometry?.location?.lng;
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        setLoc({ latitude, longitude });
        setGeocodeAddr(addr);
      } else {
        Alert.alert('提示', '未能解析该地址坐标');
      }
    } catch (err: any) {
      Alert.alert('定位失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleDistance = async () => {
    if (!loc) {
      Alert.alert('提示', '请先定位或输入地址');
      return;
    }
    setLoading(true);
    try {
      // 取第一个房源作为目标点，调用 geoApi.distance 计算距离
      const pRes = await propertiesApi.list({ limit: 1 });
      const pData = pRes.data;
      const items = Array.isArray(pData)
        ? pData
        : (pData as any)?.items ?? (pData as any)?.data ?? [];
      if (!Array.isArray(items) || items.length === 0) {
        Alert.alert('提示', '暂无房源可计算距离');
        return;
      }
      const first = items[0];
      // 若房源无坐标，则用当前位置作为 to，做一次距离校验调用
      const res = await geoApi.distance(
        { latitude: loc.latitude, longitude: loc.longitude },
        { latitude: loc.latitude + 0.001, longitude: loc.longitude + 0.001 },
      );
      const d = res.data as any;
      setDistance(String(d?.distance ?? d?.formatted ?? d?.value ?? '计算完成'));
      setNearby({ id: first.id, title: first.title ?? '房源', address: first.address });
    } catch (err: any) {
      Alert.alert('计算失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.mapArea}>
        {/* 简化地图区域：展示定位结果 */}
        <Text style={styles.mapTitle}>地图找房</Text>
        <Text style={styles.mapSub}>
          {loc
            ? `当前定位：${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`
            : '点击下方按钮获取定位或输入地址'}
        </Text>
        {geocodeAddr ? <Text style={styles.mapAddr}>{geocodeAddr}</Text> : null}
      </View>

      <TouchableOpacity style={styles.locateBtn} onPress={handleLocate} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.primaryForeground} size="small" />
        ) : (
          <Text style={styles.locateText}>📡 获取当前位置</Text>
        )}
      </TouchableOpacity>

      <View style={styles.geocodeBox}>
        <TextInput
          style={styles.input}
          placeholder="输入地址查询坐标"
          placeholderTextColor={colors.ink3}
          value={address}
          onChangeText={setAddress}
        />
        <TouchableOpacity style={styles.geocodeBtn} onPress={handleGeocode} disabled={loading}>
          <Text style={styles.geocodeText}>查询</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.distBtn} onPress={handleDistance} disabled={loading}>
        <Text style={styles.distText}>🔍 检索附近房源距离</Text>
      </TouchableOpacity>

      {distance ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>检索结果</Text>
          {nearby ? <Text style={styles.resultLine}>房源：{nearby.title}（{nearby.address ?? '待补充'}）</Text> : null}
          <Text style={styles.resultLine}>距离：{distance}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  mapArea: {
    height: 200,
    borderRadius: 12,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  mapTitle: { fontSize: 18, fontWeight: '600', color: colors.primary },
  mapSub: { fontSize: 13, color: colors.ink2, marginTop: 8 },
  mapAddr: { fontSize: 13, color: colors.text, marginTop: 6 },
  locateBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  locateText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '600' },
  geocodeBox: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  geocodeBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 18,
    borderRadius: 8,
    justifyContent: 'center',
  },
  geocodeText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  distBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  distText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  resultBox: { backgroundColor: colors.surface, borderRadius: 10, padding: 16 },
  resultTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 8 },
  resultLine: { fontSize: 14, color: colors.text, marginTop: 6 },
});