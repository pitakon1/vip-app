/**
 * 列表级区域筛选（小程序 / Taro）。
 *
 * 三级级联：国家 → 城市 → 区。只影响当前列表的查询参数 region / city / district，
 * 不是账号级定位器。每次只显示当前层级的选项，选完上级才显示下级；每级均含「全部」。
 * 数据源：复用三端共享的静态 AREA_GROUPS（国家 → 城市 → 城区），作为后端区域数据的
 * 只读本地镜像，组件挂载即加载并常驻缓存。
 */
import { useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import { AREA_GROUPS, type CityGroup } from '@/data/locationArea'
import { useI18n } from '@/i18n'
import { iconStyle } from '@/utils/icons'
import './index.scss'

export interface RegionSelection {
  /** 国家 */
  region?: string
  /** 城市（cityLabel） */
  city?: string
  /** 区 */
  district?: string
}

interface Props {
  value: RegionSelection | null
  onChange: (sel: RegionSelection | null) => void
}

const countriesOf = (): string[] => {
  const seen: string[] = []
  AREA_GROUPS.forEach((g) => {
    if (!seen.includes(g.country)) seen.push(g.country)
  })
  return seen
}

const findCity = (region?: string, city?: string): CityGroup | undefined =>
  region && city
    ? AREA_GROUPS.find((g) => g.country === region && g.cityLabel === city)
    : undefined

const RegionPicker = ({ value, onChange }: Props) => {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [country, setCountry] = useState<string | undefined>(value?.region)
  const [cityLabel, setCityLabel] = useState<string | undefined>(value?.city)

  const countries = useMemo(countriesOf, [])
  const cities = useMemo(
    () => (country ? AREA_GROUPS.filter((g) => g.country === country) : []),
    [country]
  )
  const city = findCity(country, cityLabel)
  const districts = city?.children ?? []

  const openPanel = () => {
    setCountry(value?.region)
    setCityLabel(value?.city)
    setOpen(true)
  }

  const pickCountry = (c?: string) => {
    if (!c) {
      onChange(null)
      setOpen(false)
      return
    }
    setCountry(c)
    setCityLabel(undefined)
    onChange({ region: c })
  }

  const pickCity = (label?: string) => {
    if (!label) {
      onChange({ region: country })
      setOpen(false)
      return
    }
    setCityLabel(label)
    onChange({ region: country, city: label })
  }

  const pickDistrict = (label?: string) => {
    if (!label) {
      onChange({ region: country, city: cityLabel })
      setOpen(false)
      return
    }
    onChange({ region: country, city: cityLabel, district: label })
    setOpen(false)
  }

  const summary = value
    ? [value.region, value.city, value.district].filter(Boolean).join(' · ')
    : t('regionFilter.allRegions')

  return (
    <View>
      <View
        className={`rp-trigger${value ? ' rp-trigger--active' : ''}`}
        onClick={openPanel}
      >
        <Text className='rp-trigger__text'>{summary}</Text>
        <Text className='rp-trigger__caret'>▾</Text>
      </View>

      {open && (
        <View className='rp-mask' onClick={() => setOpen(false)}>
          <View className='rp-sheet' onClick={(e) => e.stopPropagation()}>
            <View className='rp-sheet__head'>
              <Text className='rp-sheet__title'>{t('regionFilter.title')}</Text>
              <View className='rp-sheet__head-right'>
                <Text className='rp-sheet__reset' onClick={() => pickCountry(undefined)}>
                  {t('regionFilter.allRegions')}
                </Text>
                <View className='icon-svg' style={iconStyle('close', 30)} onClick={() => setOpen(false)} />
              </View>
            </View>

            <View className='rp-cols'>
              <Column title={t('regionFilter.country')} options={countries} active={(o) => o === country} disabled={false} onPick={pickCountry} />
              <Column title={t('regionFilter.city')} options={cities.map((g) => g.cityLabel)} active={(o) => o === cityLabel} disabled={!country} onPick={pickCity} />
              <Column title={t('regionFilter.district')} options={districts.map((d) => d.label)} active={(o) => o === value?.district} disabled={!city} onPick={pickDistrict} />
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

function Column({
  title,
  options,
  active,
  disabled,
  onPick
}: {
  title: string
  options: string[]
  active: (o: string) => boolean
  disabled: boolean
  onPick: (o: string | undefined) => void
}) {
  const { t } = useI18n()
  return (
    <View className='rp-col'>
      <Text className='rp-col__title'>{title}</Text>
      {disabled || options.length === 0 ? (
        <View className='rp-col__empty'>
          <Text className='rp-col__empty-text'>—</Text>
        </View>
      ) : (
        <ScrollView scrollY className='rp-col__scroll'>
          <View className='rp-opt rp-opt--all' onClick={() => onPick(undefined)}>
            <Text className='rp-opt__text'>{t('common.all')}</Text>
          </View>
          {options.map((o) => (
            <View
              key={o}
              className={`rp-opt${active(o) ? ' rp-opt--active' : ''}`}
              onClick={() => onPick(o)}
            >
              <Text className={`rp-opt__text${active(o) ? ' rp-opt__text--active' : ''}`}>{o}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

export default RegionPicker