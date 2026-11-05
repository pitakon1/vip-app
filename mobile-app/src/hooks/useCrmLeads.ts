import { DETAIL_PAGE_SIZE, OPTION_PAGE_SIZE } from '@/lib/pagination';
import { useCallback, useState } from 'react';
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
 */
export function useCrmLeads(stage: string, opts?: { mine?: boolean }) {
  const mine = !!opts?.mine;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [stageTotals, setStageTotals] = useState<Record<string, number>>({});
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [monthNew, setMonthNew] = useState<number | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
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
      leadsApi.list({ page: 1, page_size: DETAIL_PAGE_SIZE, ...(stage ? { stage } : {}), ...scope }),
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

    if (results[1].status === 'fulfilled') {
      setLeads(itemsOf(results[1]) as Lead[]);
    } else {
      setLoadError(true);
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
  }, [stage, mine]);

  return { leads, stageTotals, totalCustomers, monthNew, nameMap, myEmployeeId, load, loadError };
}
