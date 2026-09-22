/**
 * 列表级区域筛选（Web）。
 *
 * 三级级联：国家 → 城市 → 区。只影响当前列表的查询参数 region / city / district，
 * 不是账号级定位器。每次只显示当前层级的选项，选完上级才显示下级；每级均含「全部」。
 * 数据源：复用三端共享的静态 AREA_GROUPS（国家 → 城市 → 城区），作为后端区域数据的
 * 只读本地镜像，组件挂载即加载并常驻缓存。
 */
import { useLayoutEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, Button } from 'antd'
import { DownOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { AREA_GROUPS } from '@/data/locationArea'

export interface RegionSelection {
  /** 国家（country） */
  region?: string
  /** 城市（cityLabel） */
  city?: string
  /** 区（district label） */
  district?: string
}

interface Props {
  value?: RegionSelection | null
  onChange: (sel: RegionSelection | null) => void
}

const itemStyle = (active: boolean): CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '7px 10px',
  fontSize: 13,
  lineHeight: '18px',
  borderRadius: 'var(--rent-radius-md)',
  cursor: 'pointer',
  border: 'none',
  background: active ? 'rgba(var(--rent-primary-rgb), 0.12)' : 'transparent',
  color: active ? 'var(--rent-primary)' : 'var(--rent-ink)',
})

const RegionPicker = ({ value, onChange }: Props) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0) // 0 国家 / 1 城市 / 2 区
  const [country, setCountry] = useState<string | undefined>(value?.region)
  const [cityLabel, setCityLabel] = useState<string | undefined>(value?.city)

  useLayoutEffect(() => {
    if (!open) return
    setCountry(value?.region)
    setCityLabel(value?.city)
    setStep(value?.city ? (value?.district ? 2 : 1) : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const countries: string[] = []
  AREA_GROUPS.forEach((g) => {
    if (!countries.includes(g.country)) countries.push(g.country)
  })
  const cities = country ? AREA_GROUPS.filter((g) => g.country === country) : []
  const city = cities.find((g) => g.cityLabel === cityLabel)
  const districts = city?.children ?? []

  const pickCountry = (c: string | undefined) => {
    if (!c) {
      onChange(null)
      setOpen(false)
      return
    }
    setCountry(c)
    setCityLabel(undefined)
    setStep(1)
    onChange({ region: c })
  }

  const pickCity = (label: string | undefined) => {
    if (!label) {
      onChange({ region: country })
      setOpen(false)
      return
    }
    setCityLabel(label)
    setStep(2)
    onChange({ region: country, city: label })
  }

  const pickDistrict = (label: string | undefined) => {
    if (!label) {
      onChange({ region: country, city: cityLabel })
      setOpen(false)
      return
    }
    onChange({ region: country, city: cityLabel, district: label })
    setOpen(false)
  }

  const summary = value
    ? [value.region, value.city, value.district].filter(Boolean).join(' / ')
    : t('regionFilter.allRegions')

  const columns: { title: string; options: string[]; active: (o: string) => boolean; onPick: (o: string | undefined) => void }[] = [
    { title: t('regionFilter.country'), options: countries, active: (o) => o === country, onPick: pickCountry },
    {
      title: t('regionFilter.city'),
      options: cities.map((g) => g.cityLabel),
      active: (o) => o === cityLabel,
      onPick: pickCity,
    },
    {
      title: t('regionFilter.district'),
      options: districts.map((d) => d.label),
      active: (o) => o === value?.district,
      onPick: pickDistrict,
    },
  ]

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) {
          setCountry(value?.region)
          setCityLabel(value?.city)
          setStep(value?.city ? (value?.district ? 2 : 1) : 0)
        }
      }}
      content={
        <div style={{ width: 560, minHeight: 240 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
              paddingBottom: 10,
              borderBottom: '1px solid var(--rent-border)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--rent-ink)' }}>
              {t('regionFilter.title')}
            </span>
            <Button type="link" size="small" onClick={() => pickCountry(undefined)}>
              {t('regionFilter.allRegions')}
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {columns.map((col, idx) => {
              const shown = idx === 0 || (idx === 1 && !!country) || (idx === 2 && !!city)
              return (
                <div key={col.title} style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--rent-ink-3)',
                      marginBottom: 6,
                      paddingBottom: 4,
                      borderBottom: '1px solid var(--rent-border)',
                    }}
                  >
                    {col.title}
                  </div>
                  {!shown || col.options.length === 0 ? (
                    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--rent-ink-3)' }}>—</span>
                    </div>
                  ) : (
                    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                      <button type="button" style={itemStyle(false)} onClick={() => col.onPick(undefined)}>
                        {t('common.all')}
                      </button>
                      {col.options.map((o) => (
                        <button
                          key={o}
                          type="button"
                          style={itemStyle(col.active(o) && (idx === 0 ? true : step >= idx))}
                          onClick={() => col.onPick(o)}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      }
    >
      <Button size="small" className="rent-btn">
        <EnvironmentOutlined style={{ color: 'var(--rent-primary)' }} />
        {'\u00A0'}
        {summary}
        {'\u00A0'}
        <DownOutlined style={{ fontSize: 11 }} />
      </Button>
    </Popover>
  )
}

export default RegionPicker