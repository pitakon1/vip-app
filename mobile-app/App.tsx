import React, { useEffect, useRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/stores/auth';
import { useLocationStore } from './src/stores/location';
import { initI18n } from './src/i18n';
import { ToastProvider } from './src/components/Toast';
import { queryClient } from './src/lib/queryClient';
import type { RootStackParamList } from './src/navigation/RootNavigator';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function AppShell() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // 记录上一次登录态，用于判定「本次变化」的方向（首次挂载不触发导航）
  const prevAuth = useRef<boolean | null>(null);

  useEffect(() => {
    void initI18n();
    // 冷启动时恢复登录态：读取本地 token 并向 /auth/me 校验
    void useAuthStore.getState().restore();
    // 恢复全局定位（国家/城市），供主页左上角与找房页区域读取
    useLocationStore.getState().hydrate();
  }, []);

  // 登录态切换的导航效果（对齐贝壳：浏览/搜索无需注册，只有需要登录的动作才要求登录）。
  // - 未登录 → 登录：把盖在上面的 Login / Register 弹掉，回到发起登录的原页面继续操作；
  // - 登录 → 未登录（登出 / 401 兜底登出）：reset 到 Main，回到可匿名浏览的首页。
  useEffect(() => {
    const prev = prevAuth.current;
    prevAuth.current = isAuthenticated;
    if (prev === null || !navigationRef.isReady()) return;
    if (!prev && isAuthenticated) {
      const route = navigationRef.getCurrentRoute();
      const name = route?.name;
      if (name === 'Register') navigationRef.goBack(); // 注册成功后先退出注册页
      if (name === 'Login' || name === 'Register') navigationRef.goBack(); // 再退出登录页 → 原动作页
    } else if (prev && !isAuthenticated) {
      navigationRef.reset({ index: 0, routes: [{ name: 'Main' }] });
    }
  }, [isAuthenticated]);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* ToastProvider 需位于 SafeAreaProvider 内部（依赖顶部安全区）且覆盖全局导航 */}
        <ToastProvider>
          <NavigationContainer ref={navigationRef}>
            <StatusBar style="auto" />
            <RootNavigator />
          </NavigationContainer>
        </ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  if (Platform.OS === 'web') {
    // Web 预览：以手机宽度容器居中显示，避免全宽拉伸导致比例失调
    return (
      <View style={styles.webFrame}>
        <View style={styles.webPhone}>
          <AppShell />
        </View>
      </View>
    );
  }
  return <AppShell />;
}

const styles = StyleSheet.create({
  webFrame: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#e6eaf0',
  },
  webPhone: {
    flex: 1,
    maxWidth: 480,
    backgroundColor: '#f2faf8',
    boxShadow: '0 0 40px rgba(15,23,42,0.12)',
  },
});
