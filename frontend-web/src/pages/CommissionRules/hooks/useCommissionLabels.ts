import { useTranslation } from 'react-i18next'
import useAuthStore from '@/stores/auth'
import type { DealType, Scope } from '../types'

/** 角色与文案：平台管理员可选全部层级；分销商管理员（agent/employee 绑定渠道）
 *  仅本渠道 + 本渠道员工（后端已按角色鉴权） */
export function useCommissionLabels() {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  const isAdmin = user?.role === 'admin'

  const dealTypeText: Record<DealType, string> = {
    new_rental: t('commissionRules.dealType.new_rental'),
    renewal: t('commissionRules.dealType.renewal'),
    management: t('commissionRules.dealType.management'),
  }
  const scopeText: Record<Scope, string> = {
    all_employees: t('commissionRules.scope.all_employees'),
    by_department: t('commissionRules.scope.by_department'),
    by_employee: t('commissionRules.scope.by_employee'),
    by_broker: t('commissionRules.scope.by_broker'),
  }
  const scopeOptions: { value: string; label: string }[] = [
    { value: 'all_employees', label: t('commissionRules.scopeOption.all_employees') },
    { value: 'by_department', label: t('commissionRules.scopeOption.by_department') },
    { value: 'by_employee', label: t('commissionRules.scopeOption.by_employee') },
    { value: 'by_broker', label: t('commissionRules.scopeOption.by_broker') },
    { value: 'broker_employee', label: t('commissionRules.scopeOption.broker_employee') },
  ]
  const brokerScopeOptions: { value: string; label: string }[] = [
    { value: 'by_broker', label: t('commissionRules.brokerScopeOption.by_broker') },
    { value: 'by_employee', label: t('commissionRules.brokerScopeOption.by_employee') },
  ]

  return { isAdmin, dealTypeText, scopeText, scopeOptions, brokerScopeOptions }
}
