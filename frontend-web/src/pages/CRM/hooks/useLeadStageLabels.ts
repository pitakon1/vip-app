import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { LeadStatus } from '@/types'
import { LEAD_STAGE_VALUES, STAGE_LABEL_KEYS } from '../constants'

/** 阶段文案与下拉选项：文案随语言变化，需在组件内查表翻译 */
export function useLeadStageLabels() {
  const { t } = useTranslation()
  const stageLabels = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(STAGE_LABEL_KEYS) as LeadStatus[]).map((k) => [k, t(STAGE_LABEL_KEYS[k])]),
      ) as Record<LeadStatus, string>,
    [t],
  )
  const stageOptions = useMemo(
    () => LEAD_STAGE_VALUES.map((value) => ({ value, label: stageLabels[value] })),
    [stageLabels],
  )
  return { stageLabels, stageOptions }
}
