/**
 * C 端房源列表（匿名可浏览，无需注册）。
 *
 * 数据源是 `/public/listings`（不是站内 `/listings` 或 `/properties`——那两个强制鉴权，
 * 匿名请求直接 401，这就是此前「未登录什么都看不到」的根因）。
 *
 * 两个关键设计：
 * 1. **服务端分页 + 筛选**：不再把全量数据拉到前端过滤。后端 `PaginationParams`
 *    把 `page_size` 顶在 100，前端传 999 会被静默截断，于是总数按 100 条算、
 *    第 100 条之后永远翻不到。
 * 2. **按学校找房是空间筛选**：选一所学校 + 半径，后端用 haversine 算真实距离，
 *    结果按距离由近到远，卡片回显「距 XX 约 N 公里」。不做「学区房」布尔标签——
 *    泰国没有划片入学，国际学校是「付费 + 距离」逻辑。
 *
 * 顶部筛选交互与 App 端（PublicListingsScreen）对齐：单行「学校 / 更多」两个 chip，
 * 点开顶部下拉面板；「学校」选中即生效并按距离排序，「更多」内整理排序 / 价格 /
 * 面积 / 户型，重置 / 应用。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, Image, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  publicApi,
  unwrapPage,
  type PublicListing,
  type PublicSchool
} from '@/services/publicApi'
import { coverOf, listingTypeLabel, loadRates } from '@/lib/publicSite'
import { fmtMoney } from '@/utils/format'
import { useI18n } from '@/i18n'
import BottomNav from '@/components/BottomNav'
import './index.scss'

const PAGE_SIZE = 20
const RADII = [1, 3, 5, 10]
// 排序：默认 4 项；选中学校时额外出现「距离最近」
const SORTS: Array<[string, string]> = [
  ['latest', 'pub.sortLatest'],
  ['price_asc', 'pub.sortPriceAsc'],
  ['price_desc', 'pub.sortPriceDesc'],
  ['area_desc', 'pub.sortAreaDesc']
]
const BEDROOM_OPTIONS: Array<[string, string]> = [
  ['', 'pub.filterAny'],
  ['1', 'pub.bed.1'],
  ['2', 'pub.bed.2'],
  ['3', 'pub.bed.3'],
  ['4', 'pub.bed.4p']
]

type FilterTab = '' | 'school' | 'more'

export default function PublicListingsPage() {
  const { t } = useI18n()
  // ---- 基础筛选 ----
  const [type, setType] = useState('')
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState('latest')

  // ---- 更多：价格 / 面积 / 户型（与 App 一致，直接输最值，无预设）----
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [areaMin, setAreaMin] = useState('')
  const [areaMax, setAreaMax] = useState('')
  const [bedsMin, setBedsMin] = useState('')

  // ---- 学校筛选（空间筛选）----
  const [schoolId, setSchoolId] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolKm, setSchoolKm] = useState(3)
  const [schools, setSchools] = useState<PublicSchool[]>([])
  const [schoolKw, setSchoolKw] = useState('')

  // ---- 下拉面板 ----
  const [openTab, setOpenTab] = useState<FilterTab>('')

  // ---- 列表状态 ----
  const [items, setItems] = useState<PublicListing[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    loadRates()
    // 学校清单只为筛选器备选，取前 100 条即可
    publicApi
      .schools({ page_size: 100 })
      .then((res) => setSchools(unwrapPage<PublicSchool>(res).items))
      .catch(() => setSchools([]))
  }, [])

  // 关键词防抖：输入时不打接口，停 350ms 再查
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 350)
    return () => clearTimeout(timer)
  }, [keyword])

  // ---------- 学校 ----------
  const filteredSchools = schoolKw.trim()
    ? schools.filter((s) =>
        `${s.name ?? ''} ${s.name_en ?? ''} ${s.district ?? ''}`
          .toLowerCase()
          .includes(schoolKw.trim().toLowerCase())
      )
    : schools

  const moreActive = !!(priceMin || priceMax || areaMin || areaMax || bedsMin)

  const resetSchool = () => {
    setSchoolId('')
    setSchoolName('')
    setSchoolKm(3)
  }
  const resetMore = () => {
    setPriceMin('')
    setPriceMax('')
    setAreaMin('')
    setAreaMax('')
    setBedsMin('')
  }

  // 点某所学校：已选则取消，未选则选中；选中后立即生效并按距离排序
  const toggleSchool = (school: PublicSchool) => {
    if (schoolId === school.id) {
      resetSchool()
    } else {
      setSchoolId(school.id)
      setSchoolName(school.name ?? '')
    }
    setOpenTab('')
  }

  // ---------- 请求 ----------
  const fetchPage = useCallback(
    async (targetPage: number) => {
      if (targetPage === 1) setLoading(true)
      else setLoadingMore(true)
      try {
        const res = await publicApi.listings({
          page: targetPage,
          page_size: PAGE_SIZE,
          listing_type: (type || undefined) as 'rent' | 'sell' | undefined,
          q: debounced || undefined,
          // 选了学校时默认按距离排序（学区找房的自然语义）
          sort: (schoolId && sort === 'latest' ? 'distance' : sort) as any,
          price_min: priceMin ? Number(priceMin) : undefined,
          price_max: priceMax ? Number(priceMax) : undefined,
          area_min: areaMin ? Number(areaMin) : undefined,
          area_max: areaMax ? Number(areaMax) : undefined,
          bedrooms_min: bedsMin ? Number(bedsMin) : undefined,
          school_id: schoolId || undefined,
          school_radius_km: schoolId ? schoolKm : undefined
        })
        const pageData = unwrapPage<PublicListing>(res)
        setTotal(pageData.total)
        setPage(targetPage)
        setItems((prev) => (targetPage === 1 ? pageData.items : [...prev, ...pageData.items]))
      } catch (err) {
        console.error('[public listings] 加载失败', err)
        if (targetPage === 1) {
          setItems([])
          setTotal(0)
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [
      type,
      debounced,
      sort,
      priceMin,
      priceMax,
      areaMin,
      areaMax,
      bedsMin,
      schoolId,
      schoolKm
    ]
  )

  // 筛选变化 → 回到第 1 页
  useEffect(() => {
    fetchPage(1)
  }, [fetchPage])

  const loadMore = () => {
    if (loading || loadingMore || items.length >= total) return
    fetchPage(page + 1)
  }

  const openDetail = (id: string) =>
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${id}` })

  return (
    <View className='pub-page'>
      <View className='pub-inner'>
        <View className='pub-head'>
          <Text className='pub-head__title'>{t('pub.listingsTitle')}</Text>
          <Text className='pub-head__hint'>
            {t('pub.listingsHint')}
          </Text>
          <Input
            className='pub-search'
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            placeholder={t('pub.searchPlaceholder')}
            confirmType='search'
          />
        </View>

        {/* 租 / 售 分段 */}
        <View className='pub-segment'>
          {[
            ['', t('pub.typeAll')],
            ['rent', t('pub.typeRent')],
            ['sell', t('pub.typeSell')]
          ].map(([key, label]) => (
            <View
              key={key || 'all'}
              className={`pub-segment__item${type === key ? ' pub-segment__item--on' : ''}`}
              onClick={() => setType(key)}
            >
              <Text>{label}</Text>
            </View>
          ))}
        </View>

        {/* 单行筛选行：学校 / 更多（对齐 App）*/}
        <View className='pub-chips pub-filter__chips'>
          <View
            className={`pub-chip${schoolId ? ' pub-chip--on' : ''}`}
            onClick={() => setOpenTab(openTab === 'school' ? '' : 'school')}
          >
            <Text>
              {schoolId
                ? `${schoolName} · ${t('pub.kmValue', { km: schoolKm })}`
                : t('pub.filterSchool')}
            </Text>
          </View>
          <View
            className={`pub-chip${moreActive ? ' pub-chip--on' : ''}`}
            onClick={() => setOpenTab(openTab === 'more' ? '' : 'more')}
          >
            <Text>{t('pub.filterMore')}</Text>
          </View>
          {schoolId ? (
            <View className='pub-chip pub-chip--ghost' onClick={resetSchool}>
              <Text>{t('pub.schoolAny')}</Text>
            </View>
          ) : null}
        </View>

        {/* 学校下拉面板：半径 + 搜索 + 学校列表，选中即生效 */}
        {openTab === 'school' ? (
          <View className='pub-filter__panel'>
            <View className='pub-filter__pad'>
              <Text className='pub-chips__label pub-chips__label--flat'>
                {t('pub.schoolRadius')}
              </Text>
              <View className='pub-chips pub-chips--wrap'>
                {RADII.map((km) => (
                  <View
                    key={km}
                    className={`pub-chip${schoolKm === km ? ' pub-chip--on' : ''}`}
                    onClick={() => setSchoolKm(km)}
                  >
                    <Text>{t('pub.kmValue', { km })}</Text>
                  </View>
                ))}
              </View>
              <Input
                className='pub-search'
                value={schoolKw}
                onInput={(e) => setSchoolKw(e.detail.value)}
                placeholder={t('pub.schoolSearchPlaceholder')}
              />
            </View>
            <ScrollView className='pub-filter__scroll' scrollY>
              {filteredSchools.length === 0 ? (
                <View className='pub-empty'>{t('pub.schoolFilterEmpty')}</View>
              ) : (
                filteredSchools.map((school) => (
                  <View
                    key={school.id}
                    className={`pub-sheet__row${
                      schoolId === school.id ? ' pub-sheet__row--on' : ''
                    }`}
                    onClick={() => toggleSchool(school)}
                  >
                    <View className='pub-row__main'>
                      <Text className='pub-row__title'>{school.name}</Text>
                      {school.name_en || school.district ? (
                        <Text className='pub-row__sub'>
                          {[school.name_en, school.district].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                    {schoolId === school.id ? (
                      <Text className='pub-row__action'>{t('pub.selected')}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
            <View className='pub-filter__actions'>
              <View className='btn btn--secondary' onClick={resetSchool}>
                <Text>{t('pub.schoolAny')}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* 更多下拉面板：排序 + 价格 + 面积 + 户型，重置 / 应用 */}
        {openTab === 'more' ? (
          <View className='pub-filter__panel'>
            <View className='pub-filter__pad'>
              <Text className='pub-chips__label pub-chips__label--flat'>{t('pub.sort')}</Text>
              <View className='pub-chips pub-chips--wrap'>
                {schoolId ? (
                  <View
                    className={`pub-chip${sort === 'distance' ? ' pub-chip--on' : ''}`}
                    onClick={() => setSort('distance')}
                  >
                    <Text>{t('pub.sortDistance')}</Text>
                  </View>
                ) : null}
                {SORTS.map(([key, label]) => (
                  <View
                    key={key}
                    className={`pub-chip${sort === key ? ' pub-chip--on' : ''}`}
                    onClick={() => setSort(key)}
                  >
                    <Text>{t(label)}</Text>
                  </View>
                ))}
              </View>

              <Text className='pub-chips__label'>{t('pub.filterPrice')}</Text>
              <View className='pub-range'>
                <Input
                  className='pub-range__input'
                  type='number'
                  value={priceMin}
                  onInput={(e) => setPriceMin(e.detail.value)}
                  placeholder={t('pub.filterMin')}
                />
                <Text className='pub-range__to'>{t('pub.to')}</Text>
                <Input
                  className='pub-range__input'
                  type='number'
                  value={priceMax}
                  onInput={(e) => setPriceMax(e.detail.value)}
                  placeholder={t('pub.filterMax')}
                />
              </View>

              <Text className='pub-chips__label'>{t('pub.filterArea')}</Text>
              <View className='pub-range'>
                <Input
                  className='pub-range__input'
                  type='number'
                  value={areaMin}
                  onInput={(e) => setAreaMin(e.detail.value)}
                  placeholder={t('pub.filterMin')}
                />
                <Text className='pub-range__to'>{t('pub.to')}</Text>
                <Input
                  className='pub-range__input'
                  type='number'
                  value={areaMax}
                  onInput={(e) => setAreaMax(e.detail.value)}
                  placeholder={t('pub.filterMax')}
                />
              </View>

              <Text className='pub-chips__label'>{t('pub.filterBeds')}</Text>
              <View className='pub-chips pub-chips--wrap'>
                {BEDROOM_OPTIONS.map(([key, label]) => (
                  <View
                    key={key || 'any'}
                    className={`pub-chip${bedsMin === key ? ' pub-chip--on' : ''}`}
                    onClick={() => setBedsMin(key)}
                  >
                    <Text>{t(label)}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='pub-filter__actions'>
              <View className='btn btn--secondary' onClick={resetMore}>
                <Text>{t('pub.reset')}</Text>
              </View>
              <View
                className='btn btn--primary'
                onClick={() => {
                  setOpenTab('')
                  fetchPage(1)
                }}
              >
                <Text>{t('pub.apply')}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <Text className='pub-count'>{t('pub.totalCount', { n: total })}</Text>

        {loading ? (
          <View className='pub-loading'>{t('pub.loading')}</View>
        ) : items.length === 0 ? (
          <View className='pub-empty'>{t('pub.emptyWiden')}</View>
        ) : (
          <>
            {items.map((item) => {
              const cover = coverOf(item)
              const isSell = item.listing_type === 'sell'
              const price = item.price ?? (isSell ? item.asking_price : item.monthly_rent)
              return (
                <View
                  key={item.id}
                  className='pub-listing'
                  onClick={() => openDetail(item.id)}
                >
                  <View className='pub-listing__media'>
                    {cover ? (
                      <Image className='pub-listing__img' src={cover} mode='aspectFill' />
                    ) : (
                      <View className='pub-listing__noimg'>
                        <Text>{t('pub.noPhoto')}</Text>
                      </View>
                    )}
                    {item.listing_type ? (
                      <View
                        className={`pub-listing__type${
                          isSell ? ' pub-listing__type--sell' : ''
                        }`}
                      >
                        <Text>{listingTypeLabel(item.listing_type)}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View className='pub-listing__body'>
                    <Text className='pub-listing__title'>
                      {item.project_name || item.room_number || t('pub.listingItem')}
                    </Text>
                    {item.room_number && item.project_name ? (
                      <Text className='pub-listing__unit'>{item.room_number}</Text>
                    ) : null}
                    {item.address ? (
                      <Text className='pub-listing__addr'>{item.address}</Text>
                    ) : null}

                    <View className='pub-listing__facts'>
                      {item.bedrooms != null ? <Text>{item.bedrooms} BED</Text> : null}
                      {item.bathrooms != null ? <Text>{item.bathrooms} BATH</Text> : null}
                      {item.size_sqm != null ? <Text>{item.size_sqm} {t('pub.sqm')}</Text> : null}
                    </View>

                    <Text className='pub-listing__price'>
                      {fmtMoney(price, item.currency || 'THB')}
                      {isSell ? null : (
                        <Text className='pub-listing__price-sub'>{t('pub.perMonth')}</Text>
                      )}
                    </Text>

                    {/* 学区筛选生效的回显：不显示这行，用户选了学校也看不出筛在哪 */}
                    {item.nearest_school_km != null && item.nearest_school_name ? (
                      <Text className='pub-listing__school'>
                        {t('pub.distanceToSchool', {
                          name: item.nearest_school_name,
                          km: item.nearest_school_km
                        })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )
            })}

            {loadingMore ? (
              <View className='pub-loading'>{t('pub.loading')}</View>
            ) : items.length < total ? (
              <View className='btn btn--secondary' onClick={loadMore}>
                <Text>{t('pub.loadMore')}</Text>
              </View>
            ) : (
              <View className='pub-footer-note'>{t('pub.noMore')}</View>
            )}
          </>
        )}
      </View>

      <BottomNav role='guest' active='browse' />
    </View>
  )
}