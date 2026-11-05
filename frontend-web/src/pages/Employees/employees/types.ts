import type { Employee, EmployeeStatus } from '@/types'

export interface QueryParams {
  page: number
  pageSize: number
  status?: EmployeeStatus
  keyword?: string
  department?: string
}

export interface DemoEmployee extends Employee {
  employee_no?: string
  performance?: number
  target?: number
  hire_date?: string
}

// 员工表单（新增 / 编辑共用）
export interface EmployeeFormValues {
  fullName: string
  email: string
  phone: string
  department: string
  position: string
  password: string
  isActive: boolean
}

export interface EmployeeStats {
  totalEmp: number
  topName: string
  topPerf: number
  avg: number
  /** 全员累计业绩（后端全局汇总） */
  totalPerf: number
}
