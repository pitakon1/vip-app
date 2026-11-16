/**
 * Google Maps Key（Expo / App 端）。
 *
 * 现状：App **没有**任何地图渲染组件（未安装 expo-maps / react-native-maps），
 * 位置能力只通过后端 `/geo/geocode`、`/geo/reverse` 做服务端地理编码。
 * 因此这里先提供配置位与读取逻辑，不新建地图页面、不替换任何地图供应商。
 *
 * Key 按平台拆分（与 Google Cloud 里三个受限 Key 对应）：
 * - Web（Expo Web / 浏览器）：EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY（HTTP 来源限制）
 * - Android：EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY
 * - iOS：EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY
 *
 * 后续若接入 expo-maps / react-native-maps，还需在 app.json 里为 android/ios
 * 增加 API Key 配置（当前没有地图库，写进去也是死配置，故未添加）。
 */
const readEnv = (name: string): string => {
  const env = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return (env?.[name] || '').trim();
};

export const GOOGLE_MAPS_WEB_API_KEY = readEnv(
  'EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY',
);
export const GOOGLE_MAPS_ANDROID_API_KEY = readEnv(
  'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY',
);
export const GOOGLE_MAPS_IOS_API_KEY = readEnv(
  'EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY',
);

/** 是否至少配置了一个平台的地图 Key（当前无调用方，供后续地图组件使用）。 */
export const hasGoogleMapsKey = (): boolean =>
  Boolean(
    GOOGLE_MAPS_WEB_API_KEY ||
      GOOGLE_MAPS_ANDROID_API_KEY ||
      GOOGLE_MAPS_IOS_API_KEY,
  );
