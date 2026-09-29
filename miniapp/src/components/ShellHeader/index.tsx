/**
 * 贝壳风顶部标题栏（供自绘 header 的详情/子页面复用）。
 *
 * 微信原生导航栏无法在右侧追加自定义「返回主页」图标，因此详情/子页面用本组件
 * 自绘顶部栏：`[返回‹] [居中标题] [返回主页⌂]`。页面需配 `navigationStyle: custom`。
 *
 * - 返回：栈里有上一页则 `navigateBack`，否则回退到主页。
 * - 返回主页：跳回当前角色首页（无原生 tabBar，沿用 BottomNav 的 redirectTo 语义）。
 */
import { useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { iconStyle } from '@/utils/icons'
import { useI18n } from '@/i18n'
import './index.scss'

interface Props {
  /** 居中标题（调用方已走 i18n）；为空则不显示 */
  title?: string
  /** 返回按钮（默认显示） */
  showBack?: boolean
  /** 返回主页按钮（默认显示） */
  showHome?: boolean
  /** 覆盖返回主页目标；缺省按 BottomNav 角色表解析为首屏 home */
  homePath?: string
}

/** BottomNav 的四类角色首页（redirectTo 语义，见 components/BottomNav） */
const ROLE_HOME: Record<string, string> = {
  admin: '/pages/admin/home/index',
  employee: '/pages/employee/home/index',
  owner: '/pages/owner/home/index',
  tenant: '/pages/tenant/home/index',
  guest: '/pages/index/index',
}

export default function ShellHeader({ title, showBack = true, showHome = true, homePath }: Props) {
  const { t } = useI18n()
  const statusBarH = useMemo(() => Taro.getSystemInfoSync().statusBarHeight || 20, [])

  const goHome = () => {
    if (homePath) {
      Taro.redirectTo({ url: homePath })
      return
    }
    const pages = Taro.getCurrentPages()
    if (pages.length > 0) {
      const route = (pages[0] as any)?.route as string | undefined
      if (route) {
        Taro.redirectTo({ url: `/${route}` })
        return
      }
    }
    Taro.redirectTo({ url: ROLE_HOME.guest })
  }

  const goBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) Taro.navigateBack({ delta: 1 })
    else goHome()
  }

  return (
    <View className='shell-header' style={{ paddingTop: `${statusBarH}px` }}>
      {showBack ? (
        <View className='shell-header__btn' hoverClass='shell-header__btn--hover' onClick={goBack}>
          <View className='shell-header__chev' />
        </View>
      ) : (
        <View className='shell-header__spacer' />
      )}
      {title ? <Text className='shell-header__title'>{title}</Text> : <View className='shell-header__spacer--flex' />}
      {showHome ? (
        <View
          className='shell-header__btn shell-header__btn--home'
          hoverClass='shell-header__btn--hover'
          onClick={goHome}
          aria-label={t('common.goHome')}
          style={iconStyle('home', 40)}
        />
      ) : (
        <View className='shell-header__spacer' />
      )}
    </View>
  )
}