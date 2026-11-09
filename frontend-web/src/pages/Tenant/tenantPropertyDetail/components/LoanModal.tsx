import { useTranslation } from 'react-i18next'
import { InputNumber, Modal } from 'antd'
import { formatMoney } from '@/lib/money'
import type { LoanResult } from '../types'

interface Props {
  open: boolean
  onCancel: () => void
  buyPrice: number
  buyCurrency: string
  loanDownPct: number
  onLoanDownPctChange: (value: number) => void
  loanYears: number
  onLoanYearsChange: (value: number) => void
  loanRate: number | null
  onLoanRateChange: (value: number | null) => void
  buyDown: number
  buyLoanAmount: number
  loanResult: LoanResult | null
}

/** 贷款试算弹窗（无 Form，保持原 destroyOnHidden 行为） */
const LoanModal = ({
  open,
  onCancel,
  buyPrice,
  buyCurrency,
  loanDownPct,
  onLoanDownPctChange,
  loanYears,
  onLoanYearsChange,
  loanRate,
  onLoanRateChange,
  buyDown,
  buyLoanAmount,
  loanResult,
}: Props) => {
  const { t } = useTranslation()

  return (
    <Modal
      title={t('tenantPropertyDetail.loanModalTitle')}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
            {t('tenantPropertyDetail.loanTotal')}
          </div>
          <div style={{ fontWeight: 600, color: 'var(--rent-ink)' }}>
            {formatMoney(buyPrice, buyCurrency)}
          </div>
        </div>
        <div>
          <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
            {t('tenantPropertyDetail.loanDownPct')}
          </div>
          <InputNumber
            min={0}
            max={100}
            style={{ width: '100%' }}
            value={loanDownPct}
            onChange={(v) => onLoanDownPctChange(Number(v ?? 0))}
          />
        </div>
        <div>
          <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
            {t('tenantPropertyDetail.loanYears')}
          </div>
          <InputNumber
            min={1}
            max={40}
            style={{ width: '100%' }}
            value={loanYears}
            onChange={(v) => onLoanYearsChange(Number(v ?? 0))}
          />
        </div>
        <div>
          <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
            {t('tenantPropertyDetail.loanRate')}
          </div>
          <InputNumber
            min={0}
            max={30}
            step={0.1}
            style={{ width: '100%' }}
            value={loanRate ?? undefined}
            onChange={(v) => onLoanRateChange(v === null || v === undefined ? null : Number(v))}
            placeholder={t('tenantPropertyDetail.loanRatePlaceholder')}
          />
        </div>
        <div className="rent-v17-loan" style={{ marginTop: 0 }}>
          <span className="rent-v17-loan__item">
            {t('tenantPropertyDetail.downPaymentAmount')} <b>{formatMoney(buyDown, buyCurrency)}</b>
          </span>
          <span className="rent-v17-loan__sep">·</span>
          <span className="rent-v17-loan__item">
            {t('tenantPropertyDetail.loan')} <b>{formatMoney(buyLoanAmount, buyCurrency)}</b>
          </span>
          <span className="rent-v17-loan__sep">·</span>
          <span className="rent-v17-loan__item">
            {t('tenantPropertyDetail.monthlyPayment')}{' '}
            <b>
              {loanResult?.monthly
                ? `${formatMoney(loanResult.monthly, buyCurrency)}${t('tenantPropertyDetail.perMonth')}`
                : t('tenantPropertyDetail.waitRate')}
            </b>
          </span>
        </div>
      </div>
    </Modal>
  )
}

export default LoanModal
