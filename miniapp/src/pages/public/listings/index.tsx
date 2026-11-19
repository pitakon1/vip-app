import { LIST_PAGE_SIZE, OPTION_PAGE_SIZE } from '@/lib/pagination'
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
import { View, Text, Image, Input, ScrollView, PageMeta } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
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
import StatusTop from '@/components/StatusTop'
import StateBlock from '@/components/StateBlock'
import { SCHOOL_RADIUS_OPTIONS } from '@/constants/filters'
import './index.scss'

const PAGE_SIZE = LIST_PAGE_SIZE
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

/** 房产类型组合口径（与 App / Web 一致）：公寓=apartment+condo，商铺办公=office+shop */
const TYPE_CLASS_GROUPS: Record<string, string[]> = {
  apartment: ['apartment', 'condo'],
  villa: ['villa', 'house'],
  commercial: ['office', 'shop'],
  factory: ['factory'],
  hotel: ['hotel'],
  land: ['land']
}
const TYPE_CLASS_OPTIONS: Array<[string, string]> = [
  ['', 'pub.filterAny'],
  ['apartment', 'prop.type.apartment'],
  ['villa', 'prop.type.house'],
  ['commercial', 'pub.shopOffice'],
  ['factory', 'prop.type.factory'],
  ['hotel', 'prop.type.hotel'],
  ['land', 'prop.type.land']
]
const ORIENTATIONS = [
  'north',
  'south',
  'east',
  'west',
  'northeast',
  'northwest',
  'southeast',
  'southwest'
]
const DECORATIONS = ['fully_furnished', 'standard', 'simple', 'bare', 'luxury']
const FLOOR_LEVELS = ['low', 'mid', 'high']
const TENURES = ['freehold', 'leasehold', 'mixed']
const AMENITIES = ['aircon', 'pool', 'gym', 'parking', 'elevator', 'balcony', 'garden']
const LEASE_MONTHS = ['3', '6', '12']
const BUILDING_AGES = ['5', '10', '20']

type FilterTab = '' | 'school' | 'more'

// 分类页快捷入口带入的预设筛选；都对应后端已开放且对 C 端公开的查询参数
type PresetKey = 'latest' | 'furnished' | 'owner_direct' | 'featured' | 'vr' | 'env' | 'new'

const PRESET_KEYS: PresetKey[] = [
  'latest',
  'furnished',
  'owner_direct',
  'featured',
  'vr',
  'env',
  'new'
]

const PRESET_LABEL_KEY: Record<PresetKey, string> = {
  latest: 'pub.presetLatest',
  furnished: 'pub.presetFurnished',
  owner_direct: 'pub.presetOwnerDirect',
  featured: 'pub.presetFeatured',
  vr: 'pub.presetVr',
  env: 'pub.presetEnv',
  new: 'pub.presetNew'
}

