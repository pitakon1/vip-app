import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';

/**
 * 全局确认弹窗（替代 `Alert.alert` 的二次确认用法）。
 *
 * 背景：react-native-web 下 `Alert.alert` 是空实现，删除/下线等危险操作在 Web 上
 * 点下去没有任何反应。这里用一份纯 View + Modal 的通用件统一 Web 与原生行为，
 * 只接管「标题 + 说明 + 确认/取消」这一种形态，不改页面结构与业务逻辑。
 *
 * 用法（命令式，任意模块可用，无需 hooks）：
 *   const ok = await confirm({
 *     title: t('crm.delete'),
 *     message: `${t('crm.deleteConfirm')}「${name}」？`,
 *     destructive: true,
 *     confirmLabel: t('crm.delete'),
 *   });
 *   if (ok) { ... }
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  /** 默认取 `common.cancel` */
  cancelLabel?: string;
  /** 默认取 `common.confirm` */
  confirmLabel?: string;
  /** 危险操作：确认按钮用错误色 */
  destructive?: boolean;
}

type Listener = (options: ConfirmOptions | null) => void;

const listeners = new Set<Listener>();
let pending: ((ok: boolean) => void) | null = null;

function settle(ok: boolean) {
  const resolve = pending;
  pending = null;
  listeners.forEach((l) => l(null));
  resolve?.(ok);
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  // 同一时刻只允许一个确认框：旧请求按「取消」结掉，避免 Promise 悬挂
  if (pending) settle(false);
  return new Promise<boolean>((resolve) => {
    pending = resolve;
    listeners.forEach((l) => l(options));
  });
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  // 关闭动画期间保留内容，避免文字先消失
  const last = useRef<ConfirmOptions | null>(null);

  useEffect(() => {
    const listener: Listener = (next) => {
      if (next) {
        last.current = next;
        setOptions(next);
      } else {
        setOptions(null);
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const data = options ?? last.current;
  const visible = options != null;

  return (
    <View style={styles.root}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => settle(false)}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => settle(false)} />
          <View style={styles.card} accessibilityViewIsModal>
            <Text style={styles.title} numberOfLines={3}>
              {data?.title ?? ''}
            </Text>
            {!!data?.message && (
              <Text style={styles.message} numberOfLines={6}>
                {data.message}
              </Text>
            )}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.btn}
                activeOpacity={0.7}
                onPress={() => settle(false)}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>{data?.cancelLabel ?? t('common.cancel')}</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.btn}
                activeOpacity={0.7}
                onPress={() => settle(true)}
                accessibilityRole="button"
              >
                <Text style={[styles.confirmText, data?.destructive && { color: colors.error }]}>
                  {data?.confirmLabel ?? t('common.confirm')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: colors.spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    paddingTop: colors.spacing.lg,
    ...colors.shadow.lg,
    // web 端盖住页面内的 Modal
    zIndex: Platform.OS === 'web' ? 10 : undefined,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    paddingHorizontal: colors.spacing.lg,
  },
  message: {
    fontSize: colors.fontSize.caption,
    lineHeight: 20,
    color: colors.ink2,
    textAlign: 'center',
    marginTop: colors.spacing.sm,
    paddingHorizontal: colors.spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: colors.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  btn: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  cancelText: { fontSize: 15, fontWeight: '500', color: colors.ink2 },
  confirmText: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
