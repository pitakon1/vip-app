/** 合同列表：加载 / 下拉刷新 / 失败态。 */
import { useCallback, useEffect, useState } from 'react';
import { contractsApi } from '@/services/api';
import { notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import type { ContractItem } from '../types';

export function useContractsList() {
  const { t } = useI18n();
  const [list, setList] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res: any = await contractsApi.list();
      const data = res?.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setList(Array.isArray(items) ? items : []);
      setError(false);
    } catch (e) {
      setError(true);
      notifyError(t('contract.loadFail'), e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  return { list, loading, refreshing, error, load, refresh };
}