export default function PublicListingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  // 首页搜索条 / 学校卡片会带参进入：q 关键词、school_id + school_name + school_km 学区筛选
  const initialQ = String(router.params?.q ?? '')
  const initialSchoolId = String(router.params?.school_id ?? '')
  const initialSchoolName = String(router.params?.school_name ?? '')
  const initialSchoolKm = Number(router.params?.school_km) || 3
  // 分类页入口的预设（新上 / 带家具 / 业主直租 / 精选 / VR / 可环评 / 新房）
  const presetParam = String(router.params?.preset ?? '')
  // ---- 基础筛选 ----
  const [preset, setPreset] = useState<PresetKey | ''>(
    PRESET_KEYS.includes(presetParam as PresetKey) ? (presetParam as PresetKey) : ''
  )
  // 标题按入口语义命名（房东直租 / 新上房源 / 带家具房源…），并同步系统导航栏标题
  const pageTitle = preset ? t(PRESET_LABEL_KEY[preset]) : t('category.allListings')
  useEffect(() => {
    Taro.setNavigationBarTitle({ title: pageTitle })
  }, [pageTitle])
  const [type, setType] = useState(presetParam === 'new' ? 'sell' : '')
  const [keyword, setKeyword] = useState(initialQ)
  const [debounced, setDebounced] = useState(initialQ.trim())
  const [sort, setSort] = useState('latest')

  // ---- 更多：价格 / 面积 / 户型（与 App 一致，直接输最值，无预设）----
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [areaMin, setAreaMin] = useState('')
  const [areaMax, setAreaMax] = useState('')
  const [bedsMin, setBedsMin] = useState('')

  // ---- 更多：后端已支持、原先只有分类页预设入口的维度 ----
  // 预设入口的值灌进这些 state，进到列表页后面板里能看到选中态，也能单独点掉。
  const [typeClass, setTypeClass] = useState('')
  const [orientation, setOrientation] = useState('')
  const [floorLevels, setFloorLevels] = useState<string[]>([])
  const [decoration, setDecoration] = useState(
    presetParam === 'furnished' ? 'fully_furnished' : ''
  )
  const [amenities, setAmenities] = useState<string[]>([])
  const [ownerDirect, setOwnerDirect] = useState(presetParam === 'owner_direct')
  const [featured, setFeatured] = useState(presetParam === 'featured')
  const [hasVr, setHasVr] = useState(presetParam === 'vr')
  const [hasVideo, setHasVideo] = useState(false)
  const [envPermit, setEnvPermit] = useState(presetParam === 'env')
  const [newDev, setNewDev] = useState(presetParam === 'new')
  const [minLease, setMinLease] = useState('')
  const [tenure, setTenure] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [wholeFloor, setWholeFloor] = useState(false)
  const [wholeBuilding, setWholeBuilding] = useState(false)
  const [companyReg, setCompanyReg] = useState(false)

  // 小程序页面实例可能被复用：入口 preset 变化时，把条件重新灌进面板状态
  useEffect(() => {
    const p = (PRESET_KEYS.includes(presetParam as PresetKey) ? presetParam : '') as PresetKey | ''
    setPreset(p)
    setDecoration(p === 'furnished' ? 'fully_furnished' : '')
    setOwnerDirect(p === 'owner_direct')
    setFeatured(p === 'featured')
    setHasVr(p === 'vr')
    setEnvPermit(p === 'env')
    setNewDev(p === 'new')
    if (p === 'new') setType('sell')
  }, [presetParam])

  // ---- 学校筛选（空间筛选）----
  const [schoolId, setSchoolId] = useState(initialSchoolId)
  const [schoolName, setSchoolName] = useState(initialSchoolName)
  const [schoolKm, setSchoolKm] = useState(initialSchoolKm)
  const [schools, setSchools] = useState<PublicSchool[]>([])
  const [schoolKw, setSchoolKw] = useState('')

  // ---- 下拉面板 ----
  const [openTab, setOpenTab] = useState<FilterTab>('')
  const [moreTab, setMoreTab] = useState<
    'sort' | 'price' | 'area' | 'beds' | 'type' | 'room' | 'tags' | 'lease' | 'business' | 'amenity'
  >('sort')

  // ---- 列表状态 ----
  const [items, setItems] = useState<PublicListing[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    loadRates()
    // 学校清单只为筛选器备选，取前 100 条即可
    publicApi
      .schools({ page_size: OPTION_PAGE_SIZE })
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

  // 「更多」面板的已选维度数（每个维度算 1；多选组按维度计）
  const moreActiveDims = [
    !!(priceMin || priceMax),
    !!(areaMin || areaMax),
    !!bedsMin,
    !!typeClass,
    !!orientation,
    floorLevels.length > 0,
    !!decoration,
    amenities.length > 0,
    ownerDirect,
    featured,
    hasVr,
    hasVideo,
    envPermit,
    newDev,
    !!minLease,
    !!tenure,
    !!ageMax,
    wholeFloor,
    wholeBuilding,
    companyReg
  ]
  const moreActive = moreActiveDims.filter(Boolean).length

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
    setTypeClass('')
    setOrientation('')
    setFloorLevels([])
    setDecoration('')
    setAmenities([])
    setOwnerDirect(false)
    setFeatured(false)
    setHasVr(false)
    setHasVideo(false)
    setEnvPermit(false)
    setNewDev(false)
    setMinLease('')
    setTenure('')
    setAgeMax('')
    setWholeFloor(false)
    setWholeBuilding(false)
    setCompanyReg(false)
  }

  // 预设 chip 的 × ：只清掉该预设对应的维度，其他已选条件保留
  const clearPreset = () => {
    if (preset === 'furnished') setDecoration('')
    else if (preset === 'owner_direct') setOwnerDirect(false)
    else if (preset === 'featured') setFeatured(false)
    else if (preset === 'vr') setHasVr(false)
    else if (preset === 'env') setEnvPermit(false)
    else if (preset === 'new') setNewDev(false)
    setPreset('')
  }

  // 「更多」多选组
  const tagSelected = [
    ownerDirect ? 'owner' : '',
    featured ? 'featured' : '',
    hasVr ? 'vr' : '',
    hasVideo ? 'video' : '',
    envPermit ? 'env' : '',
    newDev ? 'new' : ''
  ].filter(Boolean)
  const toggleTag = (k: string) => {
    const on = !tagSelected.includes(k)
    if (k === 'owner') setOwnerDirect(on)
    else if (k === 'featured') setFeatured(on)
    else if (k === 'vr') setHasVr(on)
    else if (k === 'video') setHasVideo(on)
    else if (k === 'env') setEnvPermit(on)
    else if (k === 'new') setNewDev(on)
  }
  const bizSelected = [
    wholeFloor ? 'floor' : '',
    wholeBuilding ? 'building' : '',
    companyReg ? 'company' : ''
  ].filter(Boolean)
  const toggleBizExtra = (k: string) => {
    const on = !bizSelected.includes(k)
    if (k === 'floor') setWholeFloor(on)
    else if (k === 'building') setWholeBuilding(on)
    else if (k === 'company') setCompanyReg(on)
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
      if (targetPage === 1) {
        setLoading(true)
        setLoadError(false)
      } else setLoadingMore(true)
      try {
        const res = await publicApi.listings({
          page: targetPage,
          page_size: PAGE_SIZE,
          listing_type: (type || undefined) as 'rent' | 'sell' | undefined,
          q: debounced || undefined,
          // 选了学校时默认按距离排序（学区找房的自然语义）
          sort: (schoolId && sort === 'latest' ? 'distance' : sort) as any,
          property_type: typeClass ? TYPE_CLASS_GROUPS[typeClass] : undefined,
          price_min: priceMin ? Number(priceMin) : undefined,
          price_max: priceMax ? Number(priceMax) : undefined,
          area_min: areaMin ? Number(areaMin) : undefined,
          area_max: areaMax ? Number(areaMax) : undefined,
          bedrooms_min: bedsMin ? Number(bedsMin) : undefined,
          // ---- 房况 / 标签 / 租售条件 / 商办专项（预设入口的值已灌进 state）----
          orientation: orientation || undefined,
          floor_level: floorLevels.length ? floorLevels : undefined,
          decoration: decoration || undefined,
          amenity: amenities.length ? amenities : undefined,
          owner_direct: ownerDirect || undefined,
          is_featured: featured || undefined,
          has_vr: hasVr || undefined,
          has_video: hasVideo || undefined,
          environmental_permit: envPermit || undefined,
          is_new_development: newDev || undefined,
          min_lease_months: minLease ? Number(minLease) : undefined,
          tenure: (tenure || undefined) as 'freehold' | 'leasehold' | 'mixed' | undefined,
          building_age_max: ageMax ? Number(ageMax) : undefined,
          whole_floor_only: wholeFloor || undefined,
          whole_building_only: wholeBuilding || undefined,
          company_registrable: companyReg || undefined,
          school_id: schoolId || undefined,
          school_radius_km: schoolId ? schoolKm : undefined
        })
        const pageData = unwrapPage<PublicListing>(res)
        setTotal(pageData.total)
        setPage(targetPage)
        setItems((prev) => (targetPage === 1 ? pageData.items : [...prev, ...pageData.items]))
      } catch (err) {
        console.error('[public listings] 加载失败', err)
        if (targetPage === 1) setLoadError(true)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [
      type,
      debounced,
      sort,
      typeClass,
      priceMin,
      priceMax,
      areaMin,
      areaMax,
      bedsMin,
      orientation,
      floorLevels,
      decoration,
      amenities,
      ownerDirect,
      featured,
      hasVr,
      hasVideo,
      envPermit,
      newDev,
      minLease,
      tenure,
      ageMax,
      wholeFloor,
      wholeBuilding,
      companyReg,
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
      {/* 面板展开时锁住页面滚动，避免吸顶栏与面板之间被滚动拉开缝 */}
      <PageMeta page-style={openTab ? 'overflow: hidden' : ''} />
      <StatusTop />
      <View className='pub-inner'>
        <View className='pub-head'>
          <Text className='pub-head__title'>{pageTitle}</Text>
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

        {/* 分类页入口带入的预设：显式回显，可一键清除 */}
        {preset ? (
          <View className='pub-chips pub-preset-row'>
            <View className='pub-chip pub-chip--on'>
              <Text>{t(PRESET_LABEL_KEY[preset])}</Text>
              <Text className='pub-preset-row__close' onClick={clearPreset}>
                ×
              </Text>
            </View>
          </View>
        ) : null}

        {/* 吸顶筛选坞：筛选行 + 面板同属一个 sticky 容器，
            粘住后成为同一块，面板永远贴在筛选行下沿，不会脱开 */}
        <View className={`pub-filter${openTab ? ' pub-filter--open' : ''}`}>
        {/* 单行筛选行：学校 / 更多（对齐 App）；展开时与面板连成一体 */}
        <View className={`pub-chips pub-filter__chips${openTab ? ' pub-filter__chips--open' : ''}`}>
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
            onClick={() => {
              if (openTab === 'more') setOpenTab('')
              else {
                setMoreTab('sort')
                setOpenTab('more')
              }
            }}
          >
            <Text>{t('pub.filterMore')}</Text>
          </View>
        </View>

        {/* 学校下拉面板：半径 + 搜索 + 学校列表，选中即生效 */}
        {openTab === 'school' ? (
          <View className='pub-filter__panel'>
            <View className='pub-filter__pad'>
              <Text className='pub-chips__label pub-chips__label--flat'>
                {t('pub.schoolRadius')}
              </Text>
              <View className='pub-chips pub-chips--wrap'>
                {SCHOOL_RADIUS_OPTIONS.map((km) => (
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

        {/* 更多面板：左侧一级类目竖栏 + 右侧选项，底部重置 / 应用固定 */}
        {openTab === 'more' ? (
          <View className='pub-filter__panel'>
            <View className='pub-filter__body'>
              <ScrollView className='pub-filter__rail' scrollY>
                {([
                  ['sort', t('pub.sort')],
                  ['price', t('pub.filterPrice')],
                  ['area', t('pub.filterArea')],
                  ['beds', t('pub.filterBeds')],
                  ['type', t('pub.propertyTypeGroup')],
                  ['room', t('pub.filterRoom')],
                  ['tags', t('pub.filterTags')],
                  ['lease', t('pub.filterLeaseTerms')],
                  ['business', t('pub.filterCommercial')],
                  ['amenity', t('list.amenities')]
                ] as Array<
                  [
                    'sort' | 'price' | 'area' | 'beds' | 'type' | 'room' | 'tags' | 'lease' | 'business' | 'amenity',
                    string
                  ]
                >).map(([key, label]) => (
                  <View
                    key={key}
                    className={`pub-filter__rail-item${
                      moreTab === key ? ' pub-filter__rail-item--on' : ''
                    }`}
                    onClick={() => setMoreTab(key)}
                  >
                    <Text>{label}</Text>
                  </View>
                ))}
              </ScrollView>
              <ScrollView className='pub-filter__content' scrollY>
                {moreTab === 'sort' ? (
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
                ) : null}

                {moreTab === 'price' ? (
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
                ) : null}

                {moreTab === 'area' ? (
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
                ) : null}

                {moreTab === 'beds' ? (
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
                ) : null}

                {moreTab === 'type' ? (
                  <View className='pub-chips pub-chips--wrap'>
                    {TYPE_CLASS_OPTIONS.map(([key, label]) => (
                      <View
                        key={key || 'any'}
                        className={`pub-chip${typeClass === key ? ' pub-chip--on' : ''}`}
                        onClick={() => setTypeClass(key)}
                      >
                        <Text>{t(label)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {moreTab === 'room' ? (
                  <>
                    <Text className='pub-chips__label'>{t('pub.orientationLabel')}</Text>
                    <View className='pub-chips pub-chips--wrap'>
                      <View
                        className={`pub-chip${orientation === '' ? ' pub-chip--on' : ''}`}
                        onClick={() => setOrientation('')}
                      >
                        <Text>{t('pub.filterAny')}</Text>
                      </View>
                      {ORIENTATIONS.map((o) => (
                        <View
                          key={o}
                          className={`pub-chip${orientation === o ? ' pub-chip--on' : ''}`}
                          onClick={() => setOrientation(orientation === o ? '' : o)}
                        >
                          <Text>{t(`pub.orientation.${o}`)}</Text>
                        </View>
                      ))}
                    </View>
                    <Text className='pub-chips__label'>{t('pub.floor')}</Text>
                    <View className='pub-chips pub-chips--wrap'>
                      {FLOOR_LEVELS.map((lv) => (
                        <View
                          key={lv}
                          className={`pub-chip${floorLevels.includes(lv) ? ' pub-chip--on' : ''}`}
                          onClick={() =>
                            setFloorLevels((prev) =>
                              prev.includes(lv) ? prev.filter((x) => x !== lv) : [...prev, lv]
                            )
                          }
                        >
                          <Text>{t(`pub.floorLevel.${lv}`)}</Text>
                        </View>
                      ))}
                    </View>
                    <Text className='pub-chips__label'>{t('pub.decorationLabel')}</Text>
                    <View className='pub-chips pub-chips--wrap'>
                      <View
                        className={`pub-chip${decoration === '' ? ' pub-chip--on' : ''}`}
                        onClick={() => setDecoration('')}
                      >
                        <Text>{t('pub.filterAny')}</Text>
                      </View>
                      {DECORATIONS.map((d) => (
                        <View
                          key={d}
                          className={`pub-chip${decoration === d ? ' pub-chip--on' : ''}`}
                          onClick={() => setDecoration(decoration === d ? '' : d)}
                        >
                          <Text>{t(`pub.decoration.${d}`)}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                {moreTab === 'tags' ? (
                  <View className='pub-chips pub-chips--wrap'>
                    {[
                      ['owner', t('pub.presetOwnerDirect')],
                      ['featured', t('pub.presetFeatured')],
                      ['vr', t('pub.presetVr')],
                      ['video', t('pub.filterVideo')],
                      ['env', t('pub.presetEnv')],
                      ['new', t('pub.presetNew')]
                    ].map(([key, label]) => (
                      <View
                        key={key}
                        className={`pub-chip${tagSelected.includes(key) ? ' pub-chip--on' : ''}`}
                        onClick={() => toggleTag(key)}
                      >
                        <Text>{label}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {moreTab === 'lease' ? (
                  <>
                    <Text className='pub-chips__label'>{t('pub.filterMinLease')}</Text>
                    <View className='pub-chips pub-chips--wrap'>
                      <View
                        className={`pub-chip${minLease === '' ? ' pub-chip--on' : ''}`}
                        onClick={() => setMinLease('')}
                      >
                        <Text>{t('pub.filterAny')}</Text>
                      </View>
                      {LEASE_MONTHS.map((n) => (
                        <View
                          key={n}
                          className={`pub-chip${minLease === n ? ' pub-chip--on' : ''}`}
                          onClick={() => setMinLease(minLease === n ? '' : n)}
                        >
                          <Text>{t('pub.leaseMonths', { n })}</Text>
                        </View>
                      ))}
                    </View>
                    <Text className='pub-chips__label'>{t('pub.tenure')}</Text>
                    <View className='pub-chips pub-chips--wrap'>
                      <View
                        className={`pub-chip${tenure === '' ? ' pub-chip--on' : ''}`}
                        onClick={() => setTenure('')}
                      >
                        <Text>{t('pub.filterAny')}</Text>
                      </View>
                      {TENURES.map((x) => (
                        <View
                          key={x}
                          className={`pub-chip${tenure === x ? ' pub-chip--on' : ''}`}
                          onClick={() => setTenure(tenure === x ? '' : x)}
                        >
                          <Text>{t(`pub.tenure.${x}`)}</Text>
                        </View>
                      ))}
                    </View>
                    <Text className='pub-chips__label'>{t('pub.filterBuildingAge')}</Text>
                    <View className='pub-chips pub-chips--wrap'>
                      <View
                        className={`pub-chip${ageMax === '' ? ' pub-chip--on' : ''}`}
                        onClick={() => setAgeMax('')}
                      >
                        <Text>{t('pub.filterAny')}</Text>
                      </View>
                      {BUILDING_AGES.map((n) => (
                        <View
                          key={n}
                          className={`pub-chip${ageMax === n ? ' pub-chip--on' : ''}`}
                          onClick={() => setAgeMax(ageMax === n ? '' : n)}
                        >
                          <Text>{t('pub.ageWithin', { n })}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                {moreTab === 'business' ? (
                  <View className='pub-chips pub-chips--wrap'>
                    {[
                      ['floor', t('pub.filterWholeFloor')],
                      ['building', t('pub.filterWholeBuilding')],
                      ['company', t('pub.filterCompanyReg')]
                    ].map(([key, label]) => (
                      <View
                        key={key}
                        className={`pub-chip${bizSelected.includes(key) ? ' pub-chip--on' : ''}`}
                        onClick={() => toggleBizExtra(key)}
                      >
                        <Text>{label}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {moreTab === 'amenity' ? (
                  <View className='pub-chips pub-chips--wrap'>
                    {AMENITIES.map((a) => (
                      <View
                        key={a}
                        className={`pub-chip${amenities.includes(a) ? ' pub-chip--on' : ''}`}
                        onClick={() =>
                          setAmenities((prev) =>
                            prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
                          )
                        }
                      >
                        <Text>{t(`prop.amenity.${a}`)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </ScrollView>
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
        </View>

        {/* 面板下方只压暗列表区，筛选行与面板本身保持清晰、可操作 */}
        <View className='pub-results'>
          {openTab ? (
            <View className='pub-filter__mask' onClick={() => setOpenTab('')} />
          ) : null}

          {/* 加载失败时不要显示「共 0 套」，否则会把请求失败伪装成空数据 */}
          {!loadError && <Text className='pub-count'>{t('pub.totalCount', { n: total })}</Text>}

        {loading ? (
          <StateBlock loading text={t('pub.loading')} />
        ) : loadError ? (
          <StateBlock
            error
            text={t('common.loadFailedTapRetry')}
            retryText={t('common.tapRetry')}
            onRetry={() => fetchPage(1)}
          />
        ) : items.length === 0 ? (
          <StateBlock
            empty
            filtered={!!(debounced || type || schoolId || moreActive || preset || sort !== 'latest')}            text={t('pub.emptyWiden')}
          />
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
                      {[
                        item.bedrooms != null ? `${item.bedrooms} BED` : '',
                        item.bathrooms != null ? `${item.bathrooms} BATH` : '',
                        item.size_sqm != null ? `${item.size_sqm} ${t('pub.sqm')}` : ''
                      ]
                        .filter(Boolean)
                        .join(' · ')}
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
      </View>

      <BottomNav role='guest' active='' />
    </View>
  )
}