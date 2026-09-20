import { useCallback, useState } from 'react'
import { View, Text, ScrollView, RichText } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { contractsApi } from '@/services/api'
import './index.scss'

const unwrap = (d: any): any => d?.data ?? d ?? {}

export default function StaffContractPage() {
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
        Taro.showToast({ title: '加载合同失败', icon: 'none' })
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
      Taro.showToast({ title: '签署成功', icon: 'success' })
      load()
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '签署失败', icon: 'none' })
    } finally {
      setSigning(false)
    }
  }

  return (
    <View className='ct-page'>
      {loading && !contract ? (
        <View className='ct-state'><Text className='ct-state__text'>加载中...</Text></View>
      ) : (
        <>
          <View className='ct-head'>
            <Text className='ct-head__title'>{contract?.title || '合同'}</Text>
            <View className={`ct-badge ${signed ? 'ct-badge--ok' : 'ct-badge--warn'}`}>
              <Text className='ct-badge__text'>{signed ? '已签署' : '待签署'}</Text>
            </View>
          </View>
          <ScrollView scrollY className='ct-scroll'>
            <View className='ct-content'>
              <RichText nodes={contract?.content_html || ''} />
            </View>
          </ScrollView>
          <View className='ct-footer'>
            <View className={`ct-sign ${signed ? 'ct-sign--done' : ''}`} onClick={handleSign}>
              <Text className='ct-sign__text'>{signed ? '已签署 ✓' : signing ? '签署中...' : '本人签署'}</Text>
            </View>
          </View>
        </>
      )}
    </View>
  )
}