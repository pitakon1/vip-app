import { useCallback, useState } from 'react'
import { View, Text, ScrollView, RichText, Image } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { contractsApi } from '@/services/api'
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

  const handleSign = async () => {
    if (!agentParty || signed || signing || !targetField?.id) {
      if (agentParty && !signed && !targetField?.id) {
        Taro.showToast({ title: t('lease.contractFallback'), icon: 'none' })
      }
      return
    }
    setSigning(true)
    try {
      await contractsApi.sign(id, {
        fieldId: String(targetField.id),
        method: String(targetField.field_type || 'signature')
      })
      Taro.showToast({ title: t('lease.signSuccess'), icon: 'success' })
      load()
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('lease.signFailed'), icon: 'none' })
    } finally {
      setSigning(false)
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
            <View className={`ct-sign ${signed ? 'ct-sign--done' : ''}`} onClick={handleSign}>
              <Text className='ct-sign__text'>
                {signed ? t('lease.signed') : signing ? t('lease.signing') : t('lease.signSelf')}
              </Text>
              {signed && (
                <View className='icon-svg' style={{ ...iconStyle('check', 30), marginLeft: '8rpx' }} />
              )}
            </View>
          </View>
        </>
      )}
    </View>
  )
}