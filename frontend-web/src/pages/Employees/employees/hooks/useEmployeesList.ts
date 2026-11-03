import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { apiErrorBody } from '@/lib/api'
import { employeesApi } from '@/services/api'
import type { Employee, EmployeeStatus } from '@/types'
import type { DemoEmployee, EmployeeStats, QueryParams } from '../types'

/** 员工列表：查询 / 排序 / 统计 / 分页 / 部门下拉 */
export const useEmployeesList = () => {
  const { t } = useTranslation()

  const [data, setData] = useState<Employee[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [leaderboard, setLeaderboard] = useState<Employee[]>([])
  const [, setLeaderLoading] = useState(false)
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    pageSize: 10,
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await employeesApi.list({
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        status: queryParams.status,
        keyword: queryParams.keyword,
        department: queryParams.department,
      })
      const payload = res.data?.data ?? res.data
      setData(payload?.items ?? [])
      setTotal(payload?.total ?? 0)
    } catch (err) {
      message.error(apiErrorBody(err)?.message || t('employees.errFetch'))
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  const fetchLeaderboard = useCallback(async () => {
    setLeaderLoading(true)
    try {
      const res = await employeesApi.leaderboard()
      const payload = res.data?.data ?? res.data
      setLeaderboard(payload?.items ?? payload ?? [])
    } catch (err) {
      // 排行榜加载失败不弹错误，避免干扰主列表
      setLeaderboard([])
    } finally {
      setLeaderLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  const handleStatusChange = (value: EmployeeStatus | undefined) => {
    setQueryParams((p) => ({ ...p, status: value, page: 1 }))
  }

  const handleDepartmentChange = (value: string) => {
    // 部门清单来自真实数据（见 departments），过滤下推到服务端
    setQueryParams((p) => ({ ...p, department: value || undefined, page: 1 }))
  }

  const handleSortChange = (value: string) => {
    setSortBy(value)
  }

  const [keywordInput, setKeywordInput] = useState('')
  const [sortBy, setSortBy] = useState('perf-desc')
  const [departments, setDepartments] = useState<string[]>([])

  // 搜索框防抖：此前每次按键都会发一次请求
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQueryParams((p) => {
        const next = keywordInput.trim() || undefined
        if (p.keyword === next) return p
        return { ...p, keyword: next, page: 1 }
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [keywordInput])

  // 部门下拉用真实部门值（此前用「sales→销售部」的硬编码映射，与后端存的英文值对不上，永远筛不出数据）
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await employeesApi.directory()
      const payload = res.data?.data ?? res.data
      setDepartments(payload?.departments ?? [])
    } catch {
      setDepartments([])
    }
  }, [])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  // 业绩按员工 id 合并（系统自动核算的佣金数据）
  const perfMap = useMemo(() => {
    const m: Record<string, { performance: number; deals: number }> = {}
    ;(leaderboard || []).forEach((item: any) => {
      if (item?.id) {
        m[String(item.id)] = {
          performance: Number(item.performance || 0),
          deals: Number(item.deals || 0),
        }
      }
    })
    return m
  }, [leaderboard])

  const listData = useMemo<DemoEmployee[]>(() => {
    const source: DemoEmployee[] = (data || []).map((e: any) => {
      const perf = perfMap[String(e.id)]
      return {
        ...e,
        performance: perf?.performance ?? 0,
        deals: perf?.deals ?? 0,
      }
    })
    const sorted = [...source]
    switch (sortBy) {
      case 'perf-desc':
        sorted.sort((a, b) => Number(b.performance || 0) - Number(a.performance || 0))
        break
      case 'perf-asc':
        sorted.sort((a, b) => Number(a.performance || 0) - Number(b.performance || 0))
        break
      case 'joined-desc':
        sorted.sort((a, b) => (b.hire_date || '').localeCompare(a.hire_date || ''))
        break
      case 'id-asc':
        sorted.sort((a, b) => (a.employee_no || '').localeCompare(b.employee_no || ''))
        break
      default:
        break
    }
    return sorted
  }, [data, sortBy, perfMap])

  const totalDisplay = total

  // 统计指标
  const stats = useMemo<EmployeeStats>(() => {
    const source = listData
    const totalEmp = totalDisplay
    const top = [...source].sort(
      (a, b) => Number(b.performance || 0) - Number(a.performance || 0),
    )[0]
    const avg =
      source.reduce((sum, e) => sum + Number(e.performance || 0), 0) /
      (source.length || 1)
    const totalTarget = source.reduce(
      (sum, e) => sum + Number(e.target || 100000),
      0,
    )
    const totalPerf = source.reduce(
      (sum, e) => sum + Number(e.performance || 0),
      0,
    )
    const completion = totalTarget > 0 ? Math.round((totalPerf / totalTarget) * 100) : 0
    return {
      totalEmp,
      topName: top?.full_name || '-',
      topPerf: Number(top?.performance || 0),
      avg: Math.round(avg),
      completion: Math.min(completion, 100),
    }
  }, [listData, totalDisplay])

  const totalPages = Math.max(1, Math.ceil(totalDisplay / queryParams.pageSize))

  // 分页页码（对齐原型 rent-pagination 结构，窗口式页码）
  const pageNumbers: (number | string)[] = useMemo(() => {
    const nums: (number | string)[] = []
    const page = queryParams.page
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i)
    } else {
      nums.push(1)
      if (page > 4) nums.push('prev-ellipsis')
      const start = Math.max(2, page - 1)
      const end = Math.min(totalPages - 1, page + 1)
      for (let i = start; i <= end; i++) nums.push(i)
      if (page < totalPages - 3) nums.push('next-ellipsis')
      nums.push(totalPages)
    }
    return nums
  }, [queryParams.page, totalPages])

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return {
    queryParams,
    setQueryParams,
    keywordInput,
    setKeywordInput,
    sortBy,
    departments,
    data,
    loading,
    fetchData,
    fetchDepartments,
    handleStatusChange,
    handleDepartmentChange,
    handleSortChange,
    listData,
    totalDisplay,
    stats,
    totalPages,
    pageNumbers,
    todayStr,
  }
}
