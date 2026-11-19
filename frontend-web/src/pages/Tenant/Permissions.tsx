import { useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'

/**
 * 权限设置（/tenant/permissions）
 * C 端「我的 - 设置 - 权限设置」，对齐贝壳权限设置页：逐项列出
 * 相机 / 相册 / 位置 / 麦克风 / 剪贴板 / 蓝牙 / 应用列表 / NFC。
 *
 * 状态来自浏览器 Permissions API 的真实查询结果（granted / denied / prompt）。
 * 浏览器没有对应权限模型或不可查询的项（相册、蓝牙、应用列表、NFC）
 * 显示「当前平台不支持」并置灰，不隐藏整行，也不做本地假开关。
 * 点击可查询的行会用真实 API 触发一次授权请求（getUserMedia / geolocation / clipboard），
 * 请求后立即刷新状态；浏览器不允许网页直接改权限的，再提示到站点设置修改。
 */

type PermStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported'

interface PermItem {
  key: string
  query?: string
}

const ITEMS: PermItem[] = [
  { key: 'camera', query: 'camera' },
  { key: 'photos' },
  { key: 'location', query: 'geolocation' },
  { key: 'microphone', query: 'microphone' },
  { key: 'clipboard', query: 'clipboard-read' },
  { key: 'bluetooth' },
  { key: 'applist' },
  { key: 'nfc' },
]

const queryStatus = async (name: string): Promise<PermStatus> => {
  const permissions = (navigator as any)?.permissions
  if (!permissions?.query) return 'unsupported'
  try {
    const result = await permissions.query({ name })
    if (result.state === 'granted') return 'granted'
    if (result.state === 'denied') return 'denied'
    return 'undetermined'
  } catch {
    return 'unsupported'
  }
}

/** 用真实 Web API 触发一次授权请求，让状态变化可见 */
const requestReal = async (key: string): Promise<boolean> => {
  try {
    if (key === 'camera' || key === 'microphone') {
      const stream = await navigator.mediaDevices.getUserMedia(
        key === 'camera' ? { video: true } : { audio: true },
      )
      stream.getTracks().forEach((track) => track.stop())
      return true
    }
    if (key === 'location') {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(() => resolve(), (err) => reject(err), {
          timeout: 10000,
        })
      })
      return true
    }
    if (key === 'clipboard') {
      await navigator.clipboard.readText()
      return true
    }
  } catch {
    return false
  }
  return false
}

const TenantPermissions = () => {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Record<string, PermStatus>>({})
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const entries = await Promise.all(
      ITEMS.map(async (item) => {
        if (!item.query) return [item.key, 'unsupported'] as const
        return [item.key, await queryStatus(item.query)] as const
      }),
    )
    setStatus(Object.fromEntries(entries))
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const statusText = (s: PermStatus) => {
    if (s === 'granted') return t('tenantPermissions.granted')
    if (s === 'denied') return t('tenantPermissions.denied')
    if (s === 'unsupported') return t('tenantPermissions.unsupported')
    return t('tenantPermissions.undetermined')
  }

  const handlePress = async (item: PermItem) => {
    const s = loading ? 'undetermined' : status[item.key] ?? 'unsupported'
    if (s === 'unsupported') return
    if (!item.query) {
      message.info(t('tenantPermissions.webHint'))
      return
    }
    const ok = await requestReal(item.key)
    if (ok) message.success(t('tenantPermissions.requestOk'))
    else message.warning(t('tenantPermissions.requestFailed'))
    await refresh()
  }

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('tenantPermissions.title')}</h3>
      </div>
      <div className="rent-card__body rent-my__settings">
        {ITEMS.map((item) => {
          const s = loading ? 'undetermined' : status[item.key] ?? 'unsupported'
          const unsupported = s === 'unsupported'
          return (
            <div
              key={item.key}
              className="rent-my__row"
              role={unsupported ? undefined : 'button'}
              tabIndex={unsupported ? undefined : 0}
              style={{
                cursor: unsupported ? 'default' : 'pointer',
                opacity: unsupported ? 0.55 : 1,
              }}
              onClick={() => {
                void handlePress(item)
              }}
              onKeyDown={(e) => {
                if (!unsupported && (e.key === 'Enter' || e.key === ' ')) {
                  void handlePress(item)
                }
              }}
            >
              <span className="rent-text-sm">{t(`tenantPermissions.${item.key}`)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  className="rent-text-sm"
                  style={{
                    color: s === 'granted'
                      ? 'var(--rent-primary)'
                      : s === 'denied'
                        ? 'var(--rent-danger, #dc2626)'
                        : 'var(--rent-ink-3)',
                  }}
                >
                  {loading ? t('common.loading') : statusText(s)}
                </span>
                {!unsupported ? (
                  <span
                    aria-hidden
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 999,
                      background: s === 'granted' ? 'var(--rent-primary)' : 'var(--rent-line)',
                      position: 'relative',
                      flexShrink: 0,
                      display: 'inline-block',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: s === 'granted' ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#fff',
                      }}
                    />
                  </span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
      <div className="rent-card__body" style={{ paddingTop: 0 }}>
        <p className="rent-text-sm rent-text-muted" style={{ margin: 0 }}>
          {t('tenantPermissions.hint')}
        </p>
      </div>
    </div>
  )
}

export default TenantPermissions
