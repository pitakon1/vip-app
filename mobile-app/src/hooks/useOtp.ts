import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import { authApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import { getItem, setItem } from '@/lib/kv';
import { useLocationStore } from '@/stores/location';

export interface CountryCode {
  value: string;
  labelKey: string;
}

/** 常用国家码（带 + 前缀，后端 phone 按此格式提交）；显示名走 i18n，避免中文硬编码 */
export const COUNTRY_CODES: CountryCode[] = [
  { value: '+86', labelKey: 'country.CN' },
  { value: '+852', labelKey: 'country.HK' },
  { value: '+853', labelKey: 'country.MO' },
  { value: '+886', labelKey: 'country.TW' },
  { value: '+1', labelKey: 'country.US' },
  { value: '+44', labelKey: 'country.GB' },
  { value: '+65', labelKey: 'country.SG' },
  { value: '+66', labelKey: 'country.TH' },
  { value: '+55', labelKey: 'country.BR' },
];

/** 各国本地号码位数（不含国际区号）；同一国家允许多种长度时全部列出 */
const PHONE_LENGTHS: Record<string, number[]> = {
  '+86': [11],
  '+852': [8],
  '+853': [8],
  '+886': [9],
  '+1': [10],
  '+44': [10],
  '+65': [8],
  '+66': [9],
  '+55': [10, 11],
};

/** 位数提示串（如 "10/11"），用于校验失败时回填到文案占位 */
export function phoneLengthHint(dial: string): string {
  return (PHONE_LENGTHS[dial] ?? []).join('/');
}

/** 按国家码校验本地号码：必须纯数字且位数命中；未收录国家按 6–15 位宽松判断 */
export function isValidPhone(dial: string, phone: string): boolean {
  const digits = phone.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return false;
  const lens = PHONE_LENGTHS[dial];
  if (!lens) return digits.length >= 6 && digits.length <= 15;
  return lens.includes(digits.length);
}

/** 兜底国家码：当前市场以泰国为主，取不到 locale/城市时用 +66，不再写死 +86 */
const FALLBACK_COUNTRY: CountryCode = { value: '+66', labelKey: 'country.TH' };
export const DEFAULT_COUNTRY = COUNTRY_CODES.find((c) => c.value === FALLBACK_COUNTRY.value)!;

/** 用户手动选过的国家码（记住上次选择，不随 locale 反复回弹） */
const COUNTRY_STORAGE_KEY = 'auth.country_code';

const byDial = (dial: string): CountryCode | null =>
  COUNTRY_CODES.find((c) => c.value === dial) ?? null;

/** ISO 3166-1 alpha-2 区域码 → 国际区号（仅列本项目在用的国家/地区） */
const REGION_DIAL: Record<string, string> = {
  CN: '+86',
  HK: '+852',
  MO: '+853',
  TW: '+886',
  US: '+1',
  CA: '+1',
  GB: '+44',
  SG: '+65',
  TH: '+66',
  BR: '+55',
};

/** 定位城市所在国家 → 区号；未收录的国家一律回落到市场默认 +66 */
const CITY_COUNTRY_DIAL: Record<string, string> = {
  泰国: '+66',
  新加坡: '+65',
};

/** 读取设备 locale 原始串（Web / iOS / Android 各取一处，不引入额外依赖） */
function deviceLocale(): string {
  try {
    if (Platform.OS === 'web') {
      const nav = (globalThis as any)?.navigator;
      return String(nav?.languages?.[0] ?? nav?.language ?? '');
    }
    if (Platform.OS === 'ios') {
      const settings = NativeModules?.SettingsManager?.settings;
      return String(settings?.AppleLocale ?? settings?.AppleLanguages?.[0] ?? '');
    }
    return String(NativeModules?.I18nManager?.localeIdentifier ?? '');
  } catch {
    return '';
  }
}

/** locale（en-TH / th_TH / zh-Hans-CN）→ 国家码；解析不到返回 null */
function countryFromLocale(): CountryCode | null {
  const parts = deviceLocale()
    .replace(/_/g, '-')
    .split('-');
  for (const part of parts.slice(1)) {
    const region = part.replace(/[^A-Za-z]/g, '').toUpperCase();
    if (region.length === 2 && REGION_DIAL[region]) {
      return byDial(REGION_DIAL[region]);
    }
  }
  return null;
}

/** 当前定位城市 → 国家码；取不到返回 null */
function countryFromCity(country?: string): CountryCode | null {
  const dial = country ? CITY_COUNTRY_DIAL[country.trim()] : undefined;
  return dial ? byDial(dial) : null;
}

/**
 * 默认国家码：优先「用户上次手动选择」→ 设备 locale → 当前定位城市 → +66。
 * 返回的 `selectCountry` 会把手动选择持久化，下次进来直接沿用。
 */
export function useDefaultCountry() {
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const manual = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await getItem(COUNTRY_STORAGE_KEY).catch(() => null);
      if (!alive || manual.current) return;
      const hit = stored ? byDial(stored) : null;
      if (hit) {
        setCountry(hit);
        return;
      }
      const fromLocale = countryFromLocale();
      if (fromLocale) {
        setCountry(fromLocale);
        return;
      }
      const cityCountry = useLocationStore.getState().selection.country;
      setCountry(countryFromCity(cityCountry) ?? FALLBACK_COUNTRY);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selectCountry = useCallback((next: CountryCode) => {
    manual.current = true;
    setCountry(next);
    void setItem(COUNTRY_STORAGE_KEY, next.value).catch(() => {});
  }, []);

  return { country, selectCountry };
}

/**
 * 验证码倒计时 + 发送逻辑（注册/登录复用）。
 * sendOtp 成功则进入 60s 倒计时，并返回响应里的 dev_code（存在时用于自动填入）。
 */
export function useOtp() {
  const { t } = useI18n();
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
      notify(data?.message || t('register.otpSent'));
      return (data?.dev_code ?? undefined) as string | undefined;
    } catch (err) {
      notifyError(t('register.otpFailed'), err);
      return undefined;
    } finally {
      setSending(false);
    }
  };

  return { sending, secondsLeft, sendOtp };
}