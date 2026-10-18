/**
 * 关于我们 —— 小程序「我的 - 关于我们 / 版权信息」入口的详情页（对齐贝壳）。
 *
 * 展示：应用图标 + 名称 + 标语 → 官方网址 / 客服电话 / 版本号 → 页脚版权与注册号。
 * 全部字段取自公开接口 GET /company/info 的真实值：取不到就不渲染该项，
 * 不写死演示文案、不编造注册号与版权年份。
 * 小程序无法直接打开外部浏览器：官网链接走「复制到剪贴板 + 提示」，电话走原生拨号。
 */
import { useEffect, useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { companyApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import './index.scss'

interface CompanyInfo {
  name?: string
  version?: string
  phone?: string
  email?: string
  website?: string
  logo_url?: string
  reg_no?: string
  address?: string
}

export default function AboutPage() {
  const [info, setInfo] = useState<CompanyInfo>({})

  useEffect(() => {
    let alive = true
    companyApi
      .info()
      .then((res: any) => {
        const d = res?.data ?? res
        if (!alive || !d) return
        setInfo(d)
      })
      .catch(() => {
        /* 读取失败：相关行不渲染，不伪造内容 */
      })
    return () => {
      alive = false
    }
  }, [])

  const website = (info.website || '').trim()
  const phone = (info.phone || '').trim()
  const canCall = phone.replace(/\D/g, '').length > 0
  const year = new Date().getFullYear()

  /** 小程序无打开外链能力：复制官网地址到剪贴板并提示 */
  const copyWebsite = () => {
    if (!website) return
    Taro.setClipboardData({ data: website })
      .then(() => Taro.showToast({ title: '官网地址已复制，可在浏览器打开', icon: 'none' }))
      .catch(() => undefined)
  }

  const callSupport = () => {
    if (!canCall) {
      Taro.showToast({ title: '客服电话暂未配置', icon: 'none' })
      return
    }
    Taro.makePhoneCall({ phoneNumber: phone.replace(/[^\d+]/g, '') }).catch(() => undefined)
  }

  return (
    <View className='about-page'>
      {/* 品牌区：图标 + 名称 + 标语 */}
      <View className='about-brand'>
        {info.logo_url ? (
          <Image className='about-logo' src={info.logo_url} mode='aspectFill' />
        ) : (
          <View className='about-logo about-logo--fallback'>
            <View className='icon-svg' style={iconStyle('building', 72)} />
          </View>
        )}
        <Text className='about-name'>{info.name || '关于我们'}</Text>
        <Text className='about-slogan'>让租房更简单</Text>
      </View>

      {/* 信息列表：网址 / 电话 / 版本号 */}
      <View className='about-card'>
        {!!website && (
          <View className='about-row' onClick={copyWebsite}>
            <Text className='about-row__label'>官方网址</Text>
            <Text className='about-row__value'>{website.replace(/^https?:\/\//i, '')}</Text>
            <View className='chevron' />
          </View>
        )}
        {canCall && (
          <View className='about-row' onClick={callSupport}>
            <Text className='about-row__label'>客服电话</Text>
            <Text className='about-row__value'>{phone}</Text>
            <View className='chevron' />
          </View>
        )}
        {!!info.version && (
          <View className='about-row'>
            <Text className='about-row__label'>版本号</Text>
            <Text className='about-row__value about-row__value--static'>v{info.version}</Text>
          </View>
        )}
      </View>

      {/* 页脚：版权 + 注册号（后端无值则不渲染，不编造） */}
      {(!!info.name || !!info.reg_no) && (
        <View className='about-footer'>
          {!!info.name && (
            <Text className='about-footer__text'>{`© ${year} ${info.name} · 版权所有`}</Text>
          )}
          {!!info.reg_no && (
            <Text className='about-footer__text'>{`注册号：${info.reg_no}`}</Text>
          )}
        </View>
      )}
    </View>
  )
}
