/**
 * 权限设置 —— C 端「我的 - 设置 - 权限设置」（对齐贝壳权限设置页）。
 *
 * 逐项：相机 / 相册 / 位置 / 麦克风 / 剪贴板 / 蓝牙 / 应用列表 / NFC。
 * 状态来自 wx.getSetting 的真实授权结果（true=已授权 / false=未授权 / undefined=未申请），
 * 不做本地假开关；小程序没有授权 scope 的项（剪贴板、蓝牙、应用列表、NFC）
 * 显示「当前平台不支持」并置灰，不隐藏整行。
 * 点击行：
 * - 未申请：Taro.authorize 拉起系统授权弹窗；
 * - 已拒绝 / 已授权：Taro.openSetting 打开小程序权限设置页（可改可撤销），返回后自动刷新。
 */
import { useState } from 'react'
import { View, Text, Switch } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useI18n } from '@/i18n'
import ShellHeader from '@/components/ShellHeader'
import './index.scss'

type PermStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported'

interface PermItem {
  key: string
  scope?: string
}

const ITEMS: PermItem[] = [
  { key: 'camera', scope: 'scope.camera' },
  { key: 'photos', scope: 'scope.album' },
  { key: 'location', scope: 'scope.userLocation' },
  { key: 'microphone', scope: 'scope.record' },
  { key: 'clipboard' },
  { key: 'bluetooth' },
  { key: 'applist' },
  { key: 'nfc' }
]

const toStatus = (raw: unknown): PermStatus => {
  if (raw === true) return 'granted'
  if (raw === false) return 'denied'
  return 'undetermined'
}

export default function PermissionsPage() {
  const { t } = useI18n()
  const [status, setStatus] = useState<Record<string, PermStatus>>({})
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const res = await Taro.getSetting()
      const auth = (res as any)?.authSetting ?? {}
      const next: Record<string, PermStatus> = {}
      ITEMS.forEach((item) => {
        next[item.key] = item.scope ? toStatus(auth[item.scope]) : 'unsupported'
      })
      setStatus(next)
    } catch (err) {
      console.error('[permissions] 读取授权状态失败', err)
      const next: Record<string, PermStatus> = {}
      ITEMS.forEach((item) => {
        next[item.key] = 'unsupported'
      })
      setStatus(next)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    void refresh()
  })

  const showWebHint = () => {
    // H5 预览没有小程序权限模型，明确提示而不是伪造开关
    Taro.showModal({
      title: t('permissions.title'),
      content: t('permissions.webHint'),
      showCancel: false
    })
  }

  /** 已拒绝 / 已授权：打开小程序权限设置页（可修改、可撤销） */
  const openSettings = () => {
    Taro.openSetting({})
      .then(() => refresh())
      .catch(() => {
        Taro.showToast({ title: t('permissions.openFailed'), icon: 'none' })
      })
  }

  /** 未申请：直接拉起系统授权弹窗 */
  const requestPermission = async (scope?: string) => {
    if (!scope) return
    try {
      await Taro.authorize({ scope } as any)
    } catch {
      // 用户点了拒绝，或系统不再弹窗：引导去设置页
      Taro.showToast({ title: t('permissions.requestDenied'), icon: 'none' })
      openSettings()
    } finally {
      void refresh()
    }
  }

  const handlePress = (item: PermItem, s: PermStatus) => {
    if (s === 'unsupported') return
    if (process.env.TARO_ENV === 'h5') {
      showWebHint()
      return
    }
    if (s === 'undetermined') {
      void requestPermission(item.scope)
      return
    }
    openSettings()
  }

  const statusText = (s: PermStatus) => {
    if (s === 'granted') return t('permissions.granted')
    if (s === 'denied') return t('permissions.denied')
    if (s === 'unsupported') return t('permissions.unsupported')
    return t('permissions.undetermined')
  }

  return (
    <View className='permissions-page'>
      <ShellHeader title={t('permissions.title')} />
      <View className='page-container'>
        <View className='panel panel--list'>
          {ITEMS.map((item) => {
            const s = loading ? 'undetermined' : status[item.key] ?? 'unsupported'
            const unsupported = s === 'unsupported'
            return (
              <View
                key={item.key}
                className={`list-row permissions-row${unsupported ? ' permissions-row--disabled' : ''}`}
                onClick={() => handlePress(item, s)}
              >
                <View className='list-row__body'>
                  <Text className='list-row__label'>{t(`permissions.${item.key}`)}</Text>
                </View>
                <Text className={`permissions-row__status permissions-row__status--${s}`}>
                  {loading ? t('common.loading') : statusText(s)}
                </Text>
                {!unsupported ? (
                  <Switch
                    checked={s === 'granted'}
                    disabled
                    color='#14b8a6'
                    className='permissions-row__switch'
                  />
                ) : null}
              </View>
            )
          })}
        </View>
        <Text className='permissions-hint'>{t('permissions.hint')}</Text>
      </View>
    </View>
  )
}
