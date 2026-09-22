export type UserRole = 'agent' | 'owner' | 'tenant' | 'employee' | 'admin';

export type PropertyStatus = 'vacant' | 'rented' | 'renewing' | 'maintenance';

export interface User {
  id: string;
  username: string;
  name: string;
  full_name?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  avatar_url?: string;
  role: UserRole;
  createdAt?: string;
}

export interface Property {
  id: string;
  title?: string;
  address: string;
  city?: string;
  rent?: number;
  status: PropertyStatus;
  ownerId?: string;
  tenantId?: string;
  images?: string[];
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  // 后端返回的房源字段（与 API 对齐）
  room_number?: string;
  monthly_rent?: number;
  size_sqm?: number;
  currency?: string;
  project_id?: string;
}

export interface Lease {
  id: string;
  propertyId: string;
  tenantId: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  deposit: number;
  status: 'active' | 'expired' | 'terminated' | 'pending';
  documentUrl?: string;
  createdAt?: string;
}

export interface Payment {
  id: string;
  leaseId: string;
  amount: number;
  type: 'rent' | 'deposit' | 'service' | 'other';
  status: 'pending' | 'paid' | 'overdue' | 'failed';
  dueDate: string;
  paidDate?: string;
  method?: 'cash' | 'transfer' | 'online' | 'card';
  receiptUrl?: string;
  note?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'rent_reminder' | 'lease_expiry' | 'service_update' | 'system' | 'payment';
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface ServiceOrder {
  id: string;
  userId: string;
  serviceType: 'cleaning' | 'aircon' | 'management' | 'wifi' | 'utility' | 'other';
  title: string;
  description?: string;
  price: number;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  scheduledDate?: string;
  paymentStatus?: 'unpaid' | 'paid';
  createdAt?: string;
}

export interface MaintenanceTicket {
  id: string;
  tenant_id: string;
  property_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  // 必须与后端 `models/maintenance_ticket.py::TicketStatus` 逐字一致。
  // 此前这里写的是 submitted/accepted，后端根本没有这两个值——后端建单默认
  // 落 `open`，而 `open` 在旧口径下匹配不到任何 Tab（见 MaintenanceScreen.matchTab）。
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  // 字段名与后端 JSON 逐字一致（后端全量 schema 的 camelCase 字段数为 0）。
  // 此前声明成 createdAt/propertyId/photos:images，实际读到 undefined：
  // 工单卡与详情弹层的「时间」永远显示占位符，且无任何报错。
  photos?: string[];
  assigned_to?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Document {
  id: string;
  userId: string;
  title: string;
  type: 'contract' | 'receipt' | 'inspection' | 'identity' | 'other';
  fileUrl: string;
  fileType?: 'pdf' | 'image' | 'doc';
  uploadedAt?: string;
  size?: number;
}

// —— 房源上架单（发物件/房源上架）——
export type ListingType = 'rent' | 'sell';
export type MandateType = 'exclusive' | 'non_exclusive';
export type NonExclusiveSplit = 'sp_65_35' | 'sp_50_50' | 'sp_30_70' | 'sp_20_80';
export type DedupeState = 'new' | 'suspect' | 'blocked';

export interface Listing {
  id: string;
  property_id?: string;
  listing_type: ListingType;
  publisher?: string;
  publisher_user_id?: string;
  publisher_broker_id?: string | null;
  owner_id?: string;
  status: 'pending' | 'active' | 'rejected' | 'closed' | 'sold' | 'rented';
  asking_price?: number | null;
  monthly_rent?: number | null;
  currency?: string;
  sale_commission_rate?: number | null;
  rental_commission_months?: number | null;
  mandate_type?: MandateType;
  split_option?: NonExclusiveSplit | null;
  buyer_side_rate?: number | null;
  listing_side_rate?: number | null;
  owner_commission_rate?: number | null;
  broker_company?: string | null;
  broker_real_name?: string | null;
  broker_phone?: string | null;
  broker_wechat?: string | null;
  broker_line?: string | null;
  broker_whatsapp?: string | null;
  dedupe_state?: DedupeState | null;
  merged_into_listing_id?: string | null;
  reject_reason?: string | null;
  reviewed_at?: string | null;
  owner_contact_visible?: boolean;
  owner_contact_name?: string | null;
  owner_contact_phone?: string | null;
  owner_contact_channel?: string | null;
  created_at?: string;
  // 发布方本地补充展示（发布表单暂存，非后端字段）
  room_number?: string;
  address?: string;
  photos?: string[];
  property_type?: string;
  size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  description?: string;
  furnished?: boolean;
  available_from?: string;
  // 经纪人协议状态
  dedupe_merged?: boolean;
}
