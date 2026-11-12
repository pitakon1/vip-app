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
  // 报表聚合（新增「终止类」）；失败单独标记，不隐藏为「暂无数据」，也不影响列表
  const [stats, setStats] = useState<ContractStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)

  // 统计接口独立加载：失败置错误态（可重试），与「确实没有数据」区分
  const loadStats = async () => {
    setStatsLoading(true)
    setStatsError(null)
    try {
      const res = await contractsApi.stats()
      setStats(res.data || null)
    } catch {
      setStats(null)
      setStatsError(t('contracts.statsLoadFailed'))
    } finally {
      setStatsLoading(false)
    }
  }

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
    await loadStats()
  }
  useEffect(() => { void loadList() }, [])

  // 加载可用模板列表；失败时静默回退到内置三端默认项
  useEffect(() => {
    contractsApi
      .listTemplates()
      .then((res) => setTemplates(Array.isArray(res.data) ? res.data : null))
      .catch(() => setTemplates(null))
  }, [])

  return {
    contracts,
    contractsLoading,
    contractsError,
    templates,
    stats,
    statsLoading,
    statsError,
    loadList,
    loadStats,
  }
}

export type ContractListState = ReturnType<typeof useContractList>
