/**
 * ⚠️ 已废弃：C 端房源页已迁到 `screens/public/PublicListingsScreen`。
 *
 * 这个旧实现直接调 **需要鉴权** 的 B 端 `listingApi.list()` → `GET /listings`，
 * 匿名访问必然 401，是「未登录什么都看不到」的根因之一；而且它还把
 * `buyer_side_rate` / `listing_side_rate`（客源/房源分成比例）渲染给普通用户看，
 * 那是平台与业主/经纪人的议价条款，属于数据泄露。
 *
 * 保留此文件只为兼容可能存在的深层引用；新代码一律用 `screens/public/` 下的实现。
 * 若确认无引用，可直接删除本文件。
 */
export { default } from '../public/PublicListingsScreen';
