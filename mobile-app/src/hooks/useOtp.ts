import { useEffect, useRef, useState } from 'react';
import { authApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';

/** 常用国家码（带 + 前缀，后端 phone 按此格式提交） */
export const COUNTRY_CODES = [
  { value: '+86', label: '+86 中国大陆' },
  { value: '+852', label: '+852 中国香港' },
  { value: '+853', label: '+853 中国澳门' },
  { value: '+886', label: '+886 中国台湾' },
  { value: '+1', label: '+1 美国' },
  { value: '+44', label: '+44 英国' },
  { value: '+65', label: '+65 新加坡' },
  { value: '+66', label: '+66 泰国' },
  { value: '+55', label: '+55 巴西' },
];

export const DEFAULT_COUNTRY = COUNTRY_CODES[0];

/**
 * 验证码倒计时 + 发送逻辑（注册/登录复用）。
 * sendOtp 成功则进入 60s 倒计时，并返回响应里的 dev_code（存在时用于自动填入）。
 */
export function useOtp() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const startCountdown = () => {
    stop();
    setSecondsLeft(60);
    timer.current = setInterval(() => {
      setSecondsLeft((p) => {
        if (p <= 1) {
          stop();
          return 0;
        }
        return p - 1;
      });
    }, 1000);
  };

  const sendOtp = async (recipient: string, channel: 'sms' | 'email' = 'sms') => {
    if (sending || secondsLeft > 0) return undefined;
    setSending(true);
    try {
      const { data } = await authApi.requestOtp(recipient, channel);
      startCountdown();
      notify(data?.message || '验证码已发送');
      return (data?.dev_code ?? undefined) as string | undefined;
    } catch (err) {
      notifyError('发送验证码失败', err);
      return undefined;
    } finally {
      setSending(false);
    }
  };

  return { sending, secondsLeft, sendOtp };
}