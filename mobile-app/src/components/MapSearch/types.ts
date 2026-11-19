import type { PublicMapPoint } from '@/services/publicApi';

/** 全屏地图找房入口参数：由找房页 / 员工房源页下发当前业务口径 */
export interface MapSearchProps {
  visible: boolean;
  onClose: () => void;
  onOpenPoint: (point: PublicMapPoint) => void;
  /** 定位城市 cityKey（后端做 slug 归一化） */
  city?: string;
  /** 业务口径：rent / sell；员工端「全部」不传，展示全业务点位 */
  listingType?: 'rent' | 'sell';
  propertyType?: string[];
  isNewDevelopment?: boolean;
  /** 找房页已输入的关键词（地图内可继续编辑） */
  keyword?: string;
  /** 已获取的用户定位（用于初始中心和「定位」按钮） */
  userPos?: { lat: number; lng: number } | null;
}

/** 地图气泡点位（价格已格式化，避免地图层重复做货币处理） */
export interface MapPointMarker {
  id: string;
  lat: number;
  lng: number;
  priceLabel: string;
}

export interface MapViewportBounds {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

export interface MapRegionInput {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** 卡片横滑 / 点气泡时，把地图居中到目标点（ts 用于重复点同一点也能动画） */
export interface MapFocus {
  lat: number;
  lng: number;
  ts: number;
}

export interface MapCanvasProps {
  points: MapPointMarker[];
  selectedId: string | null;
  initialRegion: MapRegionInput;
  focus: MapFocus | null;
  userPos: { lat: number; lng: number } | null;
  /** 底部卡片条高度（含安全区），用于摆放右侧悬浮控件 */
  bottomInset: number;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: MapViewportBounds) => void;
  /** 无定位时点「定位」的提示（不阻断页面） */
  onLocateUnavailable: () => void;
}
