/**
 * 显式全量加载：按页循环拉取直到取满 total 或返回空页。
 *
 * 用于「页面需要在前端做搜索/状态筛选并展示全局统计」的列表。
 * 不要与「只取第一页 + 本地筛选」混用——那会把筛选结果限制在第一页之内。
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<unknown>,
  pageSize: number,
  maxPages = 20,
): Promise<{ items: T[]; total: number }> {
  const items: T[] = [];
  let total = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await fetchPage(page);
    const raw = (res as any)?.data ?? res;
    const payload = raw?.data ?? raw;
    const batch = (Array.isArray(payload) ? payload : payload?.items ?? []) as T[];
    total = typeof payload?.total === 'number' ? payload.total : items.length + batch.length;
    items.push(...batch);
    if (!batch.length || items.length >= total || batch.length < pageSize) break;
  }
  return { items, total: total || items.length };
}
