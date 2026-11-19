import { useEffect, useState } from 'react'
import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { useDidShow, useLoad } from '@tarojs/taro'
import { identityApi, IdentityStatus } from '@/services/identityApi'
import { useI18n } from '@/i18n'
import ShellHeader from '@/components/ShellHeader'
import './index.scss'

/**
 * 实名认证（证件上传 + 人工审核过渡方案，不接人脸识别）。
 *
 * 状态回显：none / pending / approved / rejected（驳回带原因并允许重提）。
 * PDPA 同意为提交前置条件；未勾选不发请求，后端也会 400 兜底。
 */

const DOC_TYPES = ['passport', 'national_id', 'driver_license'] as const
const POLICY_VERSION = '2026-11'

export default function TenantIdentityPage() {
  const { t } = useI18n()
  const [status, setStatus] = useState<IdentityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [docType, setDocType] = useState<string>('passport')
  const [realName, setRealName] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [frontPath, setFrontPath] = useState('')
  const [backPath, setBackPath] = useState('')
  const [consent, setConsent] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoadError('')
    try {
      const data = await identityApi.me()
      setStatus(data)
      if (data.real_name) setRealName(data.real_name)
    } catch {
      setLoadError(t('identity.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: t('identity.title') })
    void load()
  })

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('identity.title') })
  })

  useEffect(() => {
    // 语言切换后标题不跟随，这里补一次（与 find-my-home 页同口径）
    Taro.setNavigationBarTitle({ title: t('identity.title') })
  }, [t])

  const pick = async (side: 'front' | 'back') => {
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] })
      const path = res.tempFilePaths?.[0] || ''
      if (!path) return
      if (side === 'front') setFrontPath(path)
      else setBackPath(path)
    } catch {
      /* 用户取消选图：不提示 */
    }
  }

  const submit = async () => {
    if (!realName.trim()) {
      setError(t('identity.realNameRequired'))
      return
    }
    if (!frontPath) {
      setError(t('identity.fileRequired'))
      return
    }
    if (!consent) {
      setError(t('identity.consentRequired'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      let backStored: string | undefined
      if (backPath) {
        const staged = await identityApi.staging(backPath)
        backStored = staged.stored
      }
      const next = await identityApi.submit({
        docType,
        realName: realName.trim(),
        idNumber: idNumber.trim() || undefined,
        consent,
        policyVersion: POLICY_VERSION,
        frontPath,
        backStored
      })
      setStatus(next)
      setFrontPath('')
      setBackPath('')
      setConsent(false)
      Taro.showToast({ title: t('identity.submitted'), icon: 'success' })
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : t('identity.submitError')
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const current = status?.status ?? 'none'
  const canSubmit = current === 'none' || current === 'rejected'

  const statusLabel = (value: string) => {
    if (value === 'pending') return t('identity.status_pending')
    if (value === 'approved') return t('identity.status_approved')
    if (value === 'rejected') return t('identity.status_rejected')
    return t('identity.status_none')
  }

  return (
    <View className='idt'>
      <ShellHeader title={t('identity.title')} />
      <View className='idt__body'>
        {loading ? (
          <View className='idt__card'>
            <Text className='idt__hint'>{t('identity.submitting')}</Text>
          </View>
        ) : (
          <>
            {loadError ? (
              <View className='idt__card'>
                <Text className='idt__error'>{loadError}</Text>
                <View className='idt__btn idt__btn--ghost' onClick={() => void load()}>
                  <Text className='idt__btn-text idt__btn-text--ghost'>{t('common.retry')}</Text>
                </View>
              </View>
            ) : null}

            {status ? (
              <View className='idt__card'>
                <View className={`idt__badge idt__badge--${current}`}>
                  <Text className='idt__badge-text'>{statusLabel(current)}</Text>
                </View>
                <Text className='idt__sub'>{t('identity.sub')}</Text>

                {current === 'pending' ? (
                  <View className='idt__notice idt__notice--pending'>
                    <Text className='idt__notice-title'>{t('identity.pendingTitle')}</Text>
                    <Text className='idt__notice-text'>{t('identity.pendingDesc')}</Text>
                  </View>
                ) : null}

                {current === 'approved' ? (
                  <View className='idt__notice idt__notice--approved'>
                    <Text className='idt__notice-title'>{t('identity.approvedTitle')}</Text>
                    <Text className='idt__notice-text'>
                      {t('identity.approvedDesc', {
                        name: status.real_name || '-',
                        masked: status.id_number_masked || '-'
                      })}
                    </Text>
                  </View>
                ) : null}

                {current === 'rejected' ? (
                  <View className='idt__notice idt__notice--rejected'>
                    <Text className='idt__notice-title'>{t('identity.rejectedTitle')}</Text>
                    <Text className='idt__notice-text'>
                      {status.rejection_reason || t('identity.rejectedNoReason')}
                    </Text>
                    <Text className='idt__notice-text'>{t('identity.reuploadHint')}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {canSubmit ? (
              <View className='idt__card'>
                <Text className='idt__label'>{t('identity.docType')}</Text>
                <View className='idt__chips'>
                  {DOC_TYPES.map((d) => (
                    <View
                      key={d}
                      className={`idt__chip ${docType === d ? 'idt__chip--active' : ''}`}
                      onClick={() => setDocType(d)}
                    >
                      <Text className='idt__chip-text'>{t(`identity.doc_${d}`)}</Text>
                    </View>
                  ))}
                </View>

                <Text className='idt__label'>{t('identity.realName')}</Text>
                <Input
                  className='idt__input'
                  value={realName}
                  onInput={(e) => setRealName(e.detail.value)}
                />

                <Text className='idt__label'>{t('identity.idNumber')}</Text>
                <Input
                  className='idt__input'
                  value={idNumber}
                  onInput={(e) => setIdNumber(e.detail.value)}
                />

                <Text className='idt__label'>{t('identity.front')}</Text>
                <View className='idt__picker' onClick={() => void pick('front')}>
                  {frontPath ? (
                    <Image className='idt__thumb' src={frontPath} mode='aspectFill' />
                  ) : (
                    <Text className='idt__picker-text'>{t('identity.pickImage')}</Text>
                  )}
                </View>

                <Text className='idt__label'>{t('identity.backOptional')}</Text>
                <View className='idt__picker' onClick={() => void pick('back')}>
                  {backPath ? (
                    <Image className='idt__thumb' src={backPath} mode='aspectFill' />
                  ) : (
                    <Text className='idt__picker-text'>{t('identity.pickImage')}</Text>
                  )}
                </View>
                <Text className='idt__hint'>{t('identity.imageHint')}</Text>

                <View className='idt__consent' onClick={() => setConsent((v) => !v)}>
                  <View className={`idt__check ${consent ? 'idt__check--on' : ''}`}>
                    {consent ? <Text className='idt__check-mark'>✓</Text> : null}
                  </View>
                  <Text className='idt__consent-text'>{t('identity.consent')}</Text>
                </View>

                {error ? <Text className='idt__error'>{error}</Text> : null}

                <View
                  className={`idt__btn ${submitting ? 'idt__btn--disabled' : ''}`}
                  onClick={() => {
                    if (!submitting) void submit()
                  }}
                >
                  <Text className='idt__btn-text'>
                    {submitting ? t('identity.submitting') : t('identity.submit')}
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  )
}
