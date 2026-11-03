import { useEffect, useMemo, useState } from 'react'
import { employeesApi } from '@/services/api'

/** 员工目录：assigned_to 存的是 employees.id，表单与列表都需要展示真实姓名 */
export function useEmployeeDirectory() {
  const [employeeOptions, setEmployeeOptions] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    employeesApi
      .directory()
      .then((res) => {
        const payload = res.data?.data ?? res.data
        const items: any[] = payload?.items ?? []
        setEmployeeOptions(
          items.map((e) => ({
            id: String(e.id),
            name: e.full_name || e.employee_no || String(e.id),
          })),
        )
      })
      .catch(() => {
        // 目录不可用时保持空列表，表单退化为「未分配」
      })
  }, [])

  const employeeNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    employeeOptions.forEach((e) => {
      map[e.id] = e.name
    })
    return map
  }, [employeeOptions])

  return { employeeOptions, employeeNameMap }
}
