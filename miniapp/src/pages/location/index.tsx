/**
 * 全局定位选择页（小程序，全屏页面，对齐贝壳移动端城市选择器）。
 * Material 3 移动设计重构：
 *  - 顶部「国家」横向胶囊筛选：默认选中当前定位国家，仅展示该国家的城市，点击切换；
 *  - 移除右侧黑色文字索引栏；
 *  - 全局搜索 + 当前定位 + 热门城市 辅助快速选择。
 */
import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import { useLocationStore, LOCATION_GROUPS } from '@/stores/location'
import { iconStyle } from '@/utils/icons'
import './index.scss'

export default function LocationPage() {
  const selection = useLocationStore((s) => s.selection)
  const select = useLocationStore((s) => s.select)

  const [query, setQuery] = useState('')
  const [activeCountry, setActiveCountry] = useState<string>(
    selection.country || LOCATION_GROUPS[0]?.country || '',
  )

  const countries = useMemo(() => LOCATION_GROUPS.map((g) => g.country), [])
  const activeGroup = LOCATION_GROUPS.find((g) => g.country === activeCountry)
  const activeCities = activeGroup?.cities ?? []

  const hotCities = useMemo(
    () => LOCATION_GROUPS.map((g) => g.cities[0]).filter(Boolean).slice(0, 6),
    [],
  )

  // 全局搜索结果（跨国家）
  const q = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!q) return []
    return LOCATION_GROUPS.flatMap((g) =>
      g.cities
        .filter((c) => c.cityLabel.toLowerCase().includes(q) || g.country.toLowerCase().includes(q))
        .map((c) => ({ country: g.country, ...c })),
    )
  }, [q])

  const searchEmpty = q.length > 0 && results.length === 0

  const pickCity = (country: string, cityKey: string, cityLabel: string) => {
    select({ country, cityKey, cityLabel })
  }

  return (
    <View className='loc-page'>
      {/* 顶部搜索 */}
      <View className='loc-search'>
        <View className='loc-search__box'>
          <Text className='loc-search__icon'>⌕</Text>
          <Input
            className='loc-search__input'
            value={query}
            onInput={(e) => setQuery(e.detail.value)}
            placeholder='请输入城市或国家名称'
            placeholderClass='loc-search__ph'
            confirmType='search'
          />
          {query.length > 0 && (
            <View className='loc-search__clear' onClick={() => setQuery('')}>
              <View className='icon-svg' style={iconStyle('close', 32)} />
            </View>
          )}
        </View>
      </View>

      {q ? (
        // ---- 搜索结果（全局）----
        <ScrollView className='loc-results' scrollY>
          <Text className='loc-result-title'>搜索结果</Text>
          {searchEmpty ? (
            <View className='loc-empty'>
              <Text>未找到匹配的城市</Text>
            </View>
          ) : (
            results.map((c) => {
              const active = selection.cityKey === c.cityKey
              return (
                <View
                  key={c.cityKey}
                  className={`loc-row${active ? ' loc-row--active' : ''}`}
                  onClick={() => pickCity(c.country, c.cityKey, c.cityLabel)}
                >
                  <View className='loc-row__main'>
                    <Text className={`loc-row__name${active ? ' loc-row__name--active' : ''}`}>
                      {c.cityLabel}
                    </Text>
                    <Text className='loc-row__sub'>{c.country}</Text>
                  </View>
                  {active && <Text className='loc-row__check'>✓</Text>}
                </View>
              )
            })
          )}
        </ScrollView>
      ) : (
        // ---- 浏览模式 ----
        <ScrollView className='loc-body' scrollY>
          {/* 当前定位 */}
          <View className='loc-current'>
            <View className='loc-current__icon-circle'>
              <Text className='loc-current__icon'>◎</Text>
            </View>
            <View className='loc-current__main'>
              <Text className='loc-current__label'>当前定位</Text>
              <Text className='loc-current__city'>
                {selection.country} · {selection.cityLabel}
              </Text>
            </View>
            <View className='loc-current__tag'>
              <Text className='loc-current__tag-text'>{selection.country}全城</Text>
            </View>
          </View>

          {/* 热门城市 */}
          <View className='loc-hot'>
            <Text className='loc-sec-title'>热门城市</Text>
            <View className='loc-hot__grid'>
              {hotCities.map((c) => {
                const active = selection.cityKey === c.cityKey
                return (
                  <View
                    key={c.cityKey}
                    className={`loc-chip${active ? ' loc-chip--active' : ''}`}
                    onClick={() => pickCity(c.country, c.cityKey, c.cityLabel)}
                  >
                    <Text className={active ? 'loc-chip__text--active' : ''}>{c.cityLabel}</Text>
                  </View>
                )
              })}
            </View>
          </View>

          {/* 国家胶囊 Tab：自动换行不滑屏 */}
          <View className='loc-countries'>
            <Text className='loc-sec-title'>选择国家</Text>
            <View className='loc-countries__tabs'>
              {countries.map((c) => {
                const active = c === activeCountry
                return (
                  <View
                    key={c}
                    className={`loc-country-chip${active ? ' loc-country-chip--active' : ''}`}
                    onClick={() => setActiveCountry(c)}
                  >
                    <Text className={active ? 'loc-country-chip__text--active' : ''}>{c}</Text>
                  </View>
                )
              })}
            </View>
          </View>

          {/* 当前国家城市列表 */}
          <View className='loc-city-list'>
            <Text className='loc-result-title'>
              {activeCountry} · 城市（{activeCities.length}）
            </Text>
            {activeCities.length ? (
              activeCities.map((c) => {
                const active = selection.cityKey === c.cityKey
                return (
                  <View
                    key={c.cityKey}
                    className={`loc-row${active ? ' loc-row--active' : ''}`}
                    onClick={() => pickCity(c.country, c.cityKey, c.cityLabel)}
                  >
                    <View className='loc-row__main'>
                      <Text className={`loc-row__name${active ? ' loc-row__name--active' : ''}`}>
                        {c.cityLabel}
                      </Text>
                      <Text className='loc-row__sub'>{c.children.length} 个区</Text>
                    </View>
                    {active && <Text className='loc-row__check'>✓</Text>}
                  </View>
                )
              })
            ) : (
              <View className='loc-empty'>
                <Text>该国家暂无可选城市</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  )
}