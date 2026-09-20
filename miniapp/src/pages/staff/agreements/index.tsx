import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { brokerApi, brokerAgreementApi } from '@/services/api'
import './index.scss'

const unwrap = (d: any): any => d?.data ?? d ?? {}

export default function StaffAgreementsPage() {
  const [brokerId, setBrokerId] = useState('')
  const [listing, setListing] = useState<any>({ contract_id: null, status: 'not_signed', signed: false })
  const [distributor, setDistributor] = useState<any>({ contract_id: null, status: 'not_signed', signed: false })
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const me: any = await brokerApi.me()
      const b = unwrap(me)
      const id = b.id
      setBrokerId(id)
      if (id) {
        const ag: any = await brokerAgreementApi.agreements(id)
        const a = unwrap(ag)
        setDistributor(a.distributor || { contract_id: null, status: 'not_signed', signed: false })
        setListing(a.listing_agent || { contract_id: null, status: 'not_signed', signed: false })
      }
    } catch (e) {
      console.error('[Agreements] 加载协议状态失败', e)
      Taro.showToast({ title: '加载协议状态失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    load()
  })

  // 生成并前往签署《房源经纪人上架房源协议》
  const signListing = async () => {
    if (!brokerId) return
    setBusy(true)
    try {
      const res: any = await brokerAgreementApi.create(brokerId, 'listing_agent')
      const meta = unwrap(res)
      if (meta.contract_id) {
        Taro.navigateTo({ url: `/pages/staff/contract/index?id=${meta.contract_id}` })
      } else {
        Taro.showToast({ title: '未生成合同', icon: 'none' })
      }
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '生成协议失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const viewListing = () => {
    if (listing.contract_id) {
      Taro.navigateTo({ url: `/pages/staff/contract/index?id=${listing.contract_id}` })
    }
  }

  const renderRow = (
    title: string,
    sub: string,
    state: any,
    cta: { label: string; action: () => void; disabled?: boolean }
  ) => {
    const signed = !!state?.signed
    return (
      <View className='ag-card'>
        <View className='ag-card__head'>
          <Text className='ag-card__title'>{title}</Text>
          <View className={`ag-badge ${signed ? 'ag-badge--ok' : state?.status === 'draft' || state?.status === 'pending_sign' ? 'ag-badge--warn' : 'ag-badge--muted'}`}>
            <Text className='ag-badge__text'>{signed ? '已签署' : state?.status === 'not_signed' ? '未签署' : '待签署'}</Text>
          </View>
        </View>
        <Text className='ag-card__sub'>{sub}</Text>
        <View className='ag-card__foot'>
          <View className='ag-doc' onClick={() => signed && state?.contract_id ? viewListing() : undefined}>
            <Text className='ag-doc__text'>{state?.contract_id ? '查看合同' : '未生成'}</Text>
          </View>
          <View
            className={`ag-btn ${cta.disabled ? 'ag-btn--disabled' : signed && state?.contract_id ? 'ag-btn--ghost' : ''}`}
            onClick={() => { if (!cta.disabled && !signed) cta.action() }}
          >
            <Text className='ag-btn__text'>{signed ? (state?.contract_id ? '已签署 ✓' : '已签署') : cta.label}</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='ag-page'>
      <View className='ag-hint'>
        签署《房源经纪人上架房源协议》并激活后，即可作为房源上架经纪人发布房源；未激活时无法上架。
      </View>

      <ScrollView scrollY className='ag-list'>
        {loading ? (
          <View className='ag-state'><Text className='ag-state__text'>加载中...</Text></View>
        ) : (
          <>
            {renderRow('《房源经纪人上架房源协议》', '房源上架经纪人资质 · 签约后激活可发布房源', listing, {
              label: busy ? '生成中...' : '在线签署',
              action: signListing,
              disabled: busy || !!listing?.signed
            })}
            {renderRow('《平台经纪人分销协议》', '分销合作 · 承载联合单分成与渠道合作', distributor, {
              label: '查看',
              action: () => distributor.contract_id && Taro.navigateTo({ url: `/pages/staff/contract/index?id=${distributor.contract_id}` }),
              disabled: !distributor?.contract_id
            })}
          </>
        )}
      </ScrollView>
    </View>
  )
}