/**
 * 新房分类页（贝壳式，Web）= 楼盘（项目）视角，数据面是 `/public/projects`。
 *
 * 数据胶囊 5 格、榜单行（= 排序）、楼盘卡（在售徽标 / 建面区间 / 户型 / 成交动态）
 * 全部来自后端实时聚合；dev 库楼盘极少时相应模块留空，不注入占位数据。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ApartmentOutlined,
  BankOutlined,
  CrownOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  ReadOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  UsergroupAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import api from '@/lib/api'
import { useDistricts } from '@/lib/publicDistricts'
import { useLocationStore } from '@/stores/location'
import {
  CapsuleRow,
  CategoryPage,
  EntryGrid,
  PAGE_SIZE,
  type CapsuleItem,
  type CategoryQueryState,
  type GridItem,
} from './CategoryShell'
import { ProjectCard, ProjectRailCard, type PublicProject } from './categoryCards'
import {
  AVG_PRICE_RANGES,
  districtGroup,
  districtOptions,
  notAvailable,
  parseRange,
  projectSortGroup,
  rangeOptions,
  useCategorySummary,
} from './categoryShared'

const ICON_COLOR = (i: number) =>
  ['var(--rent-primary)', 'var(--state-info)', 'var(--state-warning)', 'var(--state-success)', 'var(--state-error)'][i % 5]

export default function NewHouse() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const summary = useCategorySummary(cityKey)
  const [rail, setRail] = useState<PublicProject[]>([])
  // 区域候选：真实「有楼盘的区域」；为空则回退聚合摘要里的区域均价清单
  const districts = useDistricts({ city: cityKey })

  // 「近30天热销」rail：按后端 hot（近30天成交）排序的真实楼盘，空则整块不渲染
  useEffect(() => {
    let alive = true
    api
      .get('/public/projects', { params: { sort: 'hot', page_size: 6 } })
      .then((res) => {
        const payload = res.data?.data ?? res.data
        if (alive) setRail(Array.isArray(payload?.items) ? payload.items : [])
      })
      .catch(() => {
        if (alive) setRail([])
      })
    return () => {
      alive = false
    }
  }, [])

  const capsules: CapsuleItem[] = useMemo(
    () => [
      { key: 'on_sale', value: summary?.on_sale_projects ?? 0, label: t('category.capOnSaleProjects') },
      { key: 'units', value: summary?.sell_count ?? 0, label: t('category.capOnSaleUnits') },
      { key: 'opened', value: summary?.opened_this_month ?? 0, label: t('category.capOpenedThisMonth') },
      { key: 'new7d', value: summary?.new_projects_7d ?? 0, label: t('category.capNewProjects') },
      { key: 'unsold', value: summary?.unsold_projects ?? 0, label: t('category.capUnsoldProjects') },
    ],
    [summary, t],
  )

  const grid: GridItem[] = useMemo(() => {
    const mk = (key: string, label: string, icon: ReactNode): GridItem => ({
      key,
      label,
      icon,
      onPress: () => notAvailable(t, label),
    })
    return [
      mk('brand', t('category.newGridBrand'), <CrownOutlined style={{ color: ICON_COLOR(0) }} />),
      mk('land', t('category.newGridLand'), <EnvironmentOutlined style={{ color: ICON_COLOR(1) }} />),
      mk('broker', t('category.findBroker'), <UsergroupAddOutlined style={{ color: ICON_COLOR(2) }} />),
      mk('ready', t('category.newGridReady'), <HomeOutlined style={{ color: ICON_COLOR(3) }} />),
      mk('small', t('category.newGridSmall'), <ApartmentOutlined style={{ color: ICON_COLOR(4) }} />),
      mk('rank', t('category.newGridRank'), <TrophyOutlined style={{ color: ICON_COLOR(0) }} />),
      mk('vr', t('category.newGridVr'), <BankOutlined style={{ color: ICON_COLOR(1) }} />),
      mk('live', t('category.newGridLive'), <VideoCameraOutlined style={{ color: ICON_COLOR(2) }} />),
      mk('three', t('category.newGridThree'), <ReadOutlined style={{ color: ICON_COLOR(3) }} />),
      mk('subway', t('category.newGridSubway'), <ThunderboltOutlined style={{ color: ICON_COLOR(4) }} />),
    ]
  }, [t])

  const filterGroups = useMemo(
    () => [
      districtGroup(districts.length ? districts : districtOptions(summary), t),
      { key: 'price', label: t('category.filterAvgPrice'), options: rangeOptions(t, AVG_PRICE_RANGES) },
      {
        key: 'more',
        label: t('category.filterMore'),
        children: [
          {
            key: 'sale_status',
            label: t('category.filterSaleStatus'),
            options: [
              { value: 'on_sale', label: t('category.saleOnSale') },
              { value: 'pre_sale', label: t('category.salePreSale') },
              { value: 'sold_out', label: t('category.saleSoldOut') },
            ],
          },
          {
            key: 'has_listings',
            label: t('category.filterHasListings'),
            options: [
              { value: '1', label: t('category.onlyOnSale') },
              { value: '0', label: t('category.onlyUnsold') },
            ],
          },
          {
            key: 'tenure',
            label: t('category.filterTenure'),
            options: [
              { value: 'freehold', label: t('publicSite.tenure.freehold') },
              { value: 'leasehold', label: t('publicSite.tenure.leasehold') },
              { value: 'mixed', label: t('publicSite.tenure.mixed') },
            ],
          },
        ],
      },
      projectSortGroup(t),
    ],
    [summary, districts, t],
  )

  const quickTags = useMemo(
    () => [
      { key: 'all', label: t('category.tagAll'), reset: true },
      { key: 'onsale', label: t('category.onlyOnSale'), group: 'has_listings', value: '1' },
      { key: 'unsold', label: t('category.onlyUnsold'), group: 'has_listings', value: '0' },
    ],
    [t],
  )

  const buildQuery = useCallback((state: CategoryQueryState) => {
    const price = parseRange(state.values.price)
    return {
      city: cityKey,
      q: state.keyword || undefined,
      district: state.values.district || undefined,
      price_min: price.min,
      price_max: price.max,
      sale_status: state.values.sale_status || undefined,
      has_listings:
        state.values.has_listings === '1' ? true : state.values.has_listings === '0' ? false : undefined,
      tenure: state.values.tenure || undefined,
      sort: state.values.sort,
    }
  }, [cityKey])

  const fetchPage = useCallback(async (page: number, query: Record<string, unknown>) => {
    const res = await api.get('/public/projects', { params: { page, page_size: PAGE_SIZE, ...query } })
    const payload = res.data?.data ?? res.data
    const items = Array.isArray(payload?.items) ? payload.items : []
    return { items: items as PublicProject[], total: Number(payload?.total ?? 0) }
  }, [])

  const top = (
    <div>
      {summary ? <CapsuleRow items={capsules} /> : null}
      <EntryGrid items={grid} />
      {rail.length > 0 ? (
        <>
          <h2 className="cat-section-title">{t('category.hotProjects')}</h2>
          <div className="cat-rail">
            {rail.map((it) => (
              <ProjectRailCard key={it.id} item={it} onPress={() => navigate(`/community/${it.id}`)} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )

  return (
    <CategoryPage<PublicProject>
      title={t('category.newTitle')}
      searchPlaceholder={t('category.newSearchPlaceholder')}
      top={top}
      tabs={[
        { key: 'hot', label: t('category.newRankDeal') },
        { key: 'price_asc', label: t('category.newRankPriceLow') },
        { key: 'price_desc', label: t('category.newRankPriceHigh') },
        { key: 'open_date_desc', label: t('category.newRankOpen') },
      ]}
      tabGroup="sort"
      filterGroups={filterGroups}
      quickTags={quickTags}
      buildQuery={buildQuery}
      fetchPage={fetchPage}
      renderCard={(item) => <ProjectCard item={item} onPress={() => navigate(`/community/${item.id}`)} />}
      keyOf={(item) => item.id}
      emptyTitle={t('category.emptyNew')}
      emptySub={t('category.emptySub')}
      layout="project"
    />
  )
}
