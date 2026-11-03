import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { attendanceApi } from '@/services/api'
import type { MyRule, RuleItem } from '../types'

/** 我的生效考勤规则（后端按「显式成员 → 部门 → 默认组 → 全局配置」解析）。 */
export const useMyRule = () => {
  const { t } = useTranslation()
  const [myRule, setMyRule] = useState<MyRule | null>(null)

  const loadMyRule = useCallback(() => {
    attendanceApi
      .myRule()
      .then((res) => setMyRule(res.data ?? null))
      .catch(() => setMyRule(null))
  }, [])

  useEffect(() => {
    loadMyRule()
  }, [loadMyRule])

  // 我的规则展示项（全部来自后端解析结果，前端不写死作息/半径）
  const ruleItems = useMemo<RuleItem[]>(() => {
    if (!myRule) return []
    return [
      {
        label: t('attendance.ruleGroup'),
        value: myRule.group_name || t('attendance.ruleFallback'),
      },
      {
        label: t('attendance.ruleOffice'),
        value: `${myRule.office_lat ?? '--'}, ${myRule.office_lng ?? '--'}`,
      },
      { label: t('attendance.ruleRadius'), value: `${myRule.radius_km ?? '--'} km` },
      {
        label: t('attendance.ruleShift'),
        value: `${myRule.work_start ?? '--'} - ${myRule.work_end ?? '--'}`,
      },
      {
        label: t('attendance.ruleGrace'),
        value: `${myRule.late_grace_minutes ?? 0} / ${myRule.early_grace_minutes ?? 0} ${t('attendance.unitMin')}`,
      },
      {
        label: t('attendance.ruleTimezone'),
        value: `UTC+${myRule.utc_offset_hours ?? 0}`,
      },
    ]
  }, [myRule, t])

  return { myRule, ruleItems }
}
