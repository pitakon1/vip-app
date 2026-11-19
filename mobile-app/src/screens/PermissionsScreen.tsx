/**
 * 权限设置 —— C 端「我的 - 设置 - 权限设置」详情页（对齐贝壳权限设置页）。
 *
 * 逐项：相机 / 相册 / 位置 / 麦克风 / 剪贴板 / 蓝牙 / 应用列表 / NFC。
 * 不是只看状态：每一项都接真实能力。
 * - 未申请：直接调用系统授权接口拉起系统弹窗（相机/相册 image-picker、位置 expo-location、
 *   麦克风 expo-audio 的录音权限）；
 * - 已拒绝：iOS 走 Linking.openSettings()；Android 用 expo-intent-launcher 打开本应用
 *   详情页（公开 API 没有「单权限页」直达，落到应用详情页由用户进权限）；
 * - 已授权：执行一次真实自检（相机预览、相册选择器、定位取一次坐标并结束；麦克风给撤销指引）；
 * - 剪贴板 / 蓝牙 / 应用列表 / NFC：没有可申请的运行时权限，保持「当前平台不支持」，
 *   不伪造开关，也不假装能通过系统设置改变运行时授权。
 * Web（Expo Web / 浏览器）没有系统设置页，改为调用真实 Web API 触发一次授权请求。
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Linking,
  Alert,
  Platform,
  AppState,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';

type PermStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';
type PermKey = 'camera' | 'photos' | 'location' | 'microphone' | 'clipboard' | 'bluetooth' | 'applist' | 'nfc';

interface PermItem {
  key: PermKey;
  icon: keyof typeof Ionicons.glyphMap;
}

const ITEMS: PermItem[] = [
  { key: 'camera', icon: 'camera-outline' },
  { key: 'photos', icon: 'images-outline' },
  { key: 'location', icon: 'location-outline' },
  { key: 'microphone', icon: 'mic-outline' },
  { key: 'clipboard', icon: 'clipboard-outline' },
  { key: 'bluetooth', icon: 'bluetooth-outline' },
  { key: 'applist', icon: 'apps-outline' },
  { key: 'nfc', icon: 'radio-outline' },
];

const toStatus = (raw?: string): PermStatus => {
  if (raw === 'granted') return 'granted';
  if (raw === 'denied') return 'denied';
  return 'undetermined';
};

// Web：浏览器 Permissions API 只覆盖部分能力，其余标记不支持
const queryWebPermission = async (name: string): Promise<PermStatus> => {
  const permissions = (globalThis as any)?.navigator?.permissions;
  if (!permissions?.query) return 'unsupported';
  try {
    const result = await permissions.query({ name });
    return result.state === 'granted'
      ? 'granted'
      : result.state === 'denied'
        ? 'denied'
        : 'undetermined';
  } catch {
    return 'unsupported';
  }
};

export default function PermissionsScreen() {
  const { t } = useI18n();
  const [status, setStatus] = React.useState<Record<string, PermStatus>>({});
  const [loading, setLoading] = React.useState(true);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const next: Record<string, PermStatus> = {
      camera: 'unsupported',
      photos: 'unsupported',
      location: 'unsupported',
      microphone: 'unsupported',
      clipboard: 'unsupported',
      bluetooth: 'unsupported',
      applist: 'unsupported',
      nfc: 'unsupported',
    };

    if (Platform.OS === 'web') {
      const [camera, microphone, location, clipboard] = await Promise.all([
        queryWebPermission('camera'),
        queryWebPermission('microphone'),
        queryWebPermission('geolocation'),
        queryWebPermission('clipboard-read'),
      ]);
      next.camera = camera;
      next.microphone = microphone;
      next.location = location;
      next.clipboard = clipboard;
    } else {
      try {
        next.camera = toStatus((await ImagePicker.getCameraPermissionsAsync()).status);
      } catch {
        next.camera = 'unsupported';
      }
      try {
        next.photos = toStatus((await ImagePicker.getMediaLibraryPermissionsAsync()).status);
      } catch {
        next.photos = 'unsupported';
      }
      try {
        next.location = toStatus((await Location.getForegroundPermissionsAsync()).status);
      } catch {
        next.location = 'unsupported';
      }
      try {
        next.microphone = toStatus((await getRecordingPermissionsAsync()).status);
      } catch {
        next.microphone = 'unsupported';
      }
    }

    setStatus(next);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // 从系统设置 / 相机 / 相册返回时也刷新（覆盖 AppState 未触发的情况）
  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const showHint = (msg: string) => {
    // react-native-web 的 Alert 是空实现，Web 下用页面内提示，保证点击有可见反馈
    if (Platform.OS === 'web') {
      setNotice(msg);
      return;
    }
    Alert.alert(t('permissions.title'), msg);
  };

  /** Android 打开本应用详情页；iOS 打开系统设置里本应用页 */
  const openSystemSettings = async () => {
    if (Platform.OS === 'web') {
      showHint(t('permissions.webHint'));
      return;
    }
    if (Platform.OS === 'android') {
      try {
        // 公开 API 没有「单权限页」直达；APPLICATION_DETAILS_SETTINGS 会落到本应用详情，
        // 用户在「权限」入口里关闭/开启即可。Expo Go 下打开的是 Expo Go 的应用详情页。
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
          { data: `package:${Application.applicationId ?? ''}` },
        );
        return;
      } catch {
        /* 部分 ROM 不支持该 Action，回退到 Linking */
      }
    }
    try {
      await Linking.openSettings();
    } catch {
      showHint(t('permissions.openFailed'));
    }
  };

  /** 未申请：真正拉起系统授权弹窗；返回是否已授权 */
  const requestPermission = async (key: PermKey): Promise<boolean> => {
    try {
      if (key === 'camera') {
        const res = await ImagePicker.requestCameraPermissionsAsync();
        return res.granted;
      }
      if (key === 'photos') {
        const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
        return res.granted;
      }
      if (key === 'location') {
        const res = await Location.requestForegroundPermissionsAsync();
        return res.granted;
      }
      if (key === 'microphone') {
        const res = await requestRecordingPermissionsAsync();
        return res.granted;
      }
    } catch {
      return false;
    }
    return false;
  };

  /** Web：用真实 API 触发一次浏览器授权请求 */
  const requestOnWeb = async (key: PermKey): Promise<boolean> => {
    try {
      if (key === 'camera' || key === 'microphone') {
        const stream = await (globalThis as any).navigator?.mediaDevices?.getUserMedia(
          key === 'camera' ? { video: true } : { audio: true },
        );
        stream?.getTracks?.().forEach((track: any) => track.stop());
        return true;
      }
      if (key === 'location') {
        await new Promise<void>((resolve, reject) => {
          (globalThis as any).navigator?.geolocation?.getCurrentPosition(
            () => resolve(),
            (err: any) => reject(err),
            { timeout: 10000 },
          );
        });
        return true;
      }
      if (key === 'clipboard') {
        await (globalThis as any).navigator?.clipboard?.readText?.();
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };

  /** 已授权：执行一次真实自检，让用户确认权限确实生效 */
  const selfCheck = async (key: PermKey) => {
    if (Platform.OS === 'web') {
      const ok = await requestOnWeb(key);
      showHint(ok ? t('permissions.selfCheckOk') : t('permissions.selfCheckFailed'));
      return;
    }
    try {
      if (key === 'camera') {
        const res = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.2,
        });
        if (res.canceled) showHint(t('permissions.selfCheckOk'));
        return;
      }
      if (key === 'photos') {
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
        if (res.canceled) showHint(t('permissions.selfCheckOk'));
        return;
      }
      if (key === 'location') {
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
        showHint(t('permissions.selfCheckOk'));
        return;
      }
      if (key === 'microphone') {
        // 没有录音业务场景时不强行录音，给出可执行的撤销/管理入口
        Alert.alert(t('permissions.title'), t('permissions.micGuidance'), [
          { text: t('permissions.cancel'), style: 'cancel' },
          { text: t('permissions.openSystem'), onPress: () => { void openSystemSettings(); } },
        ]);
      }
    } catch {
      showHint(t('permissions.selfCheckFailed'));
    }
  };

  const handlePress = async (item: PermItem) => {
    const s = loading ? 'undetermined' : status[item.key] ?? 'unsupported';
    if (s === 'unsupported') return;
    setBusyKey(item.key);
    try {
      if (Platform.OS === 'web') {
        const ok = await requestOnWeb(item.key);
        showHint(ok ? t('permissions.selfCheckOk') : t('permissions.selfCheckFailed'));
      } else if (s === 'undetermined') {
        const granted = await requestPermission(item.key);
        if (!granted) showHint(t('permissions.requestDenied'));
        else await selfCheck(item.key);
      } else if (s === 'denied') {
        await openSystemSettings();
      } else {
        await selfCheck(item.key);
      }
    } finally {
      setBusyKey(null);
      void refresh();
    }
  };

  const statusText = (s: PermStatus) => {
    if (s === 'granted') return t('permissions.granted');
    if (s === 'denied') return t('permissions.denied');
    if (s === 'unsupported') return t('permissions.unsupported');
    return t('permissions.undetermined');
  };

  const statusColor = (s: PermStatus) => {
    if (s === 'granted') return colors.primary;
    if (s === 'denied') return colors.error;
    return colors.ink3;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {ITEMS.map((item, idx) => {
          const s = loading ? 'undetermined' : (status[item.key] ?? 'unsupported');
          const unsupported = s === 'unsupported';
          const busy = busyKey === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.row, idx < ITEMS.length - 1 && styles.rowBorder, unsupported && styles.rowDisabled]}
              activeOpacity={0.7}
              disabled={unsupported}
              onPress={() => { void handlePress(item); }}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon} size={20} color={unsupported ? colors.ink3 : colors.ink2} />
              </View>
              <Text style={[styles.label, unsupported && { color: colors.ink3 }]}>
                {t(`permissions.${item.key}`)}
              </Text>
              <Text style={[styles.status, { color: statusColor(s) }]} numberOfLines={1}>
                {loading ? t('common.loading') : busy ? t('permissions.checking') : statusText(s)}
              </Text>
              {!unsupported ? (
                <Switch
                  style={styles.switch}
                  value={s === 'granted'}
                  disabled
                  trackColor={{ false: colors.line, true: colors.primarySoft }}
                  thumbColor={s === 'granted' ? colors.primary : colors.surface2}
                />
              ) : (
                <View style={styles.switch} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>{t('permissions.hint')}</Text>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: colors.radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowDisabled: { opacity: 0.6 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    marginRight: 12,
  },
  label: { flex: 1, fontSize: 15, color: colors.ink },
  status: { fontSize: 12, marginRight: 8, maxWidth: 110, textAlign: 'right' },
  switch: { transform: [{ scale: 0.82 }] },
  hint: { marginTop: 12, marginHorizontal: 4, fontSize: 12, lineHeight: 18, color: colors.ink3 },
  notice: { marginTop: 8, marginHorizontal: 4, fontSize: 12, lineHeight: 18, color: colors.ink2 },
});
