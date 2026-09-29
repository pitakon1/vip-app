/**
 * 租客 / 业主「我的合同」签署页（只读为主）。
 *
 * 列出当前用户可见的合同（contractsApi.list：本人作为签署方或挂在本人租约下）。
 * 详情页展示签署方；仅当「当前用户是签署方且尚未签署」时显示「签署」按钮。
 * 非本人或已签署只读展示。文本走 i18n 三语。
 */
import { useCallback, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
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

export default function MyContractsPage() {
  const { t } = useI18n()
  const user = useAuthStore((s) => s.user)
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [signing, setSigning] = useState(false)

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
    } catch (error) {
      console.error('[MyContracts] 加载合同失败', error)
      Taro.showToast({ title: t('contract.loadFail'), icon: 'none' })
    } finally {
      setDetailLoading(false)
    }
  }

  // 当前用户对应且未签署的签署方（本人 = party.user_id 命中或 email 命中）
  const myPendingParty = Array.isArray(detail?.parties)
    ? detail.parties.find(
        (p: any) =>
          !p?.signed &&
          (String(p?.user_id ?? '') === String(user?.id ?? '') ||
            String(p?.email ?? '').toLowerCase() === String(user?.email ?? '').toLowerCase())
      )
    : null

  const handleSign = async () => {
    if (!detail?.id || !myPendingParty?.id || signing) return
    setSigning(true)
    try {
      await contractsApi.sign(detail.id, String(myPendingParty?.id))
      Taro.showToast({ title: t('contract.signDone'), icon: 'success' })
      await openDetail(detail.id)
      await load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.signSelf'), icon: 'none' })
    } finally {
      setSigning(false)
    }
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
                      const isSelf =
                        String(p?.user_id ?? '') === String(user?.id ?? '') ||
                        String(p?.email ?? '').toLowerCase() === String(user?.email ?? '').toLowerCase()
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
                          {!!p?.decline_reason ? (
                            <Text className='mc-party__meta'>
                              {t('contract.declineReason')}：{p.decline_reason}
                            </Text>
                          ) : null}
                        </View>
                      )
                    })
                  : <Text className='mc-state__text'>{t('contract.empty')}</Text>}
              </View>

              {!!detail?.content_html && (
                <View className='mc-detail__section'>
                  <Text className='mc-detail__section-title'>{t('contract.content')}</Text>
                  <View className='mc-content'>
                    <View className='mc-content__inner'>
                      <Text userSelect>{String(detail.content_html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')}</Text>
                    </View>
                  </View>
                </View>
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
            className={`mc-sign ${signing ? 'mc-sign--busy' : ''}`}
            onClick={() => {
              if (!myPendingParty || signing) return
              void handleSign()
            }}
          >
            <Text className='mc-sign__text'>
              {myPendingParty
                ? signing
                  ? t('pub.loading')
                  : t('contract.signSelf')
                : detail?.status === 'voided'
                  ? t('contract.status.voided')
                  : t('contract.signed')}
            </Text>
            {(myPendingParty || signing) && (
              <View className='icon-svg' style={{ ...iconStyle('check', 30), marginLeft: '4rpx' }} />
            )}
          </View>
        </View>
      )}
    </View>
  )
}