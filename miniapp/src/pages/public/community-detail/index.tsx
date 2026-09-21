/**
 * 小区（楼盘）详情（匿名可看）。
 *
 * 承载楼盘字典的完整对外参数（户数/栋数/楼层/车位/管理费/竣工年份/开发商/产权/
 * 外国人配额），并挂出该小区在租在售房源——字典存了不展示等于没存。
 *
 * 泰国特有的「外国人配额」在这里必须展示：它直接决定一套房外国人能不能买、
 * 以什么形式持有（公寓永久产权受 49% 配额限制，土地/别墅只能拿租赁权）。
 */
import { useEffect, useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { publicApi, type PublicProjectDetail } from '@/services/publicApi'
import { convertFromThb, loadRates, tenureLabel } from '@/lib/publicSite'
import { fmtMoney } from '@/utils/format'
import PublicListingItem from '@/components/PublicListingItem'
import './index.scss'

/** 空值不渲染该行；数字转字符串。 */
const num = (value?: number | null) => (value != null ? String(value) : '')

export default function PublicCommunityDetailPage() {
  const router = useRouter()
  const id = router.params?.id ?? ''
  const [project, setProject] = useState<PublicProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRates()
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    publicApi
      .project(id, { listing_limit: 30 })
      .then((res) => {
        if (!cancelled) setProject(res ?? null)
      })
      .catch((err) => {
        console.error('[public project detail] 加载失败', err)
        if (!cancelled) setProject(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <View className='pub-page'>
        <View className='pub-loading'>加载中...</View>
      </View>
    )
  }

  if (!project) {
    return (
      <View className='pub-page'>
        <View className='pub-empty'>小区不存在或已下架</View>
      </View>
    )
  }

  const listings = project.listings ?? []
  const rows: Array<[string, string]> = [
    ['开发商', project.developer_name ?? ''],
    ['总户数', num(project.total_units)],
    ['楼栋数', num(project.total_buildings)],
    ['总层数', num(project.total_floors)],
    ['车位数', num(project.parking_spaces)],
    ['建成年份', num(project.completion_year)],
    [
      '物业费',
      project.management_fee_per_sqm ? `${project.management_fee_per_sqm} THB/㎡` : ''
    ],
    [
      '均价',
      project.avg_price
        ? `${fmtMoney(project.avg_price, 'THB')}/㎡ ≈ ${fmtMoney(
            convertFromThb(project.avg_price),
            'CNY'
          )}`
        : ''
    ],
    ['外国人配额', project.foreign_quota_pct != null ? `${project.foreign_quota_pct}%` : '']
  ]

  return (
    <View className='pub-page'>
      {project.cover ? (
        <Image className='pub-cover' src={project.cover} mode='aspectFill' />
      ) : null}

      <View className='pub-inner'>
        <View className='pub-card'>
          <Text className='pub-card__title'>{project.name}</Text>
          <Text className='pub-card__sub'>
            {[project.address, project.district, project.city].filter(Boolean).join(' · ')}
          </Text>

          <View className='pub-badges'>
            <View className='badge badge--primary'>
              <Text>在售 {project.sale_count ?? 0} 套</Text>
            </View>
            <View className='badge badge--neutral'>
              <Text>在租 {project.rent_count ?? 0} 套</Text>
            </View>
            {project.tenure ? (
              <View className='badge badge--neutral'>
                <Text>{tenureLabel(project.tenure)}</Text>
              </View>
            ) : null}
          </View>

          <View className='pub-kv'>
            {rows
              .filter(([, value]) => !!value)
              .map(([label, value]) => (
                <View className='pub-kv__item' key={label}>
                  <Text className='pub-kv__k'>{label}</Text>
                  <Text className='pub-kv__v'>{value}</Text>
                </View>
              ))}
          </View>
        </View>

        <Text className='pub-section__title'>本小区房源</Text>
        <Text className='pub-section__hint'>该小区当前在租与在售的全部房源。</Text>
        {listings.length === 0 ? (
          <View className='pub-empty'>该小区暂无可租房源</View>
        ) : (
          listings.map((item) => <PublicListingItem key={item.id} item={item} />)
        )}
      </View>
    </View>
  )
}
