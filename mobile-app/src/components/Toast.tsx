import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  type?: ToastType;
  title: string;
  message?: string;
  /** 自动消失时长（毫秒）；传 0 表示不自动消失。默认：带 action 5000ms，其余 3000ms */
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastItem extends ToastOptions {
  id: number;
}

type Listener = (item: ToastItem | null) => void;

// ---------- 模块级单例 ----------
// 订阅者列表让非 React 代码（utils/feedback.ts 等）无需 hooks 也能命令式触发 Toast
const listeners = new Set<Listener>();
let seed = 0;

/** 命令式 Toast API：toast.show(...) / toast.hide() */
export const toast = {
  show(options: ToastOptions) {
    const item: ToastItem = { type: 'info', ...options, id: ++seed };
    listeners.forEach((l) => l(item));
  },
  hide() {
    listeners.forEach((l) => l(null));
  },
};

const TYPE_META: Record<ToastType, { icon: IoniconName; color: string }> = {
  success: { icon: 'checkmark-circle', color: colors.success },
  error: { icon: 'alert-circle', color: colors.error },
  info: { icon: 'information-circle', color: colors.info },
};

// web 下 react-native-web 没有原生动画模块，开启 useNativeDriver 只会打印告警
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * 全局非阻塞 Toast 容器。
 * 挂在 SafeAreaProvider 内部（依赖 useSafeAreaInsets 计算顶部安全区），覆盖整个应用。
 * 纯 View + Animated 实现，不依赖 Alert / window.alert，web 与 native 表现一致。
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<ToastItem | null>(null);
  const [shown, setShown] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 退场动画令牌：新的 Toast 到来时让进行中的退场回调失效，避免误隐藏新内容
  const exitToken = useRef(0);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // 订阅模块级命令式 API
  useEffect(() => {
    const listener: Listener = (next) => {
      if (next) {
        exitToken.current += 1;
        setItem(next);
        setShown(true);
        return;
      }
      const token = ++exitToken.current;
      Animated.timing(anim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(() => {
        if (exitToken.current === token) setShown(false);
      });
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [anim]);

  // 入场动画（淡入 + 上滑）+ 自动消失
  useEffect(() => {
    if (!item) return;
    clearTimer();
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
    const duration = item.duration ?? (item.actionLabel ? 5000 : 3000);
    if (duration > 0) {
      timer.current = setTimeout(() => toast.hide(), duration);
    }
    return clearTimer;
  }, [item, anim, clearTimer]);

  const meta = TYPE_META[item?.type ?? 'info'];

  const handleAction = () => {
    const cb = item?.onAction;
    toast.hide();
    cb?.();
  };

  return (
    <View style={styles.root}>
      {children}
      {shown && item ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.host,
            {
              top: insets.top + 8,
              opacity: anim,
              transform: [
                {
                  translateY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.card}>
            <Ionicons name={meta.icon} size={22} color={meta.color} />
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              {!!item.message && (
                <Text style={styles.message} numberOfLines={8}>
                  {item.message}
                </Text>
              )}
              {!!item.actionLabel && (
                <TouchableOpacity style={styles.action} onPress={handleAction} activeOpacity={0.7}>
                  <Text style={styles.actionText}>{item.actionLabel}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  host: {
    position: 'absolute',
    left: colors.spacing.md,
    right: colors.spacing.md,
    zIndex: 9999,
    elevation: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: colors.spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: colors.spacing.lg,
    ...colors.shadow.lg,
  },
  body: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: colors.ink, letterSpacing: -0.1 },
  message: { fontSize: 13, color: colors.ink2, marginTop: colors.spacing.xs, lineHeight: 19 },
  action: { marginTop: colors.spacing.sm, alignSelf: 'flex-start' },
  actionText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});