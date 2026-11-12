/**
 * 合同列表与模板列表的数据状态。
 * 纯结构拆分自 pages/Contracts/index.tsx，请求与失败回退逻辑保持不变。
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { contractsApi } from '@/services/api'
import type { Contract, ContractStats, TemplateOption } from '../contractTypes'

export function useContractList() {
  const { t } = useTranslation()

  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractsLoading, setContractsLoading] = useState(false)
  const [contractsError, setContractsError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null)
  // 报表聚合（新增「终止类」）；失败时静默隐藏统计条，不影响列表
  const [stats, setStats] = useState<ContractStats | null>(null)

  const loadList = async () => {
    setContractsLoading(true)
    setContractsError(null)
    try {
      const res = await contractsApi.list()
      setContracts(res.data || [])
    } catch {
      setContractsError(t('common.loadFailed'))
    } finally {
      setContractsLoading(false)
    }
    try {
      const res = await contractsApi.stats()
      setStats(res.data || null)
    } catch {
      setStats(null)
    }
  }
  useEffect(() => { void loadList() }, [])

  // 加载可用模板列表；失败时静默回退到内置三端默认项
  useEffect(() => {
    contractsApi
      .listTemplates()
      .then((res) => setTemplates(Array.isArray(res.data) ? res.data : null))
      .catch(() => setTemplates(null))
  }, [])

  return { contracts, contractsLoading, contractsError, templates, stats, loadList }
}

export type ContractListState = ReturnType<typeof useContractList>
