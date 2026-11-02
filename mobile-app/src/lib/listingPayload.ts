/**
 * 「上架」一键提交载荷：完全由该房源档案派生（后端按 property_id 定位档案，仅校验归属）。
 *
 * 此前管理端 / 销售端 / 业主端各有一份拷贝，字段兜底口径不一致（面积是否兼容
 * area、月租是否兼容 rentPrice、column_spacing 用 || 还是 ??），同一房源在不同
 * 端上架会得到不同的挂牌数据。统一收敛到这里。
 */
export const buildListingPayload = (p: any) => ({
  property_id: p.id,
  room_number: p.room_number || p.address || '-',
  address: p.address || p.room_number || '-',
  property_type: p.property_type || 'apartment',
  size_sqm: p.size_sqm ?? p.area ?? undefined,
  bedrooms: p.bedrooms ?? undefined,
  bathrooms: p.bathrooms ?? undefined,
  description: p.description || undefined,
  photos: Array.isArray(p.photos) && p.photos.length ? p.photos : undefined,
  furnished: !!p.furnished,
  video_url: p.video_url || undefined,
  vr_url: p.vr_url || undefined,
  ceiling_height_m: p.ceiling_height_m ?? undefined,
  land_area_sqm: p.land_area_sqm ?? undefined,
  floor_loading_kg_sqm: p.floor_loading_kg_sqm ?? undefined,
  column_spacing: p.column_spacing ?? undefined,
  power_capacity_kva: p.power_capacity_kva ?? undefined,
  environmental_permit: p.environmental_permit ?? undefined,
  whole_floor_only: p.whole_floor_only ?? undefined,
  whole_building_only: p.whole_building_only ?? undefined,
  company_registrable: p.company_registrable ?? undefined,
  listing_type: 'rent',
  monthly_rent: Number(p.monthly_rent || p.rentPrice || 0),
  currency: p.currency || 'THB',
  owner_id: p.owner_id || undefined,
});
