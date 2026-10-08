/**
 * 租客 / 业主「我的合同」签署页（法大大风格：按签署区逐项签署）。
 *
 * 列出当前用户可见的合同（contractsApi.list：本人作为签署方或挂在本人租约下）。
 * 详情展示签署方与签署区（sign_fields）；归属本人生效、且未签署的签署区可点击签署：
 * 手写 → 画布签名；公章 → 加盖公司章；日期 → 自动填写。未实名 party 先弹「需完成身份核验」，
 * 后端 403 REAL_NAME_REQUIRED 亦作同样提示。全部本人签署区完成显示成功。
 * 文本走 i18n 三语。
 */
import { useCallback, useState } from 'react'
import { View, Text, ScrollView, Canvas, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { contractsApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import ShellHeader from '@/components/ShellHeader'
import StateBlock from '@/components/StateBlock'
import useAuthStore from '@/stores/auth'
import { useI18n } from '@/i18n'
import './index.scss'

const unwrap = (d: any): any => d?.data ?? d ?? {}

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 16) : '-')

const today = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 后端 ContractStatus / ContractSource 文案映射（key 需在 i18n 三语有值）
const STATUS_META: Record<string, string> = {
  draft: 'contract.status.draft',
  sent: 'contract.status.sent',
  partially_signed: 'contract.status.partially_signed',
  signed: 'contract.status.signed',
  voided: 'contract.status.voided',
  completed: 'contract.status.completed'
}

const SOURCE_META: Record<string, string> = {
  generated: 'contract.sourceGenerated',
  uploaded: 'contract.sourceUploaded'
}

const ROLE_META: Record<string, string> = {
  landlord: 'contract.roleLandlord',
  owner: 'contract.roleLandlord',
  tenant: 'contract.roleTenant',
  witness: 'contract.roleWitness',
  agent: 'contract.roleAgent'
}

// 签署区类型（法大大风格：手写 / 公章 / 日期）
const FIELD_TYPE_META: Record<string, string> = {
  signature: 'contract.field.signature',
  seal: 'contract.field.seal',
  date: 'contract.field.date'
}

const CANVAS_ID = 'mcSignCanvas'

// 页面百分比坐标：非法/越界值回退到默认，防止越界撑爆页图容器（x/y/w/h 均为页面百分比 0-100）
const pct = (v: any, min: number, max: number, def: number) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

const isRealNameError = (e: any) =>
  typeof e?.message === 'string' && e.message.toUpperCase().includes('REAL_NAME_REQUIRED')

