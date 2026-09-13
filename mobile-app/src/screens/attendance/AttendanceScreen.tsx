import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { geoApi, attendanceApi } from '@/services/api';

// 500KM 打卡半径（与需求一致）
const RADIUS_KM = 500;

export default function AttendanceScreen() {
  const [checking, setChecking] = useState(false);
  const [lastRecord, setLastRecord] = useState<string>('');

  const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('无定位权限', '请在设置中允许访问位置');
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({});
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      Alert.alert('定位失败', '无法获取当前定位');
      return null;
    }
  };

  const handleCheckIn = async () => {
    const coord = await getCurrentLocation();
    if (!coord) return;
    await doCheck(coord, 'checkin');
  };

  const handleCheckOut = async () => {
    const coord = await getCurrentLocation();
    if (!coord) return;
    await doCheck(coord, 'checkout');
  };

  const doCheck = async (
    coord: { latitude: number; longitude: number },
    type: 'checkin' | 'checkout',
  ) => {
    setChecking(true);
    try {
      // 调 geoApi.attendance 做 500KM 半径校验
      const gRes = await geoApi.attendance(coord.latitude, coord.longitude);
      const gd = gRes.data as any;
      const withinRadius = (gd as any)?.within_radius ?? gd?.distance_km <= RADIUS_KM;

      if (withinRadius) {
        if (type === 'checkin') {
          await attendanceApi.checkIn({ latitude: coord.latitude, longitude: coord.longitude });
        } else {
          await attendanceApi.checkOut({ latitude: coord.latitude, longitude: coord.longitude });
        }
        setLastRecord(
          `${type === 'checkin' ? '上班' : '下班'}打卡成功（在打卡半径内）`,
        );
        Alert.alert('打卡成功', type === 'checkin' ? '已签到' : '已签退');
      } else {
        // 不在半径内，引导填写外勤申请
        setLastRecord('不在打卡半径内，请填写外勤申请');
        Alert.alert(
          '不在打卡半径内',
          '您距离打卡点超过 500KM，请填写外勤申请。',
        );
        try {
          await attendanceApi.createExternalTrip({
            latitude: coord.latitude,
            longitude: coord.longitude,
            reason: '远程考勤打卡',
          });
        } catch {
          // 外勤申请提交失败不阻断提示
        }
      }
    } catch (err: any) {
      setLastRecord('');
      Alert.alert('打卡失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <Card>
        <Text style={styles.hint}>
          本功能将通过 GPS 定位进行打卡校验，打卡半径 {RADIUS_KM}KM。
        </Text>
        <Text style={styles.hint}>若不在打卡半径内，将自动引导填写外勤申请。</Text>
      </Card>

      <View style={styles.btnArea}>
        <TouchableOpacity
          style={[styles.btn, styles.checkIn, checking && styles.btnDisabled]}
          onPress={handleCheckIn}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={styles.btnText}>上班打卡</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.checkOut, checking && styles.btnDisabled]}
          onPress={handleCheckOut}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={styles.btnText}>下班打卡</Text>
          )}
        </TouchableOpacity>
      </View>

      {lastRecord ? (
        <View style={styles.recordBox}>
          <Text style={styles.recordText}>{lastRecord}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 12 },
  hint: { fontSize: 13, color: colors.ink2, lineHeight: 20 },
  btnArea: { flexDirection: 'row', gap: 12, padding: 16, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIn: { backgroundColor: colors.primary },
  checkOut: { backgroundColor: '#0e7490' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.primaryForeground, fontSize: 17, fontWeight: '600' },
  recordBox: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 16,
  },
  recordText: { fontSize: 14, color: colors.text, textAlign: 'center' },
});