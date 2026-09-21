import React, { useEffect } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/stores/auth';
import { initI18n } from './src/i18n';
import { ToastProvider } from './src/components/Toast';
import { queryClient } from './src/lib/queryClient';

function AppShell() {
  useEffect(() => {
    void initI18n();
    // 冷启动时恢复登录态：读取本地 token 并向 /auth/me 校验
    void useAuthStore.getState().restore();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* ToastProvider 需位于 SafeAreaProvider 内部（依赖顶部安全区）且覆盖全局导航 */}
        <ToastProvider>
          <NavigationContainer>
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
