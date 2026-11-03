import { MAX_PAGE_SIZE } from './api'

/**
 * 分页取值的唯一来源。
 *
 * 后端 `app/core/pagination.py` 对 `page_size` 是硬截断（上限 100，不报错），
 * 传更大值只会静默少拿数据。页面里不要再手写分页数字，统一引用这里。
 */

/** 表格 / 列表默认每页条数。 */
export const LIST_PAGE_SIZE = 20

/** 下拉候选、需要一次映射全量的场景；等于后端单页硬顶。 */
export const OPTION_PAGE_SIZE = MAX_PAGE_SIZE

/** 首页推荐卡片。 */
export const SHOWCASE_PAGE_SIZE = 8

/** 分类页横滑卡片。 */
export const CAROUSEL_PAGE_SIZE = 6

/** 分类页列表网格每页。 */
export const CATEGORY_PAGE_SIZE = 12

/** 详情页附属列表（合同附件、关联房源等）。 */
export const DETAIL_PAGE_SIZE = 50

/** 学校详情页周边房源。 */
export const NEARBY_LIMIT = 12

/** 地图聚合点位上限（`/public/map-points` 独立上限，不受分页硬顶约束）。 */
export const MAP_LIMIT = 300
