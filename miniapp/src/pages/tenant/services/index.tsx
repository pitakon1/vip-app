import { useState } from 'react'
import { View, Text, Button, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { serviceOrdersApi } from '@/services/api'
import type { ServiceItem } from '@/types'
import './index.scss'

const PAYMENT_METHODS: Array<{ key: string; label: string }> = [
  { key: 'wechat', label: '微信支付' },
  { key: 'alipay', label: '支付宝' },
  { key: 'bank', label: '银行卡' }
]

const RECOMMEND_SERVICES: ServiceItem[] = [
  { id: 1, name: '房屋保洁服务', description: '专业保洁团队上门服务，2小时深度清洁', price: 199 },
  { id: 2, name: '管道维修服务', description: '专业管道维修，解决漏水、堵塞等问题', price: 150 },
  { id: 3, name: '家电维修服务', description: '各类家电维修，空调、洗衣机、冰箱等', price: 128 },
  { id: 4, name: '宽带办理', description: '高速宽带安装，多种套餐可选', price: 99 },
  { id: 5, name: '家政服务', description: '专业家政，提供做饭、照看等日常服务', price: 300 }
]

export default function TenantServicesPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [services] = useState<ServiceItem[]>(RECOMMEND_SERVICES)
  const [ordering, setOrdering] = useState<number | null>(null)

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
    }
  })

  const handlePay = (service: ServiceItem) => {
    Taro.showActionSheet({
      itemList: PAYMENT_METHODS.map((m) => m.label),
      success: (res) => {
        const method = PAYMENT_METHODS[res.tapIndex]
        createOrder(service, method.key, method.label)
      }
    })
  }

  const createOrder = async (
    service: ServiceItem,
    methodKey: string,
    methodLabel: string
  ) => {
    setOrdering(service.id)
    Taro.showLoading({ title: '下单中...', mask: true })
    try {
      await serviceOrdersApi.create({
        serviceId: service.id,
        serviceName: service.name,
        amount: service.price,
        paymentMethod: methodKey
      })
      Taro.hideLoading()
      Taro.showModal({
        title: '下单成功',
        content: `「${service.name}」下单成功，付款方式：${methodLabel}，金额 ฿${service.price}`,
        showCancel: false
      })
    } catch (error) {
      console.error('[TenantServices] 下单失败', error)
      Taro.hideLoading()
      Taro.showToast({ title: '下单失败，请重试', icon: 'none' })
    } finally {
      setOrdering(null)
    }
  }

  return (
    <View className='tenant-services-page'>
      <View className='page-container'>
        <View className='section-title'>
          <Text>推荐服务</Text>
        </View>

        <View className='pay-tip'>
          <Text className='pay-tip-label'>支持付款方式：</Text>
          <View className='pay-icons'>
            {PAYMENT_METHODS.map((m) => (
              <Text key={m.key} className='pay-icon'>
                {m.icon} {m.label}
              </Text>
            ))}
          </View>
        </View>

        <ScrollView scrollY className='service-list'>
          {services.map((service) => (
            <View key={service.id} className='service-card'>
              <View className='service-info'>
                <Text className='service-name'>{service.name}</Text>
                <Text className='service-desc'>{service.description}</Text>
                <Text className='service-price'>฿{service.price}</Text>
              </View>
              <View className='service-pay'>
                <View className='pay-methods'>
                  {PAYMENT_METHODS.map((m) => (
                    <Text key={m.key} className='pay-tag'>
                      {m.icon}
                    </Text>
                  ))}
                </View>
                <Button
                  className='pay-btn'
                  type='primary'
                  loading={ordering === service.id}
                  disabled={ordering === service.id}
                  onClick={() => handlePay(service)}
                >
                  立即购买
                </Button>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}
