import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, Image, Input, Canvas } from '@tarojs/components'
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

const ROLE_META: Record<string, string> = {
  landlord: 'contract.roleLandlord',
  owner: 'contract.roleLandlord',
  tenant: 'contract.roleTenant',
  witness: 'contract.roleWitness',
  agent: 'contract.roleAgent'
}

const FIELD_TYPE_META: Record<string, string> = {
  signature: 'contract.field.signature',
  seal: 'contract.field.seal',
  date: 'contract.field.date'
}

const FIELD_TYPES = ['signature', 'seal', 'date'] as const

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
  const [fieldPage, setFieldPage] = useState(1)

  // ===== 开放签「签署配置栏 + 文档区」 =====
  const [signMode, setSignMode] = useState<'position' | 'keyword'>('position')
  const [signFieldType, setSignFieldType] = useState<string>('signature')
  const [selFieldId, setSelFieldId] = useState('')
  const [kwHits, setKwHits] = useState<any[]>([])
  const [kwHitCount, setKwHitCount] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [kwBusy, setKwBusy] = useState(false)
  const [kwPlacing, setKwPlacing] = useState(false)

  // ===== 签署意愿二次验证 =====
  const [intentCode, setIntentCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [codeCooldown, setCodeCooldown] = useState(0)
  const [codeBusy, setCodeBusy] = useState(false)

  // ===== 拒签（经纪人本人） =====
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declineBusy, setDeclineBusy] = useState(false)

  // ===== 签名资产库（经纪人本人可复用） =====
  const [assets, setAssets] = useState<any[]>([])
  const [showSealMaker, setShowSealMaker] = useState(false)
  const [sealMakerBusy, setSealMakerBusy] = useState(false)
  const [showSigDraw, setShowSigDraw] = useState(false)
  const [assetBusyId, setAssetBusyId] = useState<string | null>(null)

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
    refreshAssets()
  })

  // 本人作为经纪人签署（role=agent 的签署方）
  const agentParty = Array.isArray(contract?.parties)
    ? contract.parties.find((p: any) => p.role === 'agent')
    : null
  const signed = !!agentParty?.signed

  // 经纪人在本合同上待签署的签署区（按 field 逐项签署）
  const agentFields = Array.isArray(contract?.sign_fields)
    ? contract.sign_fields.filter(
        (f: any) => String(f?.party_id) === String(agentParty?.id) && !f?.signed
      )
    : []
  const activeField =
    agentFields.find((f: any) => String(f?.id) === String(selFieldId)) || agentFields[0] || null

  const sealAssets = assets.filter((a: any) => a?.asset_type === 'seal')
  const sigAssets = assets.filter((a: any) => a?.asset_type === 'handwrite')
  const currentSeal = (sealAssets.length ? sealAssets[sealAssets.length - 1] : null) || null
  const currentSig = (sigAssets.length ? sigAssets[sigAssets.length - 1] : null) || null

  const refreshAssets = useCallback(() => {
    signAssetsApi
      .list()
      .then((res: any) => {
        setAssets(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [])
      })
      .catch(() => setAssets([]))
  }, [])

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

  const resetIntent = () => {
    setIntentCode('')
    setCodeSent(false)
    setCodeCooldown(0)
  }

  const handleSign = async () => {
    if (!agentParty || signed || signing || !activeField?.id) return
    if (!intentCode.trim() || !codeSent) {
      Taro.showToast({ title: t('contract.sendCodeFirst'), icon: 'none' })
      return
    }
    setSigning(true)
    try {
      await contractsApi.sign(id, {
        fieldId: String(activeField.id),
        method: String(activeField.field_type || 'signature'),
        code: intentCode.trim(),
        partyId: String(agentParty.id)
      })
      Taro.showToast({ title: t('lease.signSuccess'), icon: 'success' })
      resetIntent()
      load()
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('lease.signFailed'), icon: 'none' })
    } finally {
      setSigning(false)
    }
  }

  // 关键字签署：按命中 index 建字段（经纪人本人落框后再签）
  const doKeywordSearch = async () => {
    if (!id || !keyword.trim()) {
      Taro.showToast({ title: t('contract.searchKeyword'), icon: 'none' })
      return
    }
    setKwBusy(true)
    try {
      const res: any = await contractsApi.keywordSearch(id, keyword.trim())
      const d = unwrap(res)
      const hits: any[] = Array.isArray(d?.hits) ? d.hits : []
      setKwHits(hits)
      setKwHitCount(Number(d?.count) || hits.length)
      if (!hits.length) Taro.showToast({ title: t('contract.noKeywordMatch'), icon: 'none' })
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.searchKeyword'), icon: 'none' })
    } finally {
      setKwBusy(false)
    }
  }

  const placeKeywordField = async (idx: number) => {
    if (!id || !agentParty?.id) {
      Taro.showToast({ title: t('contract.partyRequired'), icon: 'none' })
      return
    }
    setKwPlacing(true)
    try {
      await contractsApi.keywordFields(id, {
        keyword: keyword.trim(),
        party_id: String(agentParty.id),
        field_type: signFieldType,
        index: idx
      })
      Taro.showToast({ title: t('contract.fieldPlaced'), icon: 'success' })
      load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.createField'), icon: 'none' })
    } finally {
      setKwPlacing(false)
    }
  }

  // 拒签
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

  // ===== 签名资产：制作印章 / 手写签名 =====
  const makeSeal = () => {
    Taro.chooseImage({ count: 1, sizeType: ['original'], sourceType: ['album', 'camera'] }).then(async (res) => {
      const path = res?.tempFilePaths?.[0]
      if (!path) return
      setSealMakerBusy(true)
      try {
        const fs: any = Taro.getFileSystemManager()
        const b64 = await new Promise<string>((resolve, reject) =>
          fs.readFile({ filePath: path, encoding: 'base64', success: (r: any) => resolve(r?.data || ''), fail: reject })
        )
        await signAssetsApi.imprint({ name: `seal-${Date.now()}`, image_base64: b64 })
        Taro.showToast({ title: t('contract.imprintDone'), icon: 'success' })
        setShowSealMaker(false)
        await refreshAssets()
      } catch (e: any) {
        Taro.showToast({ title: e?.message || t('contract.imprintStamp'), icon: 'none' })
      } finally {
        setSealMakerBusy(false)
      }
    })
  }

  const sigDrawStart = (e: any) => {
    const ctx = Taro.createCanvasContext('ctSignCanvas')
    ctx.setStrokeStyle('#1f2937')
    ctx.setLineWidth(4)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    const tt = e?.touches?.[0]
    ctx.beginPath()
    ctx.moveTo(tt?.x ?? 0, tt?.y ?? 0)
    ctx.stroke()
    ctx.draw(true)
  }

  const sigDrawMove = (e: any) => {
    const tt = e?.touches?.[0]
    if (!tt) return
    const ctx = Taro.createCanvasContext('ctSignCanvas')
    ctx.setStrokeStyle('#1f2937')
    ctx.setLineWidth(4)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    ctx.lineTo(tt.x, tt.y)
    ctx.stroke()
    ctx.draw(true)
  }

  const clearSigCanvas = () => {
    const ctx = Taro.createCanvasContext('ctSignCanvas')
    ctx.clearRect(0, 0, 2000, 1000)
    ctx.draw()
  }

  const saveSig = () => {
    Taro.canvasToTempFilePath({ canvasId: 'ctSignCanvas' })
      .then((res: any) => {
        const path = res?.tempFilePath
        if (!path) return
        const fs: any = Taro.getFileSystemManager()
        fs.readFile({ filePath: path, encoding: 'base64', success: (fi: any) => {
          const b64 = fi?.data || ''
          signAssetsApi
            .create({ name: `sig-${Date.now()}`, asset_type: 'handwrite', source: 'drew', data_url: `data:image/png;base64,${b64}` })
            .then(() => {
              Taro.showToast({ title: t('contract.assetSaved'), icon: 'success' })
              setShowSigDraw(false)
              refreshAssets()
            })
            .catch((e: any) => Taro.showToast({ title: e?.message || t('contract.saveToLibrary'), icon: 'none' }))
        }, fail: () => {} })
      })
      .catch(() => {})
  }

  const removeAsset = async (aid: string) => {
    setAssetBusyId(aid)
    try {
      await signAssetsApi.remove(aid)
      Taro.showToast({ title: t('contract.assetSaved'), icon: 'success' })
      await refreshAssets()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.removeAsset'), icon: 'none' })
    } finally {
      setAssetBusyId(null)
    }
  }

  const canSign = !signed && !!agentParty && !agentParty?.declined_at && !!activeField?.id

  const docFields = Array.isArray(contract?.sign_fields)
    ? contract.sign_fields.filter((f: any) => pct(f?.page, 1, pdfNumPages, 1) === fieldPage)
    : []

  const selfFieldLabel = (f: any) =>
    f?.signed
      ? t('contract.signed')
      : String(f?.party_id) === String(agentParty?.id)
        ? (String(f?.id) === String(activeField?.id) ? t('contract.signSelf') : t('contract.tapToSign'))
        : '-'

  return (
    <View className='ct-page'>
      <ShellHeader title={t('nav.contract')} />
      {loading && !contract ? (
        <View className='ct-state'><Text className='ct-state__text'>{t('pub.loading')}</Text></View>
      ) : (
        <View className='ct-wrap'>
          <ScrollView scrollY className='ct-scroll'>
            <View className='ct-head'>
              <Text className='ct-head__title'>{contract?.title || t('lease.contractFallback')}</Text>
              <View className={`ct-badge ${signed ? 'ct-badge--ok' : 'ct-badge--warn'}`}>
                <Text className='ct-badge__text'>{signed ? t('lease.signed') : t('lease.pendingSign')}</Text>
              </View>
            </View>

            {/* ===== 签署配置栏（上） ===== */}
            <View className='ct-config'>
              <Text className='ct-config__title'>{t('contract.configTitle')}</Text>

              {/* 1. 签署方列表（当前方高亮）+ 拒签 */}
              <Text className='ct-config__label'>{t('contract.parties')}</Text>
              {(Array.isArray(contract?.parties) ? contract.parties : []).map((p: any, idx: number) => {
                const isAgent = String(p?.id) === String(agentParty?.id)
                const st = p?.signed
                  ? 'ct-badge--ok'
                  : p?.declined_at
                    ? 'ct-badge--err'
                    : 'ct-badge--warn'
                const stt = p?.signed
                  ? t('contract.signed')
                  : p?.declined_at
                    ? t('contract.declined')
                    : t('contract.unsigned')
                return (
                  <View key={p?.id ?? idx} className={`ct-party ${isAgent ? 'ct-party--active' : ''}`}>
                    <View className='ct-party__main'>
                      <Text className='ct-party__name'>{p?.name || t('contract.unknown')}</Text>
                      <Text className='ct-party__role'>
                        {p?.role ? t(ROLE_META[p.role] || 'contract.roleOther') : ''}
                        {isAgent ? ` · ${t('contract.self')}` : ''}
                      </Text>
                    </View>
                    <View className={`ct-badge ${st}`}>
                      <Text className='ct-badge__text'>{stt}</Text>
                    </View>
                  </View>
                )
              })}
              {!signed && agentParty && !agentParty?.declined_at ? (
                <View className='ct-config__row'>
                  <View className={`ct-btn ${declineBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!declineBusy) openDecline() }}>
                    <Text className='ct-btn__text ct-btn__text--danger'>{t('contract.decline')}</Text>
                  </View>
                </View>
              ) : null}

              {/* 2. 签署方式分段切换 */}
              <Text className='ct-config__label'>{t('contract.fieldType')}</Text>
              <View className='ct-seg'>
                <View
                  className={`ct-seg__item ${signMode === 'position' ? 'ct-seg__item--active' : ''}`}
                  onClick={() => { setSignMode('position'); setSelFieldId('') }}
                >
                  <Text className={`ct-seg__text ${signMode === 'position' ? 'ct-seg__text--active' : ''}`}>
                    {t('contract.positionSign')}
                  </Text>
                </View>
                <View
                  className={`ct-seg__item ${signMode === 'keyword' ? 'ct-seg__item--active' : ''}`}
                  onClick={() => { setSignMode('keyword'); setKwHits([]); setKwHitCount(0) }}
                >
                  <Text className={`ct-seg__text ${signMode === 'keyword' ? 'ct-seg__text--active' : ''}`}>
                    {t('contract.keywordSign')}
                  </Text>
                </View>
              </View>

              {/* 3. 印章 / 签名资产块 */}
              <View className='ct-assets'>
                <Text className='ct-config__label'>{t('contract.mySeal')}</Text>
                {currentSeal ? (
                  <View className='ct-asset-line'>
                    <Image className='ct-asset-thumb' src={currentSeal?.data_url} mode='aspectFit' />
                    <Text className='ct-asset-name'>{currentSeal?.name || '-'}</Text>
                    <View className='ct-config__row' style={{ marginLeft: 'auto' }}>
                      <View className='ct-btn' onClick={() => setShowSealMaker(true)}>
                        <Text className='ct-btn__text'>{t('contract.chgAsset')}</Text>
                      </View>
                      <View className={`ct-btn ${assetBusyId === currentSeal?.id ? 'ct-btn--disabled' : ''}`} onClick={() => { if (currentSeal?.id && assetBusyId !== currentSeal?.id) void removeAsset(String(currentSeal.id)) }}>
                        <Text className='ct-btn__text'>{t('contract.removeAsset')}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className='ct-assets__empty'>
                    <Text className='ct-assets__hint'>{t('contract.sealUnmade')}</Text>
                    <View className='ct-btn' onClick={() => setShowSealMaker(true)}>
                      <Text className='ct-btn__text'>{t('contract.makeSeal')}</Text>
                    </View>
                  </View>
                )}

                <Text className='ct-config__label'>{t('contract.mySignature')}</Text>
                {currentSig ? (
                  <View className='ct-asset-line'>
                    <Image className='ct-asset-thumb' src={currentSig?.data_url} mode='aspectFit' />
                    <Text className='ct-asset-name'>{currentSig?.name || '-'}</Text>
                    <View className='ct-config__row' style={{ marginLeft: 'auto' }}>
                      <View className='ct-btn' onClick={() => setShowSigDraw(true)}>
                        <Text className='ct-btn__text'>{t('contract.chgAsset')}</Text>
                      </View>
                      <View className={`ct-btn ${assetBusyId === currentSig?.id ? 'ct-btn--disabled' : ''}`} onClick={() => { if (currentSig?.id && assetBusyId !== currentSig?.id) void removeAsset(String(currentSig.id)) }}>
                        <Text className='ct-btn__text'>{t('contract.removeAsset')}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className='ct-assets__empty'>
                    <Text className='ct-assets__hint'>{t('contract.sealUnmade')}</Text>
                    <View className='ct-btn' onClick={() => setShowSigDraw(true)}>
                      <Text className='ct-btn__text'>{t('contract.drawSignature')}</Text>
                    </View>
                  </View>
                )}
              </View>

              {showSealMaker && (
                <View className='ct-maker'>
                  <Text className='ct-maker__title'>{t('contract.makeSeal')}</Text>
                  <View className='ct-config__row'>
                    <View className={`ct-btn ${sealMakerBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!sealMakerBusy) makeSeal() }}>
                      <Text className='ct-btn__text'>{sealMakerBusy ? t('pub.loading') : t('contract.uploadSeal')}</Text>
                    </View>
                    <View className='ct-btn' onClick={() => setShowSealMaker(false)}>
                      <Text className='ct-btn__text'>{t('common.back')}</Text>
                    </View>
                  </View>
                </View>
              )}

              {showSigDraw && (
                <View className='ct-maker'>
                  <Text className='ct-maker__title'>{t('contract.drawSignature')}</Text>
                  <View className='ct-signbox'>
                    <Canvas
                      canvasId='ctSignCanvas'
                      id='ctSignCanvas'
                      className='ct-signbox__canvas'
                      onTouchStart={sigDrawStart}
                      onTouchMove={sigDrawMove}
                      onTouchEnd={() => {}}
                    />
                  </View>
                  <View className='ct-config__row'>
                    <View className='ct-btn' onClick={clearSigCanvas}>
                      <Text className='ct-btn__text'>{t('contract.clear')}</Text>
                    </View>
                    <View className='ct-btn' onClick={saveSig}>
                      <Text className='ct-btn__text'>{t('contract.saveToLibrary')}</Text>
                    </View>
                    <View className='ct-btn' onClick={() => setShowSigDraw(false)}>
                      <Text className='ct-btn__text'>{t('common.back')}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* 4. 关键字模式 */}
              {signMode === 'keyword' && (
                <View className='ct-kw'>
                  <Text className='ct-config__label'>{t('contract.searchKeyword')}</Text>
                  <View className='ct-config__row'>
                    <Input
                      className='ct-kw__input'
                      value={keyword}
                      placeholder={t('contract.keywordPlaceholder')}
                      onInput={(e: any) => setKeyword(e.detail.value)}
                    />
                    <View className={`ct-btn ${kwBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!kwBusy) void doKeywordSearch() }}>
                      <Text className='ct-btn__text'>{t('contract.search')}</Text>
                    </View>
                  </View>
                  {kwHitCount > 0 && <Text className='ct-config__hint'>{t('contract.keywordHit', { n: kwHitCount })}</Text>}
                  {kwHits.map((h: any, idx: number) => (
                    <View key={idx} className='ct-kw__hit'>
                      <Text className='ct-kw__hit-page'>{t('contract.hitOnPage', { page: h?.page ?? 1 })}</Text>
                      <View className={`ct-btn ${kwPlacing ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!kwPlacing) void placeKeywordField(idx) }}>
                        <Text className='ct-btn__text'>{t('contract.createField')}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* 5. 签署意愿验证码 */}
              {canSign && (
                <View className='ct-verify'>
                  <Text className='ct-config__label'>{t('contract.verifyCode')}</Text>
                  <Text className='ct-config__hint'>{t('contract.verifyDesc')}</Text>
                  <View className='ct-config__row'>
                    <Input
                      className='ct-kw__input'
                      placeholder={t('contract.codePlaceholder')}
                      value={intentCode}
                      onInput={(e: any) => setIntentCode(e.detail.value)}
                    />
                    <View className={`ct-btn ${codeBusy || codeCooldown > 0 ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!codeBusy && codeCooldown <= 0) void sendIntentCode() }}>
                      <Text className='ct-btn__text'>
                        {codeCooldown > 0
                          ? t('contract.codeCooldown', { n: codeCooldown })
                          : (codeSent ? t('contract.resendCode') : t('contract.getCode'))}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* ===== 文档区（下） ===== */}
            <View className='ct-doc'>
              <View className='ct-doc__head'>
                <Text className='ct-doc__title'>{t('contract.docArea')}</Text>
                {pdfNumPages > 1 && (
                  <View className='ct-config__row'>
                    <View className={`ct-btn ${fieldPage <= 1 ? 'ct-btn--disabled' : ''}`} onClick={() => { if (fieldPage > 1) setFieldPage((p) => p - 1) }}>
                      <Text className='ct-btn__text'>{t('contract.prevPage')}</Text>
                    </View>
                    <View className={`ct-btn ${fieldPage >= pdfNumPages ? 'ct-btn--disabled' : ''}`} onClick={() => { if (fieldPage < pdfNumPages) setFieldPage((p) => p + 1) }}>
                      <Text className='ct-btn__text'>{t('contract.nextPage')}</Text>
                    </View>
                  </View>
                )}
              </View>
              {pdfAvailable && pdfNumPages > 0 ? (
                <View className='ct-doc__canvas'>
                  <Image className='ct-doc__img' src={contractsApi.pdfPageUrl(id, fieldPage)} mode='widthFix' />
                  {docFields.map((f: any, idx: number) => (
                    <View
                      key={f?.id ?? idx}
                      className={`ct-doc__field ${String(f?.party_id) === String(agentParty?.id) && !f?.signed ? 'ct-doc__field--mine' : ''} ${String(f?.id) === String(activeField?.id) ? 'ct-doc__field--active' : ''}`}
                      style={{
                        left: `${pct(f?.x, 0, 100, 8)}%`,
                        top: `${pct(f?.y, 0, 100, 40)}%`,
                        width: `${pct(f?.w, 2, 100, 16)}%`,
                        height: `${pct(f?.h, 1, 100, 5)}%`
                      }}
                      onClick={() => {
                        if (String(f?.party_id) === String(agentParty?.id) && !f?.signed) {
                          setSelFieldId(String(f?.id))
                          setSignMode('position')
                        }
                      }}
                    >
                      <Text className='ct-doc__field-label'>{selfFieldLabel(f)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View className='ct-doc__text'>
                  <Text userSelect>{(contract?.content_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* ===== 底部主按钮 ===== */}
          <View className='ct-footer'>
            <View className={`ct-sign ${signed ? 'ct-sign--done' : ''} ${!canSign ? 'ct-sign--disabled' : ''}`} onClick={ () => {
              if (signed) return
              if (canSign) void handleSign()
            } }>
              <Text className='ct-sign__text'>
                {signed ? t('lease.signed') : signing ? t('lease.signing') : t('lease.signSelf')}
              </Text>
              {signed && (
                <View className='icon-svg' style={{ ...iconStyle('check', 30), marginLeft: '8rpx' }} />
              )}
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
    </View>
  )
}