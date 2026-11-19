import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { devicesApi } from '@/services/api';
import { getItem, setItem } from '@/lib/kv';

/**
 * Expo 推送注册（App 端）。
 *
 * 真机收到推送需要三件事同时成立，缺一不可：
 * 1. 本函数拿到 `ExponentPushToken[...]` 并成功上报后端；
 * 2. 系统通知权限已授予（用户拒绝时状态为 denied，应在设置里引导开启）；
 * 3. 项目在 Expo/EAS 侧配好 FCM（Android）与 APNs（iOS）凭据——
 *    这只影响"Expo 把消息投到设备"，代码侧无法代替，未配置时设备收不到。
 *
 * Web 与模拟器没有原生推送通道，这里直接返回 unsupported，不伪造成功。
 */
const TOKEN_STORAGE_KEY = 'push.expo_token';

export type PushRegisterResult =
  | { state: 'registered'; token: string }
  | { state: 'denied' }
  | { state: 'unsupported'; reason: 'web' | 'simulator' }
  | { state: 'not-configured'; reason: 'project-id' }
  | { state: 'error'; message: string };

// 前台收到推送时也展示横幅（后台由系统负责，不受此影响）
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** EAS projectId：SDK 52 的 getExpoPushTokenAsync 必须显式传入。 */
function easProjectId(): string | undefined {
  const fromConfig = (Constants.expoConfig as any)?.extra?.eas?.projectId;
  const fromEas = (Constants as any)?.easConfig?.projectId;
  return fromConfig || fromEas || undefined;
}

export async function registerPushToken(): Promise<PushRegisterResult> {
  if (Platform.OS === 'web') {
    return { state: 'unsupported', reason: 'web' };
  }
  if (!Device.isDevice) {
    return { state: 'unsupported', reason: 'simulator' };
  }
  const projectId = easProjectId();
  if (!projectId) {
    return { state: 'not-configured', reason: 'project-id' };
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#14b8a6',
      });
    }

    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) {
      return { state: 'denied' };
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await devicesApi.registerPushToken({
      token,
      platform: Platform.OS,
      app_version: Application.nativeApplicationVersion ?? undefined,
    });
    await setItem(TOKEN_STORAGE_KEY, token);
    return { state: 'registered', token };
  } catch (err: any) {
    return { state: 'error', message: err?.message ?? String(err) };
  }
}

/** 退出登录时撤销本设备 token（尽力而为，失败不影响登出）。 */
export async function unregisterPushToken(): Promise<void> {
  const token = await getItem(TOKEN_STORAGE_KEY).catch(() => null);
  if (!token) return;
  try {
    await devicesApi.unregisterPushToken(token);
  } catch {
    // 忽略：令牌失效时撤销本就会 401，服务端也会在下次注册时改归属
  }
  try {
    await setItem(TOKEN_STORAGE_KEY, '');
  } catch {
    // 忽略本地存储异常
  }
}
