import api from '@/lib/api';

export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

export const propertiesApi = {
  list: (params?: any) => api.get('/properties', { params }),
  get: (id: string) => api.get(`/properties/${id}`),
};

export const leasesApi = {
  list: (params?: any) => api.get('/leases', { params }),
  get: (id: string) => api.get(`/leases/${id}`),
  renew: (id: string, data: any) => api.post(`/leases/${id}/renew`, data),
  terminate: (id: string, data: any) => api.post(`/leases/${id}/terminate`, data),
};

export const paymentsApi = {
  list: (params?: any) => api.get('/payments', { params }),
  mine: () => api.get('/payments/me'),
};

export const documentsApi = {
  list: (params?: any) => api.get('/documents', { params }),
};

export const serviceOrdersApi = {
  list: (params?: any) => api.get('/service-orders', { params }),
  create: (data: any) => api.post('/service-orders', data),
};

export const maintenanceApi = {
  list: (params?: any) => api.get('/maintenance-tickets', { params }),
  create: (data: any) => api.post('/maintenance-tickets', data),
};

export const notificationsApi = {
  mine: () => api.get('/notifications/me'),
  readAll: () => api.post('/notifications/read-all'),
};

export const ownerApi = {
  properties: () => api.get('/owners/me/properties'),
  income: () => api.get('/owners/me/income'),
};

export const tenantApi = {
  me: () => api.get('/tenants/me'),
};

export const attendanceApi = {
  checkIn: (data: any) => api.post('/attendance/check-in', data),
  checkOut: (data: any) => api.post('/attendance/check-out', data),
  today: () => api.get('/attendance/today'),
};

export const employeesApi = {
  leaderboard: () => api.get('/employees/leaderboard'),
};
