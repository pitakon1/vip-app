/**
 * 合同生成表单状态与生成动作。
 * 纯结构拆分自 pages/Contracts/index.tsx，counters 组装规则保持不变。
 */
import { useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { contractsApi } from '@/services/api'
import { templateKindFields } from '../contractTypes'

export function useContractGeneration({ onGenerated }: { onGenerated: () => void }) {
  const { t } = useTranslation()

  const [kind, setKind] = useState('lease')
  const [language, setLanguage] = useState('zh')
  // 生成表单字段值：key 即后端 counters 字段名
  const [form, setForm] = useState<Record<string, string>>({
    landlord_name: '张三',
    tenant_name: '李四',
    property_address: '曼谷 · Sukhumvit 38 号公寓',
    monthly_rent: '25000',
    term_months: '12',
  })

  const handleGenerate = () => {
    const counters: Record<string, unknown> = { currency: 'THB' }
    for (const f of templateKindFields[kind] || []) {
      const v = form[f.key]
      if (v === '' || v == null) continue
      counters[f.key] = f.type === 'number' ? Number(v) : v
    }
    contractsApi
      .generate({
        language,
        kind,
        counters,
      })
      .then(() => {
        message.success(t('contracts.msgGenerated'))
        onGenerated()
      })
      .catch(() => message.error(t('contracts.errGenerate')))
  }

  return { kind, setKind, language, setLanguage, form, setForm, handleGenerate }
}

export type ContractGenerationState = ReturnType<typeof useContractGeneration>
