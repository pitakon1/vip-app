/** 电子合同屏幕私有工具函数（仅本屏使用）。 */
import { EXT_MIME, VERIFY_METHOD_LABEL } from './constants';

export const stripHtml = (html?: string) =>
  (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

// 由选中文档构造上传文件对象 { uri, name, type }：name 需带正确扩展名
export const resolveUploadFile = (asset: any) => {
  const rawName = asset?.name || '';
  const extMatch = /\.([A-Za-z0-9]+)$/.exec(rawName);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  let mime = asset?.mimeType || '';
  if (!mime) {
    const uriExt = /\.([A-Za-z0-9]+)$/.exec(asset?.uri || '')?.[1]?.toLowerCase() || '';
    mime = EXT_MIME[uriExt] || EXT_MIME[ext] || '';
  }
  const resolvedExt = ext || Object.keys(EXT_MIME).find((k) => EXT_MIME[k] === mime) || '';
  const name = rawName || (resolvedExt ? `contract.${resolvedExt}` : 'contract');
  const finalName = /\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.${resolvedExt || ''}`.replace(/\.$/, '');
  return {
    uri: asset?.uri,
    name: finalName,
    type: mime || 'application/octet-stream',
  } as any;
};

/* 后端时间戳统一为 naive UTC（无时区后缀）。此前直接 replace('T',' ') 会把 UTC 当本地
   时间展示，东八区下比 Web 端早 8 小时；这里先补 'Z' 归一为 UTC，再按用户本地时区格式化。 */
export const fmtDate = (x?: string) => {
  if (!x) return '-';
  const raw = String(x);
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw.replace('T', ' ').slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 后端 file_path 为服务端本地路径（Windows 下自带反斜杠），详情里只展示文件名 */
export const baseName = (p?: string | null) => {
  if (!p) return '-';
  const s = String(p).split(/[\\/]/).pop();
  return s || String(p);
};

// 签署方式摘要（后端返回 {method: count}）→ 可读文本；非字典时原样输出
export const fmtSignTypesSummary = (t: (k: string) => string, summary: any): string => {
  if (!summary || typeof summary !== 'object') return String(summary ?? '');
  return (
    Object.entries(summary as Record<string, number>)
      .map(([m, n]) => `${VERIFY_METHOD_LABEL[m] ? t(VERIFY_METHOD_LABEL[m]) : m} × ${n}`)
      .join('、') || '-'
  );
};

/**
 * 把 SignaturePad 画板的 <Svg> 实例导成 PNG data URL。
 * react-native-svg 的 toDataURL 是回调式（web/原生都实现），且图片解码失败时可能不回调，
 * 所以加一个超时兜底，避免 await 永久挂起；失败时返回空串由调用方回退 SVG。
 */
export const exportPadPng = (ref: { current: any }) =>
  new Promise<string>((resolve) => {
    const inst: any = ref.current;
    if (!inst || typeof inst.toDataURL !== 'function') {
      resolve('');
      return;
    }
    let done = false;
    const finish = (v: string) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      inst.toDataURL((b64: string) => finish(b64 ? `data:image/png;base64,${b64}` : ''));
      setTimeout(() => finish(''), 1500);
    } catch {
      finish('');
    }
  });
