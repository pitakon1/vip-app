import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, RichText, Image, Input } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { contractsApi, signAssetsApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import { useI18n } from '@/i18n'
import ShellHeader from '@/components/ShellHeader'
import './index.scss'

const unwrap = (d: any): any => d?.data ?? d ?? {}

// 页面百分比坐标：非法/越界值回退到默认，防止越界撑爆页图容器（x/y/w/h 均为页面百分比 0-100）
const pct = (v: any, min: number, max: number, def: number) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

export default function StaffContractPage() {
  const { t } = useI18n()
  const router = useRouter()
  const id = router.params?.id || ''
  const [contract, setContract] = useState<any>(null)
  const [loading, setLoading] = useState(!!id)
  const [signing, setSigning] = useState(false)
  // PDF 页图预览：pdf_available 为真时以页图作为签署画布
  const [pdfAvailable, setPdfAvailable] = useState(false)
  const [pdfNumPages, setPdfNumPages] = useState(0)

  // ===== 签署意愿二次验证 =====
  const [intentCode, setIntentCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [codeCooldown, setCodeCooldown] = useState(0)
  const [codeBusy, setCodeBusy] = useState(false)

  // ===== 拒签（经纪人本人） =====
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declineBusy, setDeclineBusy] = useState(false)
  // 签署意愿验证弹层
  const [showVerify, setShowVerify] = useState(false)

  // ===== 签名资产库（经纪人本人可复用） =====
  const [signAssets, setSignAssets] = useState<any[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState('')

  useEffect(() => {
    if (codeCooldown <= 0) return
    const timer = setTimeout(() => setCodeCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [codeCooldown])

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    contractsApi
      .get(id)
      .then((res: any) => {
        const d = unwrap(res)
        setContract({ ...d, content_html: d.content_html || '' })
        setPdfAvailable(!!d?.pdf_available)
        setPdfNumPages(Number(d?.pdf_page_count) || 0)
      })
      .catch((err) => {
        console.error('[Contract] 加载合同失败', err)
        Taro.showToast({ title: t('lease.contractLoadFailed'), icon: 'none' })
      })
      .finally(() => setLoading(false))
  }, [id])

  useDidShow(() => {
    load()
  })

  // 本人作为经纪人签署（role=agent 的签署方）
  const agentParty = Array.isArray(contract?.parties)
    ? contract.parties.find((p: any) => p.role === 'agent')
    : null
  const signed = !!agentParty?.signed

  // 经纪人在本合同上待签署的签署区（法大大风格：按 field 逐项签署）
  const agentFields = Array.isArray(contract?.sign_fields)
    ? contract.sign_fields.filter(
        (f: any) => String(f?.party_id) === String(agentParty?.id) && !f?.signed
      )
    : []
  const targetField = agentFields[0]

  // 加载本人签名资产库（按签署类型过滤）
  const loadSignAssets = useCallback(() => {
    const type = targetField?.field_type === 'signature' ? 'handwrite' : 'seal'
    signAssetsApi
      .list(type)
      .then((res: any) => {
        setSignAssets(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [])
      })
      .catch(() => setSignAssets([]))
  }, [targetField?.field_type])

  useEffect(() => {
    if (!agentParty?.id || !targetField?.id) return
    loadSignAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentParty?.id, targetField?.id])

  // 签署意愿二次验证：给本人（agent party）下发验证码
  const sendIntentCode = async () => {
    if (!id || !agentParty?.id) {
      Taro.showToast({ title: t('contract.partyRequired'), icon: 'none' })
      return
    }
    setCodeBusy(true)
    try {
      await contractsApi.signCode(id, String(agentParty.id))
      setCodeSent(true)
      setCodeCooldown(60)
      Taro.showToast({ title: t('contract.codeSentTo'), icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.getCode'), icon: 'none' })
    } finally {
      setCodeBusy(false)
    }
  }

  // 点击「立即签署」：先进入签署意愿验证弹层（发码 → 输入验证码 → 确认签署）
  const openSignSheets = () => {
    if (!agentParty || signed || !targetField?.id) {
      if (agentParty && !signed && !targetField?.id) {
        Taro.showToast({ title: t('lease.contractFallback'), icon: 'none' })
      }
      return
    }
    resetIntent()
    setShowVerify(true)
  }

  const handleSign = async () => {
    if (!agentParty || signed || signing || !targetField?.id) return
    // 签署意愿二次验证：未带验证码会被后端拒绝（SIGN_INTENT_CODE_REQUIRED）
    if (!intentCode.trim() || !codeSent) {
      Taro.showToast({ title: t('contract.sendCodeFirst'), icon: 'none' })
      return
    }
    setSigning(true)
    try {
      await contractsApi.sign(id, {
        fieldId: String(targetField.id),
        method: String(targetField.field_type || 'signature'),
        code: intentCode.trim(),
        partyId: String(agentParty.id)
      })
      Taro.showToast({ title: t('lease.signSuccess'), icon: 'success' })
      setShowVerify(false)
      load()
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('lease.signFailed'), icon: 'none' })
    } finally {
      setSigning(false)
    }
  }

  const resetIntent = () => {
    setIntentCode('')
    setCodeSent(false)
    setCodeCooldown(0)
  }

  const openDecline = () => {
    setDeclineReason('')
    setShowDecline(true)
  }

  const doDecline = async () => {
    if (!id || !agentParty?.id) {
      Taro.showToast({ title: t('contract.partyRequired'), icon: 'none' })
      return
    }
    if (!declineReason.trim()) {
      Taro.showToast({ title: t('contract.declineReasonRequired'), icon: 'none' })
      return
    }
    setDeclineBusy(true)
    try {
      await contractsApi.decline(id, String(agentParty.id), declineReason.trim())
      Taro.showToast({ title: t('contract.declineDone'), icon: 'none' })
      setShowDecline(false)
      load()
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.decline'), icon: 'none' })
    } finally {
      setDeclineBusy(false)
    }
  }

  return (
    <View className='ct-page'>
      <ShellHeader title={t('nav.contract')} />
      {loading && !contract ? (
        <View className='ct-state'><Text className='ct-state__text'>{t('pub.loading')}</Text></View>
      ) : (
        <>
          <View className='ct-head'>
            <Text className='ct-head__title'>{contract?.title || t('lease.contractFallback')}</Text>
            <View className={`ct-badge ${signed ? 'ct-badge--ok' : 'ct-badge--warn'}`}>
              <Text className='ct-badge__text'>{signed ? t('lease.signed') : t('lease.pendingSign')}</Text>
            </View>
          </View>
          <ScrollView scrollY className='ct-scroll'>
            {/* pdf_available 时用页图作为签署画布，叠加待签署的经纪人群 */}
            {pdfAvailable && pdfNumPages > 0 ? (
              <View className='ct-pages'>
                {Array.from({ length: pdfNumPages }, (_, i) => {
                  const page = i + 1
                  return (
                    <View key={page} className='ct-page-item'>
                      <Text className='ct-page-item__no'>{t('contract.page')} {page}</Text>
                      <View className='ct-page-item__canvas'>
                        <Image className='ct-page-item__img' src={contractsApi.pdfPageUrl(id, page)} mode='widthFix' />
                        {agentFields.map((f: any, idx: number) =>
                          pct(f?.page, 1, pdfNumPages, 1) === page ? (
                            <View
                              key={f?.id ?? idx}
                              className='ct-page-item__field'
                              style={{
                                left: `${pct(f?.x, 0, 100, 8)}%`,
                                top: `${pct(f?.y, 0, 100, 40)}%`,
                                width: `${pct(f?.w, 2, 100, 16)}%`,
                                height: `${pct(f?.h, 1, 100, 5)}%`
                              }}
                            >
                              <Text className='ct-page-item__field-label'>{t('lease.signSelf')}</Text>
                            </View>
                          ) : null
                        )}
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : (
              <View className='ct-content'>
                <RichText nodes={contract?.content_html || ''} />
              </View>
            )}
          </ScrollView>
          <View className='ct-footer'>
            {!signed && agentParty && !agentParty?.declined_at && targetField?.id ? (
              <View className={`ct-footer__decline ${declineBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!declineBusy) openDecline() }}>
                <Text className='ct-footer__decline-text'>{t('contract.decline')}</Text>
              </View>
            ) : null}
            <View className={`ct-sign ${signed ? 'ct-sign--done' : ''}`} onClick={openSignSheets}>
              <Text className='ct-sign__text'>
                {signed ? t('lease.signed') : signing ? t('lease.signing') : t('lease.signSelf')}
              </Text>
              {signed && (
                <View className='icon-svg' style={{ ...iconStyle('check', 30), marginLeft: '8rpx' }} />
              )}
            </View>
          </View>

          {/* ===== 签署意愿验证弹层 ===== */}
          {showVerify && (
            <View className='ct-mask' onClick={() => { if (!signing) setShowVerify(false) }}>
              <View className='ct-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
                <View className='ct-sheet__head'>
                  <Text className='ct-sheet__title'>{t('contract.verifyCode')}</Text>
                  <View className='ct-sheet__close' onClick={() => { if (!signing) setShowVerify(false) }}>
                    <View className='icon-svg' style={iconStyle('close', 30)} />
                  </View>
                </View>
                <Text className='ct-sheet__hint'>{t('contract.verifyDesc')}</Text>

                {/* 签名库复用 */}
                <View className='ct-sheet__block'>
                  <Text className='ct-sheet__hint'>{t('contract.chooseFromLibrary')}</Text>
                  {signAssets.length ? (
                    <View className='ct-asset-row'>
                      {signAssets.map((a: any) => (
                        <Image
                          key={a?.id}
                          className={`ct-asset ${selectedAssetId === String(a?.id) ? 'ct-asset--active' : ''}`}
                          src={a?.data_url}
                          mode='aspectFit'
                          onClick={() => setSelectedAssetId(String(a?.id))}
                        />
                      ))}
                    </View>
                  ) : (
                    <Text className='ct-sheet__hint ct-sheet__hint--muted'>{t('contract.emptyAsset')}</Text>
                  )}
                </View>

                {/* 签署意愿验证码 */}
                <View className='ct-sheet__block'>
                  <Text className='ct-sheet__hint'>{t('contract.verifyCode')}</Text>
                  <View className='ct-verify-row'>
                    <Input
                      className='ct-verify-input'
                      placeholder={t('contract.codePlaceholder')}
                      value={intentCode}
                      onInput={(e: any) => setIntentCode(e.detail.value)}
                    />
                    <View
                      className={`ct-btn ${codeBusy || codeCooldown > 0 ? 'ct-btn--disabled' : ''}`}
                      onClick={() => { if (!codeBusy && codeCooldown <= 0) void sendIntentCode() }}
                    >
                      <Text className='ct-btn__text'>
                        {codeCooldown > 0
                          ? t('contract.codeCooldown', { n: codeCooldown })
                          : (codeSent ? t('contract.resendCode') : t('contract.getCode'))}
                      </Text>
                    </View>
                  </View>
                </View>

                <View className={`ct-sheet__submit ${signing ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!signing) void handleSign() }}>
                  <Text className='ct-sheet__submit-text'>{signing ? t('lease.signing') : t('contract.confirmSign')}</Text>
                </View>
              </View>
            </View>
          )}

          {/* ===== 拒签弹层 ===== */}
          {showDecline && (
            <View className='ct-mask' onClick={() => { if (!declineBusy) setShowDecline(false) }}>
              <View className='ct-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
                <View className='ct-sheet__head'>
                  <Text className='ct-sheet__title'>{t('contract.declineTitle')}</Text>
                  <View className='ct-sheet__close' onClick={() => { if (!declineBusy) setShowDecline(false) }}>
                    <View className='icon-svg' style={iconStyle('close', 30)} />
                  </View>
                </View>
                <Text className='ct-sheet__hint'>{t('contract.declineConfirm')}</Text>
                <View className='ct-sheet__block'>
                  <Input
                    className='ct-verify-input'
                    placeholder={t('contract.declineReasonRequired')}
                    value={declineReason}
                    onInput={(e: any) => setDeclineReason(e.detail.value)}
                  />
                </View>
                <View className={`ct-sheet__submit ${declineBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!declineBusy) void doDecline() }}>
                  <Text className='ct-sheet__submit-text'>{declineBusy ? t('pub.loading') : t('contract.decline')}</Text>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  )
}