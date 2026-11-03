/**
 * 合同列表与模板列表的数据状态。
 * 纯结构拆分自 pages/Contracts/index.tsx，请求与失败回退逻辑保持不变。
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { contractsApi } from '@/services/api'
import type { Contract, TemplateOption } from '../contractTypes'

export function useContractList() {
  const { t } = useTranslation()

  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractsLoading, setContractsLoading] = useState(false)
  const [contractsError, setContractsError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null)

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
  }
  useEffect(() => { void loadList() }, [])

  // 加载可用模板列表；失败时静默回退到内置三端默认项
  useEffect(() => {
    contractsApi
      .listTemplates()
      .then((res) => setTemplates(Array.isArray(res.data) ? res.data : null))
      .catch(() => setTemplates(null))
  }, [])

  return { contracts, contractsLoading, contractsError, templates, loadList }
}

export type ContractListState = ReturnType<typeof useContractList>
