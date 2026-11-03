import { useTranslation } from 'react-i18next'
import type { SignField } from '../types'

/** 预置签署区：虚线框 + 类型标签，点一下即签在该区（对齐 e签宝/法大大「点签署区即签」） */
const SignFieldBox = ({
  field,
  covered,
  onSign,
}: {
  field: SignField
  covered: boolean
  onSign: (f: SignField) => void
}) => {
  const { t } = useTranslation()
  // 已被落章覆盖（坐标一致）时不再重复显示虚线框
  if (covered) return null
  const type = field.field_type || 'signature'
  return (
    <button
      type="button"
      className="kf-field"
      onClick={() => onSign(field)}
      title={t('contracts.fieldTapToSign')}
      style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.w}%`, height: `${field.h}%` }}
    >
      {t(`contracts.fType_${type}`)}
    </button>
  )
}

export default SignFieldBox
