// 将 API 状态映射到设计稿显示状态
export const getStatusBadge = (status: string): { cls: string; text: string } => {
  const s = (status || '').toLowerCase()
  if (s === 'active' || s === '在职') return { cls: 'rent-badge--success', text: 'employees.stActive' }
  if (s === 'probation' || s === '试用期') return { cls: 'rent-badge--warning', text: 'employees.stProbation' }
  if (s === 'inactive' || s === 'resigned' || s === '离职') return { cls: 'rent-badge--neutral', text: 'employees.stInactive' }
  return { cls: 'rent-badge--neutral', text: status || '-' }
}
