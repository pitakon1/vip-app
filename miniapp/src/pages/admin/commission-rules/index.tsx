import { useEffect, useMemo, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { commissionRulesApi, brokerApi, employeesApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
import type { User } from '@/types'
import './index.scss'

/** 适用对象（对齐 Web 端 CommissionRules） */
const SCOPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all_employees', label: '全体员工' },
  { value: 'by_department', label: '部门' },
  { value: 'by_employee', label: '员工' },
  { value: 'by_broker', label: '分销商' },
  { value: 'broker_employee', label: '分销商员工' }
]

const SCOPE_META: Record<string, string> = {
  all_employees: '适用于全体员工',
  by_department: '按部门配置差异化费率',
  by_employee: '按员工配置差异化费率',
  by_broker: '按分销商（渠道商）差异化定价',
  broker_employee: '按分销商下属员工差异化定价'
}

interface Rule {
  id: string
  name: string
  rate: number
  scope: string
  department?: string | null
  employee_id?: string | null
  broker_id?: string | null
}

interface Broker {
  id: string
  partner_name?: string
  name?: string
}

interface Employee {
  id: string
  full_name?: string
  name?: string
  department?: string | null
  broker_id?: string | null
}

/** 列表项右侧具体名称（分销商 / 员工 / 部门），取自关联对象，避免只显示 scope 类型 */
function scopeDetail(rule: Rule, brokers: Broker[], employees: Employee[]) {
  if (rule.scope === 'by_department') return rule.department || '—'
  if (rule.scope === 'by_employee') {
    const e = employees.find((x) => x.id === rule.employee_id)
    return e ? (e.full_name || e.name) || rule.employee_id! : rule.employee_id || '—'
  }
  if (rule.scope === 'by_broker') {
    const b = brokers.find((x) => x.id === rule.broker_id)
    return b ? (b.partner_name || b.name) || rule.broker_id! : rule.broker_id || '—'
  }
  return ''
}

export default function CommissionRulesPage() {
  const role = useAuthStore((s) => s.user as User | null)?.role
  const isAdmin = role === 'admin'

  const [rules, setRules] = useState<Rule[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // 表单
  const [showSheet, setShowSheet] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    rate: '',
    scope: 'all_employees',
    department: '',
    employee_id: '',
    broker_id: '',
    broker_employee_id: ''
  })

  // 可搜索选择面板
  const [picker, setPicker] = useState<{ type: 'broker' | 'employee' | 'broker_employee'; keyword: string } | null>(null)

  const set = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }))

  /** 选择「分销商员工」时若切换分销商，需重置下属员工选择 */
  const pickScope = (v: string) => {
    setForm((p) => ({ ...p, scope: v, broker_employee_id: '' }))
  }

  const load = async () => {
    setLoading(true)
    try {
      const tmpl = await Promise.allSettled([
        commissionRulesApi.list({ page: 1, page_size: 100 }), // 返回 {items}|[]
        brokerApi.list({ page: 1, page_size: 200 }),
        employeesApi.list({ page: 1, page_size: 200 })
      ])
      const rulesRes = tmpl[0].status === 'fulfilled' ? (tmpl[0].value as any) : null
      const brokerRes = tmpl[1].status === 'fulfilled' ? (tmpl[1].value as any) : null
      const empRes = tmpl[2].status === 'fulfilled' ? (tmpl[2].value as any) : null
      const unwrap = (d: any) => (Array.isArray(d) ? d : d?.items || [])
      setRules(unwrap(rulesRes))
      setBrokers(unwrap(brokerRes))
      setEmployees(unwrap(empRes))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  /** 选项对应的可选分销商（admin 全量；分销商管理员应为空=本渠道，由后端鉴权） */
  const brokerCandidates = useMemo(() => brokers, [brokers])
  /** 员工候选（普通员工选用）；分销商员工时按所选分销商过滤 */
  const allEmployees = useMemo(() => employees, [employees])
  const brokerEmployees = useMemo(
    () => (form.broker_id ? employees.filter((e) => e.broker_id === form.broker_id) : []),
    [employees, form.broker_id]
  )

  const openNew = () => {
    setEditingId(null)
    setForm({
      name: '',
      rate: '',
      scope: 'all_employees',
      department: '',
      employee_id: '',
      broker_id: '',
      broker_employee_id: ''
    })
    setShowSheet(true)
  }

  const openEdit = (rule: Rule) => {
    setEditingId(rule.id)
    setForm({
      name: rule.name,
      rate: String(rule.rate ?? ''),
      scope: rule.broker_id && rule.scope === 'by_employee' ? 'broker_employee' : rule.scope === 'by_broker' && rule.broker_id ? 'by_broker' : rule.scope,
      department: rule.department || '',
      employee_id: rule.employee_id || '',
      broker_id: rule.broker_id || '',
      broker_employee_id: rule.employee_id || ''
    })
    setShowSheet(true)
  }

  const closeSheet = () => {
    setShowSheet(false)
    setPicker(null)
  }

  const submit = async () => {
    if (!form.name.trim()) return Taro.showToast({ title: '请输入规则名称', icon: 'none' })
    if (form.rate === '' || Number(form.rate) < 0)
      return Taro.showToast({ title: '请输入正确的费率', icon: 'none' })
    if (form.scope === 'by_department' && !form.department.trim())
      return Taro.showToast({ title: '请输入部门名称', icon: 'none' })
    if (form.scope === 'by_employee' && !form.employee_id)
      return Taro.showToast({ title: '请选择员工', icon: 'none' })
    if (form.scope === 'broker_employee' && !form.broker_id)
      return Taro.showToast({ title: '请先选择分销商', icon: 'none' })
    if (form.scope === 'broker_employee' && !form.broker_employee_id)
      return Taro.showToast({ title: '请选择该分销商的员工', icon: 'none' })
    if (form.scope === 'by_broker' && isAdmin && !form.broker_id)
      return Taro.showToast({ title: '请选择分销商', icon: 'none' })

    const payload: Record<string, unknown> = {
      name: form.name,
      rate: Number(form.rate),
      scope: form.scope === 'broker_employee' ? 'by_employee' : form.scope
    }
    if (form.scope === 'by_department') payload.department = form.department
    if (form.scope === 'by_employee') payload.employee_id = form.employee_id
    if (form.scope === 'by_broker' && isAdmin) payload.broker_id = form.broker_id
    if (form.scope === 'broker_employee') {
      payload.employee_id = form.broker_employee_id
      if (isAdmin) payload.broker_id = form.broker_id
    }

    try {
      if (editingId) await commissionRulesApi.update(editingId, payload)
      else await commissionRulesApi.create(payload)
      Taro.showToast({ title: '已保存', icon: 'success' })
      closeSheet()
      load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' })
    }
  }

  const remove = async (rule: Rule) => {
    const res = await Taro.showModal({ title: '删除确认', content: `确定删除「${rule.name}」吗？` })
    if (!res.confirm) return
    try {
      await commissionRulesApi.remove(rule.id)
      Taro.showToast({ title: '已删除', icon: 'success' })
      load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '删除失败', icon: 'none' })
    }
  }

  /** 打开对应可搜索选择器 */
  const openPicker = (type: 'broker' | 'employee' | 'broker_employee') => {
    setPicker({ type, keyword: '' })
  }

  /** 选择器过滤后的候选 */
  const pickerOptions = () => {
    if (!picker) return []
    const kw = picker.keyword.trim().toLowerCase()
    if (picker.type === 'broker') {
      const list = isAdmin ? brokerCandidates : brokerCandidates.filter((b) => b.id === form.broker_id)
      return list.filter((b) => ((b.partner_name || b.name) || '').toLowerCase().includes(kw))
    }
    if (picker.type === 'employee') {
      return allEmployees.filter((e) => ((e.full_name || e.name) || '').toLowerCase().includes(kw))
    }
    return brokerEmployees.filter((e) => ((e.full_name || e.name) || '').toLowerCase().includes(kw))
  }

  const pickerTitle =
    picker?.type === 'broker'
      ? isAdmin
        ? '选择分销商'
        : '本渠道'
      : picker?.type === 'employee'
        ? '选择员工'
        : '选择该分销商的员工'

  const pickOption = (o: { id: string; label: string }) => {
    if (!picker) return
    if (picker.type === 'broker') {
      set('broker_id', o.id)
      set('broker_employee_id', '') // 切换分销商后重置其下属员工
    } else if (picker.type === 'employee') {
      set('employee_id', o.id)
    } else {
      set('broker_employee_id', o.id)
    }
    setPicker(null)
  }

  return (
    <View className='cr-page'>
      <View className='cr-page__hint'>
        按交易类型与适用对象配置员工佣金比例（支持分销商差异化定价）。结算时按「员工 &gt; 部门 &gt; 分销商 &gt; 全局 &gt; 默认」优先级匹配。
      </View>

      {loading ? (
        <View className='cr-state'><Text className='cr-state__text'>加载中…</Text></View>
      ) : rules.length === 0 ? (
        <View className='cr-state'><Text className='cr-state__text'>暂无佣金规则，点击下方「新增」创建</Text></View>
      ) : (
        <View className='cr-list'>
          {rules.map((rule) => (
            <View className='cr-rule' key={rule.id}>
              <View className='cr-rule__head'>
                <Text className='cr-rule__name'>{rule.name}</Text>
                <Text className='cr-rule__rate'>{Number(rule.rate ?? 0)}%</Text>
              </View>
              <View className='cr-rule__scope'>{SCOPE_OPTIONS.find((o) => o.value === rule.scope)?.label || rule.scope}</View>
              {scopeDetail(rule, brokers, employees) && (
                <View className='cr-rule__detail'>{scopeDetail(rule, brokers, employees)}</View>
              )}
              <View className='cr-rule__actions'>
                <View className='cr-rule__btn cr-rule__btn--edit' onClick={() => openEdit(rule)}>编辑</View>
                <View className='cr-rule__btn cr-rule__btn--del' onClick={() => remove(rule)}>删除</View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 底部新增 */}
      <View className='cr-footer'>
        <View className='cr-addbtn' onClick={openNew}>新增佣金规则</View>
      </View>

      {/* ===== 表单面板 ===== */}
      {showSheet && (
        <>
          <View className='cr-mask' onClick={closeSheet} />
          <View className='cr-sheet'>
            <Text className='cr-sheet__title'>{editingId ? '编辑规则' : '新增规则'}</Text>

            <View className='cr-field'>
              <Text className='cr-field__label cr-field__label--req'>规则名称</Text>
              <Input
                className='cr-field__input'
                value={form.name}
                placeholder='如：招商奖励 / 海外业绩提成'
                onInput={(e) => set('name', e.detail.value)}
              />
            </View>

            <View className='cr-field'>
              <Text className='cr-field__label cr-field__label--req'>费率（%）</Text>
              <Input
                className='cr-field__input'
                type='digit'
                value={form.rate}
                placeholder='如 5 表示 5%'
                onInput={(e) => set('rate', e.detail.value)}
              />
            </View>

            <View className='cr-field'>
              <Text className='cr-field__label cr-field__label--req'>适用对象</Text>
              <View
                className='cr-field__select'
                onClick={() => Taro.showActionSheet({ itemList: SCOPE_OPTIONS.map((o) => o.label) }).then((r) => {
                  const opt = SCOPE_OPTIONS[r.tapIndex]
                  if (opt) pickScope(opt.value)
                })}
              >
                <Text>{SCOPE_OPTIONS.find((o) => o.value === form.scope)?.label || form.scope}</Text>
                <Text className='cr-field__tag'>▾</Text>
              </View>
              <Text className='cr-field__tag'>{SCOPE_META[form.scope]}</Text>
            </View>

            {form.scope === 'by_department' && (
              <View className='cr-field'>
                <Text className='cr-field__label cr-field__label--req'>部门名称</Text>
                <Input
                  className='cr-field__input'
                  value={form.department}
                  placeholder='输入部门，按部门匹配'
                  onInput={(e) => set('department', e.detail.value)}
                />
              </View>
            )}

            {form.scope === 'by_employee' && (
              <View className='cr-field'>
                <Text className='cr-field__label cr-field__label--req'>员工</Text>
                <View className='cr-field__select' onClick={() => openPicker('employee')}>
                  <Text className={form.employee_id ? '' : 'cr-field__select--placeholder'}>
                    {form.employee_id
                      ? employees.find((e) => e.id === form.employee_id)
                        ? (employees.find((e) => e.id === form.employee_id)!.full_name || '已选员工')
                        : '已选员工'
                      : '搜索选择员工'}
                  </Text>
                  <Text className='cr-field__tag'>▾</Text>
                </View>
              </View>
            )}

            {form.scope === 'by_broker' && (
              <View className='cr-field'>
                <Text className='cr-field__label cr-field__label--req'>分销商</Text>
                <View className='cr-field__select' onClick={() => openPicker('broker')}>
                  <Text className={form.broker_id ? '' : 'cr-field__select--placeholder'}>
                    {form.broker_id
                      ? ((brokers.find((b) => b.id === form.broker_id)?.partner_name) || '已选分销商')
                      : isAdmin ? '搜索选择分销商' : '本渠道（默认）'}
                  </Text>
                  <Text className='cr-field__tag'>▾</Text>
                </View>
              </View>
            )}

            {form.scope === 'broker_employee' && (
              <>
                <View className='cr-field'>
                  <Text className='cr-field__label cr-field__label--req'>分销商</Text>
                  <View className='cr-field__select' onClick={() => openPicker('broker')}>
                    <Text className={form.broker_id ? '' : 'cr-field__select--placeholder'}>
                      {form.broker_id
                        ? ((brokers.find((b) => b.id === form.broker_id)?.partner_name) || '已选分销商')
                        : isAdmin ? '搜索选择分销商' : '本渠道（默认）'}
                    </Text>
                    <Text className='cr-field__tag'>▾</Text>
                  </View>
                </View>
                <View className='cr-field'>
                  <Text className='cr-field__label cr-field__label--req'>该分销商的员工</Text>
                  <View className='cr-field__select' onClick={() => openPicker('broker_employee')}>
                    <Text className={form.broker_employee_id ? '' : 'cr-field__select--placeholder'}>
                      {form.broker_employee_id
                        ? ((employees.find((e) => e.id === form.broker_employee_id)?.full_name) || '已选员工')
                        : form.broker_id ? '搜索选择该分销商的员工' : '请先选择分销商'}
                    </Text>
                    <Text className='cr-field__tag'>▾</Text>
                  </View>
                </View>
              </>
            )}

            <View className='cr-submit' onClick={submit}>保存</View>
          </View>
        </>
      )}

      {/* ===== 可搜索选择面板 ===== */}
      {picker && (
        <View className='cr-picker' onClick={() => setPicker(null)}>
          <View className='cr-picker__panel' onClick={(e) => e.stopPropagation()}>
            <Text className='cr-picker__title'>{pickerTitle}</Text>
            <Input
              className='cr-picker__search'
              autoFocus
              value={picker.keyword}
              placeholder='搜索'
              onInput={(e) => setPicker({ type: picker.type, keyword: e.detail.value })}
            />
            <View className='cr-picker__list'>
              {pickerOptions().length === 0 ? (
                <View className='cr-picker__empty'><Text>未找到匹配项</Text></View>
              ) : (
                pickerOptions().map((o: any) => {
                  const id = o.id
                  const label = picker.type === 'broker' ? (o.partner_name || o.name) : (o.full_name || o.name)
                  const selected = picker.type === 'broker'
                    ? form.broker_id === id
                    : picker.type === 'employee'
                      ? form.employee_id === id
                      : form.broker_employee_id === id
                  return (
                    <View key={id} className={`cr-picker__opt${selected ? ' cr-picker__opt--active' : ''}`} onClick={() => pickOption({ id, label })}>
                      <Text>{label}</Text>
                      {picker.type !== 'broker' && o.department && <View className='cr-picker__opt-sub'><Text>{o.department}</Text></View>}
                    </View>
                  )
                })
              )}
            </View>
            <View className='cr-picker__cancel' onClick={() => setPicker(null)}>取消</View>
          </View>
        </View>
      )}
    </View>
  )
}