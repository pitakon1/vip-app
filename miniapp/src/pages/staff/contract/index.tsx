import { useCallback, useState } from 'react'
import { View, Text, ScrollView, RichText } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { contractsApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import { useI18n } from '@/i18n'
import './index.scss'

const unwrap = (d: any): any => d?.data ?? d ?? {}

export default function StaffContractPage() {
  const { t } = useI18n()
  const router = useRouter()
  const id = router.params?.id || ''
  const [contract, setContract] = useState<any>(null)
  const [loading, setLoading] = useState(!!id)
  const [signing, setSigning] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    contractsApi
      .get(id)
      .then((res: any) => {
        const d = unwrap(res)
        setContract({ ...d, content_html: d.content_html || '' })
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

  const handleSign = async () => {
    if (!agentParty || signed || signing) return
    setSigning(true)
    try {
      await contractsApi.sign(id, agentParty.id)
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
            <View className='ct-content'>
              <RichText nodes={contract?.content_html || ''} />
            </View>
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