/**
 * 统一筛选栏（Web）：贝壳式「筛选条 + 就地展开面板」。
 *
 * 与移动端 / 小程序同一套视觉语言：
 *  - 筛选条是一行文字 tab，选中 / 展开态用主色；
 *  - 面板从筛选条下沿整幅展开，同宽同底色、无间隙、无浮动卡片；
 *  - 面板左侧一级类目竖栏，右侧当前类目内容，底部「重置 / 确定」常驻；
 *  - 遮罩只压面板下方的列表区，不覆盖筛选栏与面板。
 *
 * 版式复用 PublicListings 的 rent-filter-* 全局类，避免各页另写一套后走偏。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import '@/pages/PublicListings/public-listings.css'

export type FilterBarTab = {
  key: string
  label: ReactNode
  active?: boolean
  panel: ReactNode
}

const Chevron = () => (
  <span className="rent-filter-chip__chevron">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </span>
)

export default function FilterBar({
  tabs,
  openKey,
  onOpenChange,
  right,
}: {
  tabs: FilterBarTab[]
  openKey: string | null
  onOpenChange: (key: string | null) => void
  right?: ReactNode
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  /** 面板可用高度：锚点下沿到视口底部，保证「重置 / 确定」始终可见 */
  const [drawerMax, setDrawerMax] = useState<number>()

  useLayoutEffect(() => {
    if (!openKey) { setDrawerMax(undefined); return }
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setDrawerMax(Math.max(220, window.innerHeight - rect.bottom - 12))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [openKey])

  const toggle = (key: string) => onOpenChange(openKey === key ? null : key)
  const active = tabs.find((tab) => tab.key === openKey) ?? null

  return (
    <div
      ref={anchorRef}
      className={`rent-filter-anchor ${openKey ? 'rent-filter-anchor--open' : ''}`}
    >
      <div className="rent-filter-bar">
        <div className="rent-filter-bar__chips">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`rent-filter-chip ${tab.active ? 'rent-filter-chip--active' : ''}`}
              aria-expanded={openKey === tab.key}
              onClick={() => toggle(tab.key)}
            >
              {tab.label}
              <Chevron />
            </button>
          ))}
        </div>
        {right ? <div className="rent-filter-bar__right">{right}</div> : null}
      </div>

      {openKey && (
        <>
          <div
            className="rent-filter-drawer"
            role="dialog"
            aria-modal="true"
            style={drawerMax ? { maxHeight: drawerMax } : undefined}
          >
            <div className="rent-filter-drawer__rail">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`rent-filter-drawer__rail-btn ${openKey === tab.key ? 'rent-filter-drawer__rail-btn--active' : ''}`}
                  onClick={() => toggle(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="rent-filter-drawer__content">{active?.panel}</div>
          </div>
          <div className="rent-filter-mask" onClick={() => onOpenChange(null)} aria-hidden="true" />
        </>
      )}
    </div>
  )
}
