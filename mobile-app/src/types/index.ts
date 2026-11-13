export type UserRole = 'agent' | 'owner' | 'tenant' | 'employee' | 'admin' | 'partner_admin';

export type PropertyStatus = 'vacant' | 'rented' | 'renewing' | 'maintenance';

/**
 * 用户摘要。
 * 与后端（`core/auth.py::serialize_user`）字段完全一致：
 * id / email / full_name / role / phone / avatar_url / preferred_language。
 * 此前这里还有 username / name / avatar 三个本地别名（由 `toUser()` 造出来的），
 * 会让「后端到底给什么」变得含糊；展示统一读 `full_name`、头像读 `avatar_url`。
 */
export interface User {
  id: string;
  full_name?: string;
  phone?: string;
  email?: string;
  avatar_url?: string;
  role: UserRole;
  preferred_language?: string;
}

/**
 * 房源。
 * 字段口径与后端 JSON 逐字一致（snake_case + UUID 字符串 id）。
 * 旧版本这里混用了 camelCase（ownerId/rent/area）并同时混入 snake_case，
 * 导致同一份数据两种写法都要兜底。
 */
export interface Property {
  id: string;
  project_id?: string;
  owner_id: string;
  room_number: string;
  building?: string;
  address: string;
  floor?: number;
  property_type: string;
  monthly_rent?: number;
  currency: string;
  deposit_amount?: number;
  size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  status: PropertyStatus;
  description?: string;
  photos?: string[];
  furnished?: boolean;
  orientation?: string;
  decoration?: string;
  amenities?: string[];
  available_from?: string;
  created_at?: string;
  updated_at?: string;
}

export type LeaseStatus = 'active' | 'expired' | 'terminated' | 'pending';

/** 租约。字段口径与后端一致（snake_case + UUID 字符串 id）。 */
export interface Lease {
  id: string;
  lease_no?: string;
  /** 合同编号（HT-YYYYMMDD-NNNN），由后端生成 */
  contract_no?: string;
  property_id: string;
  tenant_id: string;
  owner_id: string;
  agent_id?: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  currency: string;
  deposit_amount: number;
  deposit_status?: string;
  status: LeaseStatus;
  contract_url?: string;
  special_terms?: string;
  renewed_from_lease_id?: string;
  created_at?: string;
  updated_at?: string;
}

export type PaymentType =
  | 'rent'
  | 'deposit'
  | 'commission'
  | 'service_fee'
  | 'utility'
  | 'tax'
  | 'refund';

// 后端枚举（backend/app/models/payment.py::PaymentStatus），接口只返回以下 7 个值
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'disputed'
  | 'expired';

// 展示派生态：由前端按后端状态 + 截止时间派生，不属于后端枚举
export type PaymentDisplayStatus = 'paid' | 'pending' | 'overdue' | 'refunded';

// 列表筛选项：后端额外接受 overdue（pending 且已过截止日）作为派生筛选值
export type PaymentStatusFilter = PaymentStatus | 'overdue';

/**
 * 账单/收款。
 * 字段口径与后端一致（snake_case）。旧版 camelCase（leaseId/dueDate/paidDate/
 * receiptUrl/method/note）与后端完全对不上，页面实际读到的都是 undefined。
 */
export interface Payment {
  id: string;
  receipt_no?: string;
  lease_id: string;
  property_id: string;
  payer_id?: string;
  payee_id?: string;
  amount: number;
  currency: string;
  payment_type: PaymentType;
  status: PaymentStatus;
  channel?: string;
  due_date: string;
  paid_at?: string;
  receipt_url?: string;
  description?: string;
  failure_reason?: string;
  late_fee_accrued?: number;
  late_fee_waived?: number;
  late_fee_updated_at?: string;
  created_at?: string;
  updated_at?: string;
}

/** 站内通知。字段口径按后端 snake_case；后端无对象时按本地展示兜底。 */
export interface Notification {
  id: string;
  user_id?: string;
  title: string;
  body: string;
  type: 'rent_reminder' | 'lease_expiry' | 'service_update' | 'system' | 'payment';
  read: boolean;
  created_at?: string;
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

export type DocumentType =
  | 'contract'
  | 'receipt'
  | 'inspection_photo'
  | 'tax_invoice'
  | 'wht_certificate'
  | 'property_certificate'
  | 'owner_id_card'
  | 'other';

/** 文档。字段口径与后端 `list_documents` 返回一致（title / file_url / created_at）。 */
export interface Document {
  id: string;
  owner_id: string;
  property_id?: string;
  lease_id?: string;
  type: DocumentType;
  title: string;
  file_url: string;
  file_size?: number;
  mime_type?: string;
  uploaded_by: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
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
