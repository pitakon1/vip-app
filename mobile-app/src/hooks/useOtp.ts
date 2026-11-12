import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import { authApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import { getItem, setItem } from '@/lib/kv';
import { useLocationStore } from '@/stores/location';
import {
  COUNTRIES,
  detectDefaultCountry,
  displayCountry,
  findCountryByDial,
  findCountryByIso2,
  findCountryByLocale,
  isValidNationalNumber,
  phoneLengthHint as hintOf,
  searchCountries,
  toE164 as buildE164,
} from '@/data/countries';
import type { Country } from '@/data/countries';

/**
 * 国家/区号：数据来自 @/data/countries（由 scripts/sync-countries.mjs 从
 * backend/app/data/countries.json 生成，三端共用同一份）。
 */
export const COUNTRY_CODES: Country[] = COUNTRIES;

export { displayCountry, searchCountries, isValidNationalNumber };

/** 位数提示串（如 "9/10"），用于校验失败时回填到文案占位 */
export function phoneLengthHint(country: Country): string {
  return hintOf(country);
}

/** 按所选国家校验本地号码（去掉分隔符与长途前缀 0 后比对位数） */
export function isValidPhone(country: Country, phone: string): boolean {
  return isValidNationalNumber(country, phone);
}

/** 提交后端的统一格式：+区号+本地号码 */
export function phoneToE164(country: Country, phone: string): string {
  return buildE164(country, phone);
}

/** 兜底国家：按设备 locale/语言推断，取不到时用市场默认泰国，不再写死 +86 */
export const DEFAULT_COUNTRY: Country = detectDefaultCountry('th');

/** 用户手动选过的国家（记住上次选择，不随 locale 反复回弹） */
const COUNTRY_STORAGE_KEY = 'auth.country_iso2';

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

/** 当前定位城市 → 国家（城市名与数据里的中文名一致，如「泰国」） */
function countryFromCity(country?: string): Country | null {
  const name = (country || '').trim();
  if (!name) return null;
  return COUNTRIES.find((c) => c.zh === name) ?? null;
}

/**
 * 默认国家：优先「用户上次手动选择」→ 设备 locale → 当前定位城市 → 语言默认（泰国）。
 * 返回的 `selectCountry` 会把手动选择持久化，下次进来直接沿用。
 */
export function useDefaultCountry(lang?: string) {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const manual = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await getItem(COUNTRY_STORAGE_KEY).catch(() => null);
      if (!alive || manual.current) return;
      const hit = stored ? findCountryByIso2(stored) : null;
      if (hit) {
        setCountry(hit);
        return;
      }
      const locale = deviceLocale();
      const fromLocale = findCountryByLocale(locale);
      if (fromLocale) {
        setCountry(fromLocale);
        return;
      }
      const cityCountry = useLocationStore.getState().selection.country;
      setCountry(countryFromCity(cityCountry) ?? findCountryByDial('66') ?? DEFAULT_COUNTRY);
    })();
    return () => {
      alive = false;
    };
  }, [lang]);

  const selectCountry = useCallback((next: Country) => {
    manual.current = true;
    setCountry(next);
    void setItem(COUNTRY_STORAGE_KEY, next.iso2).catch(() => {});
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
