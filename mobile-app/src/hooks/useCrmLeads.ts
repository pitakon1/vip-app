import { DETAIL_PAGE_SIZE, OPTION_PAGE_SIZE } from '@/lib/pagination';
import { useCallback, useRef, useState } from 'react';
import dayjs from 'dayjs';
import api from '@/lib/api';
import { employeesApi, leadsApi } from '@/services/api';

export interface Lead {
  id: string;
  name?: string | null;
  phone?: string | null;
  line_id?: string | null;
  wechat_id?: string | null;
  email?: string | null;
  nationality?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  budget_currency?: string | null;
  interested_projects?: unknown[] | null;
  recommended_projects?: unknown[] | null;
  stage?: string | null;
  assigned_to?: string | null;
  source?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// 客户阶段键（管理端 / 员工端 CRM 同口径，顺序即接口调用顺序）
export const CRM_STAGE_KEYS = [
  'inquiring',
  'viewing_scheduled',
  'negotiating',
  'pending_contract',
  'closed',
] as const;

/**
 * CRM 线索数据加载：首屏线索 + 各阶段计数 + 本月新增 + 负责人姓名映射。
 * 管理端与员工端两处 CRM 的取数与统计口径完全一致，故抽到这里共用。
 *
 * `mine`：员工端必须为 true —— 列表按当前员工档案收窄（服务端 mine/assigned_to），
 * 避免拿到全平台客户联系方式；管理端看全量，保持不变。
 *
 * `keyword`：服务端关键词搜索（姓名/电话/邮箱/社交账号）。此前只在首屏数据上做
 * 客户端过滤，第 1 页之后命中不了的客户永远搜不到；现在交给服务端，并配合
 * 下面的加载更多一起覆盖全部线索。
 *
 * 分页：`load` 始终从第 1 页重取（筛选/搜索变更即回到第 1 页），`loadMore`
 * 追加下一页；`hasMore` 以服务端 `total` 为准，不再静默丢弃超出首页的数据。
 */
export function useCrmLeads(stage: string, opts?: { mine?: boolean; keyword?: string }) {
  const mine = !!opts?.mine;
  const keyword = opts?.keyword?.trim() ?? '';
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [stageTotals, setStageTotals] = useState<Record<string, number>>({});
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [monthNew, setMonthNew] = useState<number | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // 触底会连续触发多次 onEndReached，用 ref 做同步防重入（state 更新是异步的）
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    setLoadError(false);
    loadingMoreRef.current = false;
    setLoadingMore(false);
    // 员工端先解析本人员工档案：服务端既按 mine 收窄，也接受 assigned_to 校验
    let empId: string | null = null;
    if (mine) {
      try {
        const res: any = await employeesApi.mine();
        const d = res?.data?.data ?? res?.data;
        empId = d?.id ?? null;
        setMyEmployeeId(empId);
      } catch {
        // 没有员工档案：没有「我的线索」，后续请求服务端会返回空集
        setMyEmployeeId(null);
      }
    }
    const scope = mine ? { mine: true, ...(empId ? { assigned_to: empId } : {}) } : {};
    // 阶段计数由列表响应里的 stage_counts 一并返回（同一次请求，口径一致），
    // 不再逐阶段发 COUNT_ONLY 探测请求。
    const results = await Promise.allSettled([
      leadsApi.list({ page: 1, page_size: OPTION_PAGE_SIZE, ...scope }),
      leadsApi.list({
        page: 1,
        page_size: DETAIL_PAGE_SIZE,
        ...(stage ? { stage } : {}),
        ...(keyword ? { keyword } : {}),
        ...scope,
      }),
      api.get('/employees/directory'),
    ]);

    const itemsOf = (res: PromiseSettledResult<any>): any[] => {
      if (res.status !== 'fulfilled') return [];
      const d = res.value?.data;
      return Array.isArray(d) ? d : (d?.items ?? []);
    };

    // 全量首屏（按创建时间倒序）用于「本月新增」统计
    const allLeads = itemsOf(results[0]) as Lead[];
    setMonthNew(
      allLeads.filter((l) => l.created_at && dayjs(l.created_at).isSame(dayjs(), 'month')).length,
    );

    const items = itemsOf(results[1]) as Lead[];
    if (results[1].status === 'fulfilled') {
      setLeads(items);
    } else {
      setLeads([]);
      setLoadError(true);
    }
    // 分页游标回到第 1 页：搜索/阶段变更后必须重算，否则会接着旧页继续追加
    setPage(1);
    const pageTotal =
      results[1].status === 'fulfilled'
        ? Number((results[1].value?.data as { total?: number } | undefined)?.total)
        : NaN;
    if (Number.isFinite(pageTotal)) {
      setTotal(pageTotal);
      setHasMore(items.length < pageTotal);
    } else {
      setTotal(items.length);
      setHasMore(items.length >= DETAIL_PAGE_SIZE);
    }

    const totals: Record<string, number> = {};
    const sc =
      results[1].status === 'fulfilled'
        ? ((results[1].value?.data as { stage_counts?: Record<string, number> } | undefined)
            ?.stage_counts ?? {})
        : {};
    CRM_STAGE_KEYS.forEach((key) => {
      totals[key] = typeof sc[key] === 'number' ? Number(sc[key]) : 0;
    });
    setStageTotals(totals);
    // 统计口径以服务端 total 为准（首查不带 stage，覆盖全部阶段），
    // 不再用首页条数推算，避免 mine 收窄/分页截断后统计偏小。
    const serverTotal =
      results[0].status === 'fulfilled'
        ? Number((results[0].value?.data as { total?: number } | undefined)?.total)
        : NaN;
    setTotalCustomers(
      Number.isFinite(serverTotal) && serverTotal >= 0
        ? serverTotal
        : Object.values(totals).reduce((a, b) => a + b, 0),
    );

    const dirIndex = 2;
    if (results[dirIndex].status === 'fulfilled') {
      const dir = results[dirIndex].value.data as { items?: { id: string; full_name?: string }[] };
      setNameMap(
        (dir?.items ?? []).reduce<Record<string, string>>((acc, e) => {
          if (e.full_name) acc[e.id] = e.full_name;
          return acc;
        }, {}),
      );
    }
  }, [stage, mine, keyword]);

  /** 加载下一页并追加到列表尾部（筛选/搜索口径与首页保持一致）。 */
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const params: Record<string, unknown> = {
        page: nextPage,
        page_size: DETAIL_PAGE_SIZE,
      };
      if (stage) params.stage = stage;
      if (keyword) params.keyword = keyword;
      if (mine) {
        params.mine = true;
        if (myEmployeeId) params.assigned_to = myEmployeeId;
      }
      const res: any = await leadsApi.list(params);
      const payload = res?.data ?? {};
      const items: Lead[] = Array.isArray(payload) ? payload : (payload.items ?? []);
      // 按 id 去重：服务端分页期间若有新增记录，简单追加会出现重复 key
      setLeads((prev) => {
        const seen = new Set(prev.map((l) => l.id));
        return [...prev, ...items.filter((l) => !seen.has(l.id))];
      });
      setPage(nextPage);
      const serverTotal = Number(payload.total);
      if (Number.isFinite(serverTotal)) {
        setTotal(serverTotal);
        setHasMore(nextPage * DETAIL_PAGE_SIZE < serverTotal);
      } else {
        setHasMore(items.length >= DETAIL_PAGE_SIZE);
      }
    } catch {
      setLoadError(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [page, hasMore, stage, keyword, mine, myEmployeeId]);

  return {
    leads,
    stageTotals,
    totalCustomers,
    monthNew,
    nameMap,
    myEmployeeId,
    page,
    total,
    hasMore,
    loadingMore,
    load,
    loadMore,
    loadError,
  };
}
