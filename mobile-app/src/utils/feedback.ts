import { Platform, Alert } from 'react-native';

/**
 * 租客端统一反馈工具。
 *
 * react-native-web 下 `Alert.alert`/`Alert.confirm` 是空实现（什么都不显示），会把提交/加载的
 * 结果与失败原因静默吞掉，导致用户点击后「没有任何反应」。这里统一在 web 下降级到浏览器原生
 * `window.alert`/`window.confirm`，让真实结果（成功 / 具体错误）对用户可见。
 */

/** 通用提示（成功或信息性通知） */
export const notify = (title?: string, message?: string) => {
  const text = message ? `${title ?? ''}\n${message}` : (title ?? '');
  if (Platform.OS === 'web') {
    window.alert(text);
  } else {
    Alert.alert(title ?? '', message ?? '');
  }
};

/** 从 API/axios 错误里提取后端 detail / message，未命中时回退文案 */
export const getErrorMessage = (err: any, fallback = '请稍后重试') =>
  err?.response?.data?.detail ||
  err?.response?.data?.message ||
  err?.message ||
  fallback;

/**
 * 失败反馈 + 重试动作。
 * - web：用浏览器原生 confirm，用户点「确定」即重试（choice 为 true 时触发 onRetry）
 * - native：用带「重试 / 取消」按钮的 Alert
 * 返回用户是否「确认重试」，便于调用方按需再执行。
 */
export const notifyError = (
  title: string,
  err: any,
  onRetry?: () => void,
  retryLabel = '重试',
): boolean => {
  const message = getErrorMessage(err);
  if (Platform.OS === 'web') {
    const choice = window.confirm(`${title}\n${message}\n\n点击「确定」重试`);
    if (choice) onRetry?.();
    return choice;
  }
  if (onRetry) {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      { text: retryLabel, onPress: onRetry },
    ]);
  } else {
    Alert.alert(title, message, [{ text: '知道了' }]);
  }
  return false;
};