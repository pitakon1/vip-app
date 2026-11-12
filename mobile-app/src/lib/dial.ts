import { Linking } from 'react-native';

/**
 * 拨号统一入口。
 *
 * 直接 `Linking.openURL('tel:' + 原始号码)` 有两个坑：
 * 1. 号码里带空格、括号、短横线（库里就有 `+66 00 000 0000`），部分 Android ROM
 *    会把 `tel:` 当成普通 VIEW intent，弹出「打开方式」选择层而不是拨号盘；
 * 2. 空号/无效号会静默失败，用户不知道发生了什么。
 *
 * 这里只保留数字和一个前导 `+`，交给系统拨号；失败原因回传给调用方提示。
 */

export type DialResult = 'ok' | 'empty' | 'invalid' | 'failed';

// 多号码分隔符：/ , ， ; ； 、 | 换行
const PHONE_SEPARATORS = /[/,，;；、|\n]+/;

/** 取第一个可拨号码，并归一化成 tel: 可接受的 `+数字` / `数字`。 */
export function normalizePhone(raw?: string | null): string | null {
  const source = String(raw ?? '').trim();
  if (!source) return null;

  for (const part of source.split(PHONE_SEPARATORS)) {
    const candidate = part.trim();
    if (!candidate) continue;

    const international = candidate.startsWith('+') || candidate.startsWith('00');
    let digits = candidate.replace(/\D/g, '');
    if (candidate.startsWith('00')) digits = digits.replace(/^00/, '');

    // 3~15 位：兼顾短号与 E.164 上限
    if (digits.length < 3 || digits.length > 15) continue;
    return `${international ? '+' : ''}${digits}`;
  }
  return null;
}

/**
 * 点击即调起系统拨号。多个号码取第一个有效号码（主号码），不额外弹选择层。
 * 返回 `empty` / `invalid` / `failed` 时由调用方按自己的文案提示。
 */
export async function dialPhone(raw?: string | null): Promise<DialResult> {
  if (!String(raw ?? '').trim()) return 'empty';

  const phone = normalizePhone(raw);
  if (!phone) return 'invalid';

  try {
    await Linking.openURL(`tel:${phone}`);
    return 'ok';
  } catch {
    // 某些环境（如 Expo Web 没有 tel: 处理器）会直接拒绝
    return 'failed';
  }
}
