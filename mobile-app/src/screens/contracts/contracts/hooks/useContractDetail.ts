/** 合同详情：拉取 / 打开 / 关闭。 */
import { useCallback, useState } from 'react';
import { contractsApi } from '@/services/api';
import { notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';

export function useContractDetail() {
  const { t } = useI18n();
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res: any = await contractsApi.get(id);
      setDetail(res?.data ?? {});
    } catch (e) {
      notifyError(t('contract.loadFail'), e);
    } finally {
      setDetailLoading(false);
    }
  }, [t]);

  const closeDetail = useCallback(() => setDetail(null), []);

  return { detail, detailLoading, openDetail, closeDetail, setDetail };
}
