import { toast, type ToastType } from '@/components/Toast';
import { errorText } from '@/lib/errorText';
import { useI18n } from '@/i18n';

/** 组件外取文案：读当前语言，避免默认提示写死中文 */
const t = (key: string) => {
  try {
    return useI18n.getState().t(key);
  } catch {
    return key;
  }
};

/**
 * 租客端统一反馈工具（非阻塞 Toast 版）。
 *
 * 旧实现走 `Alert.alert` / `window.alert`：原生是阻塞弹窗、观感重；react-native-web 下
 * `Alert.alert` 更是空实现，会把提交结果与失败原因静默吞掉。现在统一走全局 Toast 单例
 * （`@/components/Toast`），web 与 native 表现一致，且不阻塞用户操作。
 */

/** 依据标题文案粗判语义：命中失败/错误关键词走错误样式，其余按成功提示 */
const inferType = (text: string): ToastType =>
  /失败|错误|异常|出错|failed|error|ไม่สำเร็จ|ผิดพลาด/i.test(text) ? 'error' : 'success';

/**
 * 通用提示（成功或信息性通知）。
 * 长内容（如缴费凭证、翻译结果）延长展示时间，避免来不及阅读。
 */
export const notify = (title?: string, message?: string) => {
  const head = (title ?? '').trim();
  const body = (message ?? '').trim();
  toast.show({
    type: inferType(head || body),
    title: head || body || t('common.done'),
    message: head ? body || undefined : undefined,
    duration: body.length > 60 ? 6000 : undefined,
  });
};

/**
 * 从 API/axios 错误里提取后端 detail / message，未命中时回退文案。
 *
 * 中心请求层已把 422 的 detail 数组压成字符串，但这里再做一层类型兜底：
 * 非字符串（历史遗留的数组/对象）一律回退，避免把对象塞进 Toast 文案。
 */
export const getErrorMessage = (err: any, fallback?: string): string =>
  errorText(err, fallback);

/**
 * 失败反馈 + 重试动作。
 * 通过 Toast 的 action 按钮承载「重试」，用户点击后触发 onRetry（带 action 的 Toast 展示 5s）。
 * 注意：非阻塞 Toast 无法同步得知用户是否点击，故固定返回 false，重试一律经 action 回调执行。
 */
export const notifyError = (
  title: string,
  err: any,
  onRetry?: () => void,
  retryLabel = t('common.retry'),
): boolean => {
  const message = getErrorMessage(err);
  toast.show({
    type: 'error',
    title: title || t('common.actionFailed'),
    message,
    actionLabel: onRetry ? retryLabel : undefined,
    onAction: onRetry,
  });
  return false;
};