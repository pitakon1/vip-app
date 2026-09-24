import { useCallback, useState } from 'react';
import dayjs from 'dayjs';
import api from '@/lib/api';
import { leadsApi } from '@/services/api';

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
 */
export function useCrmLeads(stage: string) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stageTotals, setStageTotals] = useState<Record<string, number>>({});
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [monthNew, setMonthNew] = useState<number | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      leadsApi.list({ page: 1, page_size: 100 }),
      leadsApi.list({ page: 1, page_size: 50, ...(stage ? { stage } : {}) }),
      ...CRM_STAGE_KEYS.map((key) => leadsApi.list({ stage: key, page: 1, page_size: 1 })),
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

    setLeads(itemsOf(results[1]) as Lead[]);

    const totals: Record<string, number> = {};
    CRM_STAGE_KEYS.forEach((key, idx) => {
      const res = results[2 + idx];
      if (res.status === 'fulfilled') {
        const d = res.value?.data as { total?: number } | undefined;
        totals[key] = typeof d?.total === 'number' ? d.total : 0;
      } else {
        totals[key] = 0;
      }
    });
    setStageTotals(totals);
    setTotalCustomers(Object.values(totals).reduce((a, b) => a + b, 0));

    const dirIndex = 2 + CRM_STAGE_KEYS.length;
    if (results[dirIndex].status === 'fulfilled') {
      const dir = results[dirIndex].value.data as { items?: { id: string; full_name?: string }[] };
      setNameMap(
        (dir?.items ?? []).reduce<Record<string, string>>((acc, e) => {
          if (e.full_name) acc[e.id] = e.full_name;
          return acc;
        }, {}),
      );
    }
  }, [stage]);

  return { leads, stageTotals, totalCustomers, monthNew, nameMap, load };
}
