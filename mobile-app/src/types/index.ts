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
  tenantId: string;
  propertyId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'submitted' | 'accepted' | 'in_progress' | 'resolved' | 'closed';
  images?: string[];
  assigneeId?: string;
  createdAt?: string;
  updatedAt?: string;
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
