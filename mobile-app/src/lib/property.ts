// 取房源照片首图 URL（兼容字符串与 {url|path} 对象两种形态），无则返回空
export const propertyCoverUrl = (photos?: unknown[] | null): string => {
  if (!Array.isArray(photos) || photos.length === 0) return '';
  const first = photos[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    const o = first as { url?: unknown; path?: unknown };
    return typeof o.url === 'string' ? o.url : typeof o.path === 'string' ? o.path : '';
  }
  return '';
};
