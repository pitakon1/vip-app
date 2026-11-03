// 成交明细（系统按佣金结算自动核算）
export interface CommissionRow {
  id: string
  deal_type?: string
  commission_base?: number
  commission_amount?: number
  status?: string
  created_at?: string
  [key: string]: any
}

// 系统核算的业绩汇总
export interface PerfBreakdown {
  deal_type: string
  label: string
  amount: number
  count: number
  percent: number
}

export interface PerfSummary {
  year: number
  month: number
  year_total: number
  month_total: number
  deals_total: number
  month_deals: number
  commission_total: number
  month_commission: number
  new_rentals: number
  renewals: number
  management: number
  breakdown: PerfBreakdown[]
}

export interface MonthPerf {
  year: number
  month: number
  revenue: number
  commission: number
  deals: number
}

// 员工业绩追踪 / 合作公司业绩行
export interface PerfRow {
  [key: string]: any
  employee_id?: string
  employee_name?: string
  partner_id?: string
  partner_name?: string
  total_commission: number
  total_revenue: number
  deals: number
}

// 成交明细表行（已做 i18n / 格式化）
export interface DealRow {
  id: string
  type: string
  base?: number
  amount?: number
  status: { text: string; tone: string }
  date: string
}

// 月度业绩记录（系统核算）
export interface MonthlyRecord {
  month: string
  date: string
  desc: string
  tone: string
  statusText: string
}

// 月度柱图数据
export interface BarItem {
  label: string
  value: string
  height: string
  active: boolean
}