export default function MyContractsPage() {
  const { t } = useI18n()
  const user = useAuthStore((s) => s.user)
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  // 当前正在签署的签署区（null = 弹层关闭）
  const [signTarget, setSignTarget] = useState<any | null>(null)
  const [signing, setSigning] = useState(false)
  // PDF 页图预览：pdf_available 为真时以页图作为签署画布
  const [pdfAvailable, setPdfAvailable] = useState(false)
  const [pdfNumPages, setPdfNumPages] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await contractsApi.list()
      const d = unwrap(res)
      const items: any[] = Array.isArray(d) ? d : d?.items || []
      setList(items)
    } catch (error) {
      console.error('[MyContracts] 获取合同失败', error)
      Taro.showToast({ title: t('contract.loadFail'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [t])

  useDidShow(() => {
    void load()
  })

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res: any = await contractsApi.get(id)
      const d = unwrap(res)
      setDetail({ ...d, content_html: d.content_html || '' })
      setPdfAvailable(!!d?.pdf_available)
      setPdfNumPages(Number(d?.pdf_page_count) || 0)
    } catch (error) {
      console.error('[MyContracts] 加载合同失败', error)
      Taro.showToast({ title: t('contract.loadFail'), icon: 'none' })
    } finally {
      setDetailLoading(false)
    }
  }

  const isSelfParty = (p: any) =>
    String(p?.user_id ?? '') === String(user?.id ?? '') ||
    String(p?.email ?? '').toLowerCase() === String(user?.email ?? '').toLowerCase()

  // 当前用户对应的签署方（可能有多个，取第一个匹配项）
  const myParty = Array.isArray(detail?.parties)
    ? detail.parties.find((p: any) => isSelfParty(p)) || null
    : null

  // 本人生效的签署区
  const myFields = Array.isArray(detail?.sign_fields)
    ? detail.sign_fields.filter((f: any) => String(f?.party_id) === String(myParty?.id))
    : []
  const pendingMyFields = myFields.filter((f: any) => !f?.signed)
  const allMineSigned = myFields.length > 0 && pendingMyFields.length === 0

  const partyName = (partyId?: string) =>
    (Array.isArray(detail?.parties) ? detail.parties.find((p: any) => String(p?.id) === String(partyId)) : null)?.name || t('contract.unknown')

  const onFieldTap = (f: any) => {
    if (!f?.id || f?.signed || signing) return
    // 未实名外部 party：先提示需完成身份核验
    if (!myParty?.real_name_verified) {
      Taro.showToast({ title: t('contract.realNameRequired'), icon: 'none' })
      return
    }
    setSignTarget(f)
  }

  const doSign = async () => {
    if (!detail?.id || !signTarget?.id || signing) return
    const fieldId = String(signTarget.id)
    const method = String(signTarget.field_type || 'signature')
    setSigning(true)
    try {
      await contractsApi.sign(detail.id, { fieldId, method })
      Taro.showToast({ title: t('contract.signDone'), icon: 'success' })
      setSignTarget(null)
      await openDetail(detail.id)
      await load()
    } catch (e: any) {
      if (isRealNameError(e)) {
        Taro.showToast({ title: t('contract.realNameRequired'), icon: 'none' })
      } else {
        Taro.showToast({ title: e?.message || t('contract.signSelf'), icon: 'none' })
      }
    } finally {
      setSigning(false)
    }
  }

  const clearCanvas = () => {
    const ctx = Taro.createCanvasContext(CANVAS_ID)
    ctx.clearRect(0, 0, 9999, 9999)
    ctx.draw()
  }

  const startDraw = (e: any) => {
    const ctx = Taro.createCanvasContext(CANVAS_ID)
    ctx.setStrokeStyle('#1f2937')
    ctx.setLineWidth(4)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    const t = e?.touches?.[0]
    ctx.beginPath()
    ctx.moveTo(t?.x ?? 0, t?.y ?? 0)
    ctx.stroke()
    ctx.draw(true)
  }

  const moveDraw = (e: any) => {
    const t = e?.touches?.[0]
    if (!t) return
    const ctx = Taro.createCanvasContext(CANVAS_ID)
    ctx.setStrokeStyle('#1f2937')
    ctx.setLineWidth(4)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    ctx.lineTo(t.x, t.y)
    ctx.stroke()
    ctx.draw(true)
  }

  return (
    <View className='mc-page'>
      <ShellHeader title={t('contract.my')} />

      {detail ? (
        /* ===== 详情 ===== */
        <ScrollView scrollY className='mc-scroll'>
          {detailLoading && !detail?.parties ? (
            <StateBlock loading text={t('pub.loading')} />
          ) : (
            <View>
              <View className='mc-card'>
                <View className='mc-card__top'>
                  <Text className='mc-card__title'>{detail?.title || t('contract.unknown')}</Text>
                  <Text
                    className={`mc-badge ${
                      detail?.status === 'signed' || detail?.status === 'completed'
                        ? 'mc-badge--success'
                        : detail?.status === 'voided'
                          ? 'mc-badge--error'
                          : 'mc-badge--warning'
                    }`}
                  >
                    {t(STATUS_META[detail?.status || 'draft'])}
                  </Text>
                </View>
                <View className='mc-card__meta'>
                  <Text className='mc-badge mc-badge--primary'>
                    {t(SOURCE_META[detail?.source || ''] || 'contract.sourceGenerated')}
                  </Text>
                </View>
                <View className='mc-card__divider' />
                <View className='mc-card__row'>
                  <Text className='mc-card__row-label'>{t('contract.kind')}</Text>
                  <Text className='mc-card__row-value'>{detail?.kind || '-'}</Text>
                </View>
                <View className='mc-card__row'>
                  <Text className='mc-card__row-label'>{t('contract.created_at')}</Text>
                  <Text className='mc-card__row-value'>{fmtDate(detail?.created_at)}</Text>
                </View>
                {!!detail?.file_path && (
                  <View className='mc-card__row'>
                    <Text className='mc-card__row-label'>{t('contract.upload')}</Text>
                    <Text className='mc-card__row-value' selectable>{detail.file_path}</Text>
                  </View>
                )}
              </View>

              <View className='mc-detail__section'>
                <Text className='mc-detail__section-title'>{t('contract.parties')}</Text>
                {Array.isArray(detail?.parties) && detail.parties.length
                  ? detail.parties.map((p: any, idx: number) => {
                      const isSelf = isSelfParty(p)
                      const statusText = p?.signed
                        ? t('contract.signed')
                        : p?.declined_at
                          ? t('contract.declined')
                          : t('contract.unsigned')
                      const statusCls = p?.signed
                        ? 'mc-badge--success'
                        : p?.declined_at
                          ? 'mc-badge--error'
                          : 'mc-badge--warning'
                      return (
                        <View key={p?.id ?? idx} className='mc-party'>
                          <View className='mc-party__head'>
                            <View className='mc-party__id'>
                              <Text className='mc-party__name'>
                                {p?.name || t('contract.unknown')}
                              </Text>
                              {p?.role ? (
                                <Text className='mc-badge mc-badge--primary'>
                                  {t(ROLE_META[p.role] || 'contract.roleOther')}
                                </Text>
                              ) : null}
                              {isSelf ? (
                                <Text className='mc-party__self'>{t('contract.self')}</Text>
                              ) : null}
                            </View>
                            <Text className={`mc-badge ${statusCls}`}>{statusText}</Text>
                          </View>
                          {!!p?.email ? (
                            <Text className='mc-party__meta'>
                              {t('contract.email')}：{p.email}
                            </Text>
                          ) : null}
                          {!!p?.signed_at ? (
                            <Text className='mc-party__meta'>
                              {t('contract.signedAt')}：{fmtDate(p.signed_at)}
                            </Text>
                          ) : null}
                          {p?.real_name_verified === false && isSelf ? (
                            <Text className='mc-party__meta mc-party__meta--warn'>{t('contract.realNameRequired')}</Text>
                          ) : null}
                        </View>
                      )
                    })
                  : <Text className='mc-state__text'>{t('contract.empty')}</Text>}
              </View>

              {/* ===== 签署区（法大大风格） ===== */}
              <View className='mc-detail__section'>
                <Text className='mc-detail__section-title'>{t('contract.signFields')}</Text>
                {Array.isArray(detail?.sign_fields) && detail.sign_fields.length ? (
                  detail.sign_fields.map((f: any, idx: number) => {
                    const mine = String(f?.party_id) === String(myParty?.id)
                    const clickable = mine && !f?.signed
                    return (
                      <View
                        key={f?.id ?? idx}
                        className={`mc-field ${mine ? 'mc-field--mine' : ''} ${f?.signed ? 'mc-field--done' : ''}`}
                        onClick={() => clickable && onFieldTap(f)}
                      >
                        <View className='mc-field__head'>
                          <View className='mc-field__id'>
                            <Text className='mc-field__type'>{t(FIELD_TYPE_META[f?.field_type] || 'contract.field.signature')}</Text>
                            <Text className='mc-field__party'>{partyName(f?.party_id)}</Text>
                          </View>
                          {f?.signed ? (
                            <Text className='mc-badge mc-badge--success'>{t('contract.signed')}</Text>
                          ) : clickable ? (
                            <Text className='mc-badge mc-badge--warning'>{t('contract.tapToSign')}</Text>
                          ) : (
                            <Text className='mc-badge mc-badge--default'>{t('contract.unsigned')}</Text>
                          )}
                        </View>
                        <Text className='mc-field__meta'>
                          {t('contract.page')} {f?.page ?? 1} · X {f?.x ?? '-'} · Y {f?.y ?? '-'}
                        </Text>
                        {f?.signed && f?.signed_at ? (
                          <Text className='mc-field__meta'>{t('contract.signedAt')}：{fmtDate(f.signed_at)}</Text>
                        ) : null}
                      </View>
                    )
                  })
                ) : (
                  <Text className='mc-state__text'>{t('contract.empty')}</Text>
                )}
              </View>

              {/* ===== PDF 页图签署画布（pdf_available 时优先） ===== */}
              {pdfAvailable && pdfNumPages > 0 ? (
                <View className='mc-detail__section'>
                  <Text className='mc-detail__section-title'>{t('contract.content')}</Text>
                  <View className='mc-pages'>
                    {Array.from({ length: pdfNumPages }, (_, i) => {
                      const page = i + 1
                      const fields = Array.isArray(detail?.sign_fields)
                        ? detail.sign_fields.filter((f: any) => pct(f?.page, 1, pdfNumPages, 1) === page)
                        : []
                      return (
                        <View key={page} className='mc-page-item'>
                          <Text className='mc-page-item__no'>
                            {t('contract.page')} {page}
                          </Text>
                          <View className='mc-page-item__canvas'>
                            <Image
                              className='mc-page-item__img'
                              src={contractsApi.pdfPageUrl(detail.id, page)}
                              mode='widthFix'
                            />
                            {fields.map((f: any, idx: number) => {
                              const mine = String(f?.party_id) === String(myParty?.id)
                              const clickable = mine && !f?.signed
                              return (
                                <View
                                  key={f?.id ?? idx}
                                  className={`mc-page-item__field ${mine ? 'mc-page-item__field--mine' : ''} ${f?.signed ? 'mc-page-item__field--done' : ''}`}
                                  style={{
                                    left: `${pct(f?.x, 0, 100, 8)}%`,
                                    top: `${pct(f?.y, 0, 100, 40)}%`,
                                    width: `${pct(f?.w, 2, 100, 16)}%`,
                                    height: `${pct(f?.h, 1, 100, 5)}%`
                                  }}
                                  onClick={() => clickable && onFieldTap(f)}
                                >
                                  <Text className='mc-page-item__field-label'>
                                    {f?.signed ? t('contract.signed') : mine ? t('contract.tapToSign') : partyName(f?.party_id)}
                                  </Text>
                                </View>
                              )
                            })}
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </View>
              ) : (
                !!detail?.content_html && (
                  <View className='mc-detail__section'>
                    <Text className='mc-detail__section-title'>{t('contract.content')}</Text>
                    <View className='mc-content'>
                      <View className='mc-content__inner'>
                        <Text userSelect>{String(detail.content_html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')}</Text>
                      </View>
                    </View>
                  </View>
                )
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        /* ===== 列表 ===== */
        <View>
          <View className='mc-head'>
            <Text className='mc-head__title'>{t('contract.my')}</Text>
            <Text className='mc-head__desc'>{t('contract.myEmptyHint')}</Text>
          </View>
          {loading ? (
            <StateBlock loading text={t('pub.loading')} />
          ) : list.length === 0 ? (
            <View className='mc-state'>
              <View className='icon-svg' style={iconStyle('doc', 72)} />
              <Text className='mc-state__text'>{t('contract.empty')}</Text>
              <Text className='mc-state__desc'>{t('contract.myEmptyHint')}</Text>
            </View>
          ) : (
            list.map((c: any) => (
              <View key={c.id} className='mc-card' onClick={() => openDetail(c.id)}>
                <View className='mc-card__top'>
                  <Text className='mc-card__title'>{c.title || t('contract.unknown')}</Text>
                  <Text className={`mc-badge ${c.status === 'signed' || c.status === 'completed' ? 'mc-badge--success' : c.status === 'voided' ? 'mc-badge--error' : 'mc-badge--warning'}`}>
                    {t(STATUS_META[c.status || 'draft'])}
                  </Text>
                </View>
                <View className='mc-card__meta'>
                  <Text className='mc-badge mc-badge--primary'>
                    {t(SOURCE_META[c.source || ''] || 'contract.sourceGenerated')}
                  </Text>
                </View>
                <View className='mc-card__divider' />
                <View className='mc-card__row'>
                  <Text className='mc-card__row-label'>{t('contract.created_at')}</Text>
                  <Text className='mc-card__row-value'>{fmtDate(c.created_at)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {detail && (
        <View className='mc-footer'>
          <View
            className={`mc-sign ${allMineSigned ? 'mc-sign--done' : ''}`}
            onClick={() => {
              if (!pendingMyFields.length && !allMineSigned) return
              if (allMineSigned) {
                Taro.showToast({ title: t('contract.completedToast'), icon: 'none' })
              } else {
                Taro.showToast({ title: t('contract.tapToSign'), icon: 'none' })
              }
            }}
          >
            <Text className='mc-sign__text'>
              {allMineSigned
                ? t('contract.completedToast')
                : pendingMyFields.length
                  ? signing
                    ? t('contract.signing')
                    : t('contract.signRegion')
                  : detail?.status === 'voided'
                    ? t('contract.status.voided')
                    : t('contract.unsigned')}
            </Text>
            {allMineSigned && (
              <View className='icon-svg' style={{ ...iconStyle('check', 30), marginLeft: '4rpx' }} />
            )}
          </View>
        </View>
      )}

      {/* ===== 签署弹层 ===== */}
      {signTarget && (
        <View className='mc-mask' onClick={() => { if (!signing) setSignTarget(null) }}>
          <View className='mc-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='mc-sheet__head'>
              <Text className='mc-sheet__title'>
                {t(FIELD_TYPE_META[signTarget?.field_type] || 'contract.field.signature')}
              </Text>
              <View className='mc-sheet__close' onClick={() => { if (!signing) setSignTarget(null) }}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>

            {signTarget?.field_type === 'signature' ? (
              <>
                <View className='mc-canvas-box'>
                  <Canvas
                    canvasId={CANVAS_ID}
                    id={CANVAS_ID}
                    className='mc-canvas'
                    onTouchStart={startDraw}
                    onTouchMove={moveDraw}
                    onTouchEnd={() => {}}
                  />
                </View>
                <View className='mc-sheet__actions'>
                  <View className='mc-btn mc-btn--ghost' onClick={clearCanvas}>
                    <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.clear')}</Text>
                  </View>
                </View>
              </>
            ) : signTarget?.field_type === 'date' ? (
              <View className='mc-seal-wrap'>
                <View className='mc-date-box'>
                  <Text className='mc-date-text'>{today()}</Text>
                </View>
                <Text className='mc-sheet__hint'>{t('contract.autoDate')}</Text>
              </View>
            ) : (
              <View className='mc-seal-wrap'>
                <View className='mc-seal'>
                  <Text className='mc-seal__text'>{partyName(signTarget?.party_id)}</Text>
                  <Text className='mc-seal__sub'>{t('contract.sealSigner')}</Text>
                </View>
              </View>
            )}

            <View className={`mc-sheet__submit ${signing ? 'mc-sheet__submit--busy' : ''}`} onClick={() => { if (!signing) void doSign() }}>
              <Text className='mc-sheet__submit-text'>{signing ? t('contract.signing') : t('contract.confirmSign')}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}