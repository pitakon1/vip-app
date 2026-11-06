/**
 * 业务线 → 后端参数的**唯一映射**。
 *
 * 后端没有 `biz` 这个参数，只有 `listing_type` + `is_new_development`：
 * - all    ：两者都不传
 * - rent   ：listing_type=rent
 * - sale   ：listing_type=sell（二手房 + 新房，员工端历史口径）
 * - resale ：listing_type=sell + is_new_development=false
 * - new    ：listing_type=sell + is_new_development=true
 *
 * 之前 C 端找房页与员工端找房页各写一份同样的 if/else，改一处漏一处就会出现
 * 「两个页面同一业务线筛出不同结果」。统一收敛到本文件。
 */
export type BizKey = 'all' | 'rent' | 'sale' | 'resale' | 'new';

export interface BizQueryParams {
  listing_type?: 'rent' | 'sell';
  is_new_development?: boolean;
}

/** 业务线对应的完整列表筛选参数（含新房/二手房区分）。 */
export function bizToParams(biz: BizKey): BizQueryParams {
  switch (biz) {
    case 'rent':
      return { listing_type: 'rent' };
    case 'sale':
      return { listing_type: 'sell' };
    case 'resale':
      return { listing_type: 'sell', is_new_development: false };
    case 'new':
      return { listing_type: 'sell', is_new_development: true };
    default:
      return {};
  }
}

/** 业务线对应的地图点位参数（地图接口不支持 is_new_development，只传业务线）。 */
export function bizToMapParams(biz: BizKey): { listing_type?: 'rent' | 'sell' } {
  return biz === 'all' ? {} : { listing_type: biz === 'rent' ? 'rent' : 'sell' };
}
