import { useCallback, useEffect, useState } from 'react'
import {
  Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Space,
  Table, Tabs, Tag, message,
} from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { errorText } from '@/lib/errorText'

type TabKey =
  | 'dashboard' | 'settlements' | 'rules' | 'reviews'
  | 'properties' | 'leads' | 'business' | 'ops'

const unwrap = (res: any) => res?.data?.data ?? res?.data
const dt = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—')
const d = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '—')

function useRows<T = any>(url: string, params?: Record<string, any>) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(url, { params })
      const payload = unwrap(res)
      setRows(Array.isArray(payload) ? payload : payload?.items ?? [])
    } catch (err: any) {
      setError(errorText(err, '加载失败'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [url, JSON.stringify(params || {})])
  useEffect(() => { load() }, [load])
  return { rows, loading, error, reload: load }
}

function Card({ title, extra, children }: { title: string; extra?: any; children: any }) {
  return (
    <div className="rent-card" style={{ marginBottom: 16 }}>
      <div className="rent-card__header">
        <h3 className="rent-card__title">{title}</h3>
        {extra}
      </div>
      <div className="rent-card__body">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A1 经营驾驶舱
// ---------------------------------------------------------------------------
function DashboardTab() {
  const [month, setMonth] = useState(dayjs())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/partner/dashboard', { params: { month: month.format('YYYY-MM') } })
      setData(unwrap(res))
    } catch (err: any) {
      message.error(errorText(err, '加载看板失败'))
    } finally {
      setLoading(false)
    }
  }, [month])
  useEffect(() => { load() }, [load])

  const s = data?.stats ?? {}
  const stats = [
    { k: '成交单数', v: s.deals ?? 0 },
    { k: '成交额', v: formatMoney(s.revenue) },
    { k: '佣金应收', v: formatMoney(s.receivable) },
    { k: '已结佣金', v: formatMoney(s.paid) },
    { k: '待结佣金', v: formatMoney(s.pending) },
    { k: '活跃经纪人', v: s.active_agents ?? 0 },
    { k: '在售房源', v: s.properties ?? 0 },
  ]
  const monthly: any[] = data?.monthly ?? []
  const maxRevenue = Math.max(1, ...monthly.map((m) => m.revenue || 0))

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <span>统计月份</span>
        <DatePicker picker="month" value={month} onChange={(v) => v && setMonth(v)} allowClear={false} />
        <Button onClick={load} loading={loading}>刷新</Button>
      </Space>
      <div className="rent-grid rent-grid--4" style={{ marginBottom: 16 }}>
        {stats.map((x) => (
          <div className="rent-stat-card" key={x.k}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{x.k}</div>
                <div className="rent-stat-card__value rent-num">{x.v}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card title="近 12 个月业绩趋势">
        {monthly.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 180 }}>
            {monthly.map((m: any) => (
              <div key={`${m.year}-${m.month}`} style={{ flex: 1, textAlign: 'center' }}>
                <div
                  title={`成交额 ${formatMoney(m.revenue)} / 佣金 ${formatMoney(m.commission)}`}
                  style={{
                    height: Math.max(4, (Number(m.revenue || 0) / maxRevenue) * 140),
                    background: 'var(--rent-primary)',
                    borderRadius: 4,
                  }}
                />
                <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
                  {m.month}月
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="rent-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="经纪人业绩排行">
          <Table
            size="small" rowKey="employee_id" pagination={false}
            dataSource={data?.agent_ranking ?? []}
            columns={[
              { title: '经纪人', dataIndex: 'employee_name', render: (v: string) => v || '—' },
              { title: '成交额', dataIndex: 'revenue', render: (v: number) => formatMoney(v) },
              { title: '佣金', dataIndex: 'commission', render: (v: number) => formatMoney(v) },
              { title: '单数', dataIndex: 'deals' },
            ]}
          />
        </Card>
        <Card title="房源贡献排行">
          <Table
            size="small" rowKey="user_id" pagination={false}
            dataSource={data?.property_ranking ?? []}
            columns={[
              { title: '成员', dataIndex: 'name', render: (v: string) => v || '—' },
              { title: '房源数', dataIndex: 'count' },
            ]}
          />
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A2 佣金对账单
// ---------------------------------------------------------------------------
function SettlementsTab() {
  const [range, setRange] = useState<[any, any] | null>(null)
  const [status, setStatus] = useState<string | undefined>()
  const [employeeId, setEmployeeId] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const params: any = {
    start: range?.[0]?.format('YYYY-MM-DD'),
    end: range?.[1]?.format('YYYY-MM-DD'),
    status, employee_id: employeeId, page, page_size: 20,
  }
  const { rows, loading, error, reload } = useRows<any>('/partner/settlements', params)
  const { rows: members } = useRows<any>('/partner/members')
  const [total, setTotal] = useState(0)
  useEffect(() => {
    api.get('/partner/settlements', { params }).then((res) => setTotal(unwrap(res)?.total ?? 0)).catch(() => {})
  }, [JSON.stringify(params)])

  const exportCsv = async () => {
    try {
      const res = await api.get('/partner/settlements/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `partner-settlements-${dayjs().format('YYYYMMDD')}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      message.error(errorText(err, '导出失败'))
    }
  }

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker.RangePicker value={range as any} onChange={(v) => setRange(v as any)} />
        <Select
          allowClear placeholder="结算状态" style={{ width: 140 }} value={status} onChange={setStatus}
          options={[
            { value: 'pending', label: '待结算' },
            { value: 'approved', label: '已审批' },
            { value: 'paid', label: '已到账' },
          ]}
        />
        <Select
          allowClear placeholder="经纪人" style={{ width: 180 }} value={employeeId} onChange={setEmployeeId}
          options={members.filter((m: any) => m.employee_id).map((m: any) => ({ value: m.employee_id, label: m.full_name || m.email }))}
        />
        <Button onClick={reload} loading={loading}>查询</Button>
        <Button type="primary" onClick={exportCsv}>导出 CSV</Button>
      </Space>
      <Card title={`结算单明细（共 ${total} 条）`}>
        <Table
          size="small" rowKey="id" loading={loading} dataSource={rows}
          locale={{ emptyText: error || '暂无结算单' }}
          pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
          columns={[
            { title: '结算时间', dataIndex: 'created_at', render: dt },
            { title: '经纪人', dataIndex: 'employee_name', render: (v: string) => v || '—' },
            { title: '成交类型', dataIndex: 'deal_type' },
            { title: '角色', dataIndex: 'role' },
            { title: '佣金基数', dataIndex: 'commission_base', render: (v: number) => formatMoney(v) },
            { title: '比例/费率', dataIndex: 'commission_rate', render: (v: number) => `${v}%` },
            { title: '佣金金额', dataIndex: 'commission_amount', render: (v: number) => formatMoney(v) },
            {
              title: '状态', dataIndex: 'status',
              render: (v: string) => <Tag color={v === 'paid' ? 'green' : v === 'approved' ? 'blue' : 'orange'}>{v}</Tag>,
            },
            { title: '到账时间', dataIndex: 'paid_at', render: dt },
          ]}
        />
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A3 佣金规则
// ---------------------------------------------------------------------------
function RulesTab() {
  const { rows, loading, error } = useRows<any>('/partner/commission-rules')
  return (
    <Card title="适用于本公司的分成规则（只读）">
      <Table
        size="small" rowKey="id" loading={loading} dataSource={rows}
        locale={{ emptyText: error || '暂无规则' }} pagination={false}
        columns={[
          { title: '成交类型', dataIndex: 'deal_type' },
          { title: '角色', dataIndex: 'role' },
          { title: '分成比例', dataIndex: 'percent', render: (v: number) => `${v}%` },
          {
            title: '适用范围', dataIndex: 'scope',
            render: (v: string) => <Tag color={v === 'all' ? 'blue' : 'purple'}>{v === 'all' ? '全局' : '本公司专属'}</Tag>,
          },
          { title: '生效时间', dataIndex: 'effective_from', render: d },
          { title: '失效时间', dataIndex: 'effective_to', render: d },
        ]}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// C1/C2 审批与排班
// ---------------------------------------------------------------------------
function ReviewsTab() {
  const { rows: trips, loading: l1, reload: r1 } = useRows<any>('/partner/trips')
  const { rows: appeals, loading: l2, reload: r2 } = useRows<any>('/partner/appeals')
  const { rows: members } = useRows<any>('/partner/members')
  const [shiftEmp, setShiftEmp] = useState<string | undefined>()
  const [shiftRange, setShiftRange] = useState<[any, any] | null>(null)
  const { rows: shifts, loading: l3, reload: r3 } = useRows<any>('/partner/shifts', {
    start: shiftRange?.[0]?.format('YYYY-MM-DD'),
    end: shiftRange?.[1]?.format('YYYY-MM-DD'),
    employee_id: shiftEmp,
  })
  const [form] = Form.useForm()

  const review = async (kind: 'trips' | 'appeals', id: string, approved: boolean) => {
    try {
      await api.post(`/partner/${kind}/${id}/review`, { approved })
      message.success(approved ? '已通过' : '已驳回')
      kind === 'trips' ? r1() : r2()
    } catch (err: any) {
      message.error(errorText(err, '操作失败'))
    }
  }

  const saveShift = async () => {
    try {
      const v = await form.validateFields()
      await api.post('/partner/shifts', {
        items: [{
          employee_id: v.employee_id,
          date: v.date.format('YYYY-MM-DD'),
          start_time: v.start_time,
          end_time: v.end_time,
          note: v.note,
        }],
      })
      message.success('排班已保存')
      form.resetFields(['date', 'note'])
      r3()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(errorText(err, '保存失败'))
    }
  }

  return (
    <Tabs
      items={[
        {
          key: 'trips', label: `外勤审批 (${trips.length})`,
          children: (
            <Table
              size="small" rowKey="id" loading={l1} dataSource={trips} pagination={false}
              locale={{ emptyText: '暂无外勤申请' }}
              columns={[
                { title: '员工', dataIndex: 'employee_name', render: (v: string) => v || '—' },
                { title: '日期', dataIndex: 'trip_date', render: d },
                { title: '行程', render: (_: any, r: any) => `${r.from_location || '—'} → ${r.to_location || '—'}` },
                { title: '事由', dataIndex: 'reason' },
                { title: '状态', dataIndex: 'status' },
                {
                  title: '操作', render: (_: any, r: any) => r.status === 'pending' ? (
                    <Space>
                      <Button size="small" type="primary" onClick={() => review('trips', r.id, true)}>通过</Button>
                      <Button size="small" danger onClick={() => review('trips', r.id, false)}>驳回</Button>
                    </Space>
                  ) : '—',
                },
              ]}
            />
          ),
        },
        {
          key: 'appeals', label: `打卡申诉 (${appeals.length})`,
          children: (
            <Table
              size="small" rowKey="id" loading={l2} dataSource={appeals} pagination={false}
              locale={{ emptyText: '暂无申诉' }}
              columns={[
                { title: '员工', dataIndex: 'employee_name', render: (v: string) => v || '—' },
                { title: '日期', dataIndex: 'date', render: d },
                { title: '申诉原因', dataIndex: 'reason' },
                { title: '状态', dataIndex: 'status' },
                {
                  title: '操作', render: (_: any, r: any) => r.status === 'pending' ? (
                    <Space>
                      <Button size="small" type="primary" onClick={() => review('appeals', r.id, true)}>通过</Button>
                      <Button size="small" danger onClick={() => review('appeals', r.id, false)}>驳回</Button>
                    </Space>
                  ) : '—',
                },
              ]}
            />
          ),
        },
        {
          key: 'shifts', label: '排班管理',
          children: (
            <div>
              <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
                <Form.Item name="employee_id" rules={[{ required: true, message: '选择员工' }]}>
                  <Select placeholder="员工" style={{ width: 180 }} options={members.filter((m: any) => m.employee_id).map((m: any) => ({ value: m.employee_id, label: m.full_name || m.email }))} />
                </Form.Item>
                <Form.Item name="date" rules={[{ required: true, message: '选择日期' }]}>
                  <DatePicker placeholder="日期" />
                </Form.Item>
                <Form.Item name="start_time" initialValue="09:00"><Input style={{ width: 90 }} placeholder="09:00" /></Form.Item>
                <Form.Item name="end_time" initialValue="18:00"><Input style={{ width: 90 }} placeholder="18:00" /></Form.Item>
                <Form.Item name="note"><Input placeholder="备注" style={{ width: 140 }} /></Form.Item>
                <Button type="primary" onClick={saveShift}>保存排班</Button>
              </Form>
              <Space style={{ marginBottom: 12 }}>
                <DatePicker.RangePicker value={shiftRange as any} onChange={(v) => setShiftRange(v as any)} />
                <Select
                  allowClear placeholder="按员工筛选" style={{ width: 180 }} value={shiftEmp} onChange={setShiftEmp}
                  options={members.filter((m: any) => m.employee_id).map((m: any) => ({ value: m.employee_id, label: m.full_name || m.email }))}
                />
              </Space>
              <Table
                size="small" rowKey="id" loading={l3} dataSource={shifts} pagination={false}
                locale={{ emptyText: '暂无排班' }}
                columns={[
                  { title: '员工', dataIndex: 'employee_name', render: (v: string) => v || '—' },
                  { title: '日期', dataIndex: 'date', render: d },
                  { title: '上班', dataIndex: 'start_time' },
                  { title: '下班', dataIndex: 'end_time' },
                  { title: '备注', dataIndex: 'note' },
                ]}
              />
            </div>
          ),
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------------
// D1 授权房源
// ---------------------------------------------------------------------------
function PropertiesTab() {
  const [page, setPage] = useState(1)
  const { rows, loading, error } = useRows<any>('/partner/available-properties', { page, page_size: 20 })
  return (
    <Card title="平台授权代销房源">
      <Table
        size="small" rowKey="id" loading={loading} dataSource={rows} pagination={false}
        locale={{ emptyText: error || '暂无授权房源，请联系平台授权' }}
        columns={[
          { title: '地址', dataIndex: 'address', render: (v: string) => v || '—' },
          { title: '类型', dataIndex: 'property_type' },
          { title: '户型', render: (_: any, r: any) => `${r.bedrooms ?? '-'} 室 / ${r.bathrooms ?? '-'} 卫` },
          { title: '面积', dataIndex: 'size_sqm', render: (v: number) => (v ? `${v} ㎡` : '—') },
          { title: '月租', dataIndex: 'monthly_rent', render: (v: number) => formatMoney(v) },
          { title: '状态', dataIndex: 'status', render: (v: string) => (v ? <Tag>{v}</Tag> : '—') },
          { title: '授权到期', dataIndex: 'expires_at', render: (v: string) => (v ? d(v) : '长期') },
        ]}
      />
      <Space style={{ marginTop: 12 }}>
        <Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>上一页</Button>
        <span>第 {page} 页</span>
        <Button onClick={() => setPage((p) => p + 1)} disabled={rows.length < 20}>下一页</Button>
      </Space>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// D2/D3 线索、报备与带看
// ---------------------------------------------------------------------------
function LeadsTab() {
  const { rows: leads, loading, reload } = useRows<any>('/partner/leads')
  const { rows: claims, loading: cl, reload: cr } = useRows<any>('/partner/claims')
  const { rows: viewings, loading: vl, reload: vr } = useRows<any>('/partner/viewings')
  const { rows: members } = useRows<any>('/partner/members')
  const [assignLead, setAssignLead] = useState<any>(null)
  const [assignViewing, setAssignViewing] = useState<any>(null)
  const [assignEmp, setAssignEmp] = useState<string | undefined>()
  const [claimForm] = Form.useForm()
  const empOptions = members.filter((m: any) => m.employee_id).map((m: any) => ({ value: m.employee_id, label: m.full_name || m.email }))

  const doAssignLead = async () => {
    if (!assignEmp) return
    try {
      await api.post(`/partner/leads/${assignLead.id}/assign`, { employee_id: assignEmp })
      message.success('已分配')
      setAssignLead(null); setAssignEmp(''); reload()
    } catch (err: any) { message.error(errorText(err, '分配失败')) }
  }
  const doAssignViewing = async () => {
    if (!assignEmp) return
    try {
      await api.post(`/partner/viewings/${assignViewing.id}/assign`, { employee_id: assignEmp })
      message.success('已派发')
      setAssignViewing(null); setAssignEmp(''); vr()
    } catch (err: any) { message.error(errorText(err, '派发失败')) }
  }
  const viewingResult = async (id: string, status: string) => {
    try {
      await api.post(`/partner/viewings/${id}/result`, { status })
      message.success('已回执')
      vr()
    } catch (err: any) { message.error(errorText(err, '操作失败')) }
  }
  const submitClaim = async () => {
    try {
      const v = await claimForm.validateFields()
      const res = await api.post('/partner/leads/claim', v)
      const data = unwrap(res)
      message.success(data?.duplicated ? '该客户已由本公司报备' : `报备成功，保护期至 ${d(data?.expires_at)}`)
      claimForm.resetFields(); cr(); reload()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(errorText(err, '报备失败'))
    }
  }

  return (
    <div>
    <Tabs
      items={[
        {
          key: 'leads', label: `线索池 (${leads.length})`,
          children: (
            <Table
              size="small" rowKey="id" loading={loading} dataSource={leads} pagination={false}
              locale={{ emptyText: '暂无线索' }}
              columns={[
                { title: '客户', dataIndex: 'name' },
                { title: '手机', dataIndex: 'phone' },
                { title: '阶段', dataIndex: 'stage' },
                { title: '跟进人', dataIndex: 'assignee_name', render: (v: string) => v || '未分配' },
                { title: '创建时间', dataIndex: 'created_at', render: dt },
                {
                  title: '操作', render: (_: any, r: any) => (
                    <Button size="small" onClick={() => { setAssignLead(r); setAssignEmp('') }}>分配</Button>
                  ),
                },
              ]}
            />
          ),
        },
        {
          key: 'claims', label: '客户报备',
          children: (
            <div>
              <Form form={claimForm} layout="inline" style={{ marginBottom: 16 }}>
                <Form.Item name="name" rules={[{ required: true, message: '客户姓名' }]}><Input placeholder="客户姓名" /></Form.Item>
                <Form.Item name="phone"><Input placeholder="手机号" /></Form.Item>
                <Form.Item name="email"><Input placeholder="邮箱" /></Form.Item>
                <Form.Item name="days" initialValue={60}><InputNumber min={1} max={365} addonAfter="天" /></Form.Item>
                <Button type="primary" onClick={submitClaim}>提交报备</Button>
              </Form>
              <Table
                size="small" rowKey="id" loading={cl} dataSource={claims} pagination={false}
                locale={{ emptyText: '暂无报备' }}
                columns={[
                  { title: '客户指纹', dataIndex: 'fingerprint' },
                  { title: '类型', dataIndex: 'fingerprint_type' },
                  { title: '保护期至', dataIndex: 'expires_at', render: d },
                  { title: '状态', dataIndex: 'status' },
                ]}
              />
            </div>
          ),
        },
        {
          key: 'viewings', label: `带看派发 (${viewings.length})`,
          children: (
            <Table
              size="small" rowKey="id" loading={vl} dataSource={viewings} pagination={false}
              locale={{ emptyText: '暂无带看' }}
              columns={[
                { title: '房源', dataIndex: 'property_address', render: (v: string) => v || '—' },
                { title: '客户', dataIndex: 'visitor_name' },
                { title: '预约时间', dataIndex: 'scheduled_at', render: dt },
                { title: '经纪人', dataIndex: 'assignee_name', render: (v: string) => v || '未派发' },
                { title: '状态', dataIndex: 'status' },
                {
                  title: '操作', render: (_: any, r: any) => (
                    <Space>
                      <Button size="small" onClick={() => { setAssignViewing(r); setAssignEmp('') }}>派发</Button>
                      {r.status !== 'completed' && r.status !== 'cancelled' && (
                        <Button size="small" type="primary" onClick={() => viewingResult(r.id, 'completed')}>完成</Button>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          ),
        },
      ]}
    />
    <Modal
      title="分配线索" open={!!assignLead} onCancel={() => setAssignLead(null)} onOk={doAssignLead}
    >
      <Select
        style={{ width: '100%' }} placeholder="选择经纪人" value={assignEmp} onChange={setAssignEmp}
        options={empOptions}
      />
    </Modal>
    <Modal
      title="派发带看" open={!!assignViewing} onCancel={() => setAssignViewing(null)} onOk={doAssignViewing}
    >
      <Select
        style={{ width: '100%' }} placeholder="选择经纪人" value={assignEmp} onChange={setAssignEmp}
        options={empOptions}
      />
    </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// E1/E2 成交与收款
// ---------------------------------------------------------------------------
function BusinessTab() {
  const { rows: leases, loading: ll } = useRows<any>('/partner/leases')
  const { rows: contracts, loading: lc } = useRows<any>('/partner/contracts')
  const { rows: payments, loading: lp } = useRows<any>('/partner/payments')
  const [renewals, setRenewals] = useState<any>(null)
  useEffect(() => {
    api.get('/partner/renewals', { params: { days: 60 } }).then((r) => setRenewals(unwrap(r))).catch(() => {})
  }, [])
  const buckets: any[] = renewals?.buckets ?? []
  const [overdue, setOverdue] = useState(false)
  const { rows: overdueRows, loading: lo } = useRows<any>('/partner/payments', overdue ? { overdue: true } : undefined)

  return (
    <Tabs
      items={[
        {
          key: 'leases', label: `租约 (${leases.length})`,
          children: (
            <Table
              size="small" rowKey="id" loading={ll} dataSource={leases} pagination={false}
              locale={{ emptyText: '暂无租约（历史成交会自动回填归属）' }}
              columns={[
                { title: '租约号', dataIndex: 'lease_no' },
                { title: '房源', dataIndex: 'property_address', render: (v: string) => v || '—' },
                { title: '起租', dataIndex: 'start_date', render: d },
                { title: '到期', dataIndex: 'end_date', render: d },
                { title: '月租', dataIndex: 'monthly_rent', render: (v: number) => formatMoney(v) },
                { title: '状态', dataIndex: 'status' },
              ]}
            />
          ),
        },
        {
          key: 'contracts', label: `合同 (${contracts.length})`,
          children: (
            <Table
              size="small" rowKey="id" loading={lc} dataSource={contracts} pagination={false}
              locale={{ emptyText: '暂无合同' }}
              columns={[
                { title: '合同号', dataIndex: 'contract_no' },
                { title: '标题', dataIndex: 'title' },
                { title: '类型', dataIndex: 'kind' },
                { title: '状态', dataIndex: 'status' },
                { title: '签署时间', dataIndex: 'signed_at', render: dt },
              ]}
            />
          ),
        },
        {
          key: 'renewals', label: `续约提醒 (${renewals?.total ?? 0})`,
          children: (
            <div>
              {buckets.map((b: any) => (
                <Card key={b.key} title={`${b.key === '7' ? '7 天内' : b.key === '30' ? '30 天内' : '60 天内'}到期（${b.items.length}）`}>
                  <Table
                    size="small" rowKey="lease_id" dataSource={b.items} pagination={false}
                    locale={{ emptyText: '无' }}
                    columns={[
                      { title: '租约号', dataIndex: 'lease_no' },
                      { title: '到期日', dataIndex: 'end_date', render: d },
                      { title: '剩余天数', dataIndex: 'days_left' },
                      { title: '月租', dataIndex: 'monthly_rent', render: (v: number) => formatMoney(v) },
                    ]}
                  />
                </Card>
              ))}
            </div>
          ),
        },
        {
          key: 'payments', label: '收款与逾期',
          children: (
            <div>
              <Space style={{ marginBottom: 12 }}>
                <Button type={overdue ? 'primary' : 'default'} onClick={() => setOverdue((v) => !v)}>
                  只看逾期
                </Button>
                <span>逾期/未结金额：{formatMoney(overdue ? overdueRows.reduce((s: number, r: any) => s + (r.total_due || 0), 0) : payments.reduce((s: number, r: any) => s + (r.total_due || 0), 0))}</span>
              </Space>
              <Table
                size="small" rowKey="id" loading={overdue ? lo : lp}
                dataSource={overdue ? overdueRows : payments} pagination={false}
                locale={{ emptyText: '暂无账单' }}
                columns={[
                  { title: '收款单', dataIndex: 'receipt_no' },
                  { title: '类型', dataIndex: 'payment_type' },
                  { title: '应付', dataIndex: 'total_due', render: (v: number) => formatMoney(v) },
                  { title: '到期日', dataIndex: 'due_date', render: dt },
                  { title: '状态', dataIndex: 'status' },
                ]}
              />
            </div>
          ),
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------------
// F1/F2/F3 公司运营
// ---------------------------------------------------------------------------
function OpsTab() {
  const { rows: anns, reload: ra } = useRows<any>('/partner/announcements')
  const { rows: tasks, reload: rt } = useRows<any>('/partner/tasks')
  const { rows: approvals, reload: rap } = useRows<any>('/partner/approvals')
  const { rows: materials, reload: rm } = useRows<any>('/partner/materials')
  const { rows: hooks, reload: rh } = useRows<any>('/partner/webhooks')
  const { rows: events, reload: re } = useRows<any>('/partner/webhooks/events')
  const { rows: audit } = useRows<any>('/partner/audit-logs')
  const { rows: members } = useRows<any>('/partner/members')
  const [annForm] = Form.useForm()
  const [taskForm] = Form.useForm()
  const [apprForm] = Form.useForm()
  const [matForm] = Form.useForm()
  const [hookForm] = Form.useForm()

  const post = async (url: string, body: any, ok: string, done: () => void, form?: any) => {
    try {
      await api.post(url, body)
      message.success(ok)
      form?.resetFields()
      done()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(errorText(err, '操作失败'))
    }
  }

  return (
    <Tabs
      items={[
        {
          key: 'ann', label: '公告',
          children: (
            <Card title="公司公告与平台公告">
              <Form form={annForm} layout="inline" style={{ marginBottom: 12 }}>
                <Form.Item name="title" rules={[{ required: true, message: '标题' }]}><Input placeholder="公告标题" /></Form.Item>
                <Form.Item name="content"><Input placeholder="内容" /></Form.Item>
                <Button type="primary" onClick={() => annForm.validateFields().then((v) => post('/partner/announcements', v, '已发布', ra, annForm))}>发布</Button>
              </Form>
              <Table
                size="small" rowKey="id" dataSource={anns} pagination={false} locale={{ emptyText: '暂无公告' }}
                columns={[
                  { title: '标题', dataIndex: 'title' },
                  { title: '范围', dataIndex: 'scope', render: (v: string) => (v === 'platform' ? '平台' : '本公司') },
                  { title: '发布人', dataIndex: 'publisher_name' },
                  { title: '时间', dataIndex: 'published_at', render: dt },
                ]}
              />
            </Card>
          ),
        },
        {
          key: 'task', label: '任务',
          children: (
            <Card title="任务派发">
              <Form form={taskForm} layout="inline" style={{ marginBottom: 12 }}>
                <Form.Item name="title" rules={[{ required: true, message: '任务标题' }]}><Input placeholder="任务标题" /></Form.Item>
                <Form.Item name="assignee_user_id">
                  <Select allowClear placeholder="指派给" style={{ width: 160 }} options={members.map((m: any) => ({ value: m.id, label: m.full_name || m.email }))} />
                </Form.Item>
                <Button type="primary" onClick={() => taskForm.validateFields().then((v) => post('/partner/tasks', v, '已创建', rt, taskForm))}>创建任务</Button>
              </Form>
              <Table
                size="small" rowKey="id" dataSource={tasks} pagination={false} locale={{ emptyText: '暂无任务' }}
                columns={[
                  { title: '标题', dataIndex: 'title' },
                  { title: '指派', dataIndex: 'assignee_name', render: (v: string) => v || '—' },
                  { title: '状态', dataIndex: 'status' },
                  { title: '完成时间', dataIndex: 'completed_at', render: dt },
                  {
                    title: '操作', render: (_: any, r: any) => r.status !== 'completed' ? (
                      <Button size="small" onClick={() => post(`/partner/tasks/${r.id}/complete`, {}, '已完成', rt)}>完成</Button>
                    ) : '—',
                  },
                ]}
              />
            </Card>
          ),
        },
        {
          key: 'approval', label: '固定审批',
          children: (
            <Card title="折扣 / 用印 / 费用审批">
              <Form form={apprForm} layout="inline" style={{ marginBottom: 12 }}>
                <Form.Item name="kind" initialValue="expense">
                  <Select style={{ width: 110 }} options={[
                    { value: 'discount', label: '折扣' },
                    { value: 'seal', label: '用印' },
                    { value: 'expense', label: '费用' },
                  ]} />
                </Form.Item>
                <Form.Item name="title" rules={[{ required: true, message: '标题' }]}><Input placeholder="申请标题" /></Form.Item>
                <Form.Item name="amount"><InputNumber placeholder="金额" style={{ width: 120 }} /></Form.Item>
                <Button type="primary" onClick={() => apprForm.validateFields().then((v) => post('/partner/approvals', v, '已提交', rap, apprForm))}>提交</Button>
              </Form>
              <Table
                size="small" rowKey="id" dataSource={approvals} pagination={false} locale={{ emptyText: '暂无审批' }}
                columns={[
                  { title: '类型', dataIndex: 'kind' },
                  { title: '标题', dataIndex: 'title' },
                  { title: '金额', dataIndex: 'amount', render: (v: number) => (v != null ? formatMoney(v) : '—') },
                  { title: '申请人', dataIndex: 'applicant_name' },
                  { title: '状态', dataIndex: 'status' },
                  {
                    title: '操作', render: (_: any, r: any) => r.status === 'pending' ? (
                      <Space>
                        <Button size="small" type="primary" onClick={() => post(`/partner/approvals/${r.id}/review`, { approved: true }, '已通过', rap)}>通过</Button>
                        <Button size="small" danger onClick={() => post(`/partner/approvals/${r.id}/review`, { approved: false }, '已驳回', rap)}>驳回</Button>
                      </Space>
                    ) : '—',
                  },
                ]}
              />
            </Card>
          ),
        },
        {
          key: 'material', label: '素材库',
          children: (
            <Card title="平台公开素材 + 本公司素材">
              <Form form={matForm} layout="inline" style={{ marginBottom: 12 }}>
                <Form.Item name="title" rules={[{ required: true, message: '标题' }]}><Input placeholder="素材标题" /></Form.Item>
                <Form.Item name="category" initialValue="poster">
                  <Select style={{ width: 110 }} options={[
                    { value: 'poster', label: '海报' },
                    { value: 'script', label: '话术' },
                    { value: 'training', label: '培训' },
                    { value: 'other', label: '其他' },
                  ]} />
                </Form.Item>
                <Form.Item name="url" rules={[{ required: true, message: '链接' }]}><Input placeholder="素材链接" style={{ width: 260 }} /></Form.Item>
                <Button type="primary" onClick={() => matForm.validateFields().then((v) => post('/partner/materials', v, '已上传', rm, matForm))}>添加</Button>
              </Form>
              <Table
                size="small" rowKey="id" dataSource={materials} pagination={false} locale={{ emptyText: '暂无素材' }}
                columns={[
                  { title: '标题', dataIndex: 'title' },
                  { title: '分类', dataIndex: 'category' },
                  {
                    title: '链接', dataIndex: 'url',
                    render: (v: string) => <a href={v} target="_blank" rel="noreferrer">打开</a>,
                  },
                  { title: '范围', dataIndex: 'scope', render: (v: string) => (v === 'platform' ? '平台' : '本公司') },
                ]}
              />
            </Card>
          ),
        },
        {
          key: 'hook', label: 'Webhook',
          children: (
            <div>
              <Card title="Webhook 订阅（成交/佣金状态变更推送）">
                <Form form={hookForm} layout="inline" style={{ marginBottom: 12 }}>
                  <Form.Item name="url" rules={[{ required: true, message: '回调地址' }]}>
                    <Input placeholder="https://example.com/hook" style={{ width: 320 }} />
                  </Form.Item>
                  <Button type="primary" onClick={() => hookForm.validateFields().then((v) => post('/partner/webhooks', v, '已创建', rh, hookForm))}>创建</Button>
                </Form>
                <Table
                  size="small" rowKey="id" dataSource={hooks} pagination={false} locale={{ emptyText: '暂无 Webhook' }}
                  columns={[
                    { title: '地址', dataIndex: 'url' },
                    { title: '事件', dataIndex: 'events', render: (v: string[]) => (v || []).join(', ') },
                    { title: '最近状态码', dataIndex: 'last_status_code', render: (v: number) => v ?? '—' },
                    {
                      title: '操作', render: (_: any, r: any) => (
                        <Space>
                          <Button size="small" onClick={() => post(`/partner/webhooks/${r.id}/test`, {}, '已投递测试事件', re)}>测试</Button>
                          <Button size="small" danger onClick={async () => {
                            try { await api.delete(`/partner/webhooks/${r.id}`); message.success('已删除'); rh(); re() } catch (e: any) { message.error(errorText(e, '删除失败')) }
                          }}>删除</Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
              <Card title="投递记录">
                <Table
                  size="small" rowKey="id" dataSource={events} pagination={false} locale={{ emptyText: '暂无投递记录' }}
                  columns={[
                    { title: '事件', dataIndex: 'event' },
                    { title: '状态', dataIndex: 'status' },
                    { title: '尝试次数', dataIndex: 'attempts' },
                    { title: '响应码', dataIndex: 'response_code', render: (v: number) => v ?? '—' },
                    { title: '时间', dataIndex: 'created_at', render: dt },
                  ]}
                />
              </Card>
            </div>
          ),
        },
        {
          key: 'audit', label: '操作日志',
          children: (
            <Card title="本公司操作日志">
              <Table
                size="small" rowKey="id" dataSource={audit} pagination={false} locale={{ emptyText: '暂无日志' }}
                columns={[
                  { title: '操作人', dataIndex: 'actor_name', render: (v: string) => v || '—' },
                  { title: '动作', dataIndex: 'action' },
                  { title: '对象', dataIndex: 'resource_type' },
                  { title: '时间', dataIndex: 'occurred_at', render: dt },
                ]}
              />
            </Card>
          ),
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------------
// 壳：按路由渲染对应 Tab
// ---------------------------------------------------------------------------
const TITLES: Record<TabKey, string> = {
  dashboard: '经营驾驶舱',
  settlements: '佣金对账',
  rules: '佣金规则',
  reviews: '审批与排班',
  properties: '授权房源',
  leads: '线索与带看',
  business: '成交与收款',
  ops: '公司运营',
}

export default function PartnerConsole({ tab }: { tab: TabKey }) {
  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{TITLES[tab]}</h2>
          <p className="rent-page-header__subtitle">合作公司数字化管理控制台</p>
        </div>
      </div>
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'settlements' && <SettlementsTab />}
      {tab === 'rules' && <RulesTab />}
      {tab === 'reviews' && <ReviewsTab />}
      {tab === 'properties' && <PropertiesTab />}
      {tab === 'leads' && <LeadsTab />}
      {tab === 'business' && <BusinessTab />}
      {tab === 'ops' && <OpsTab />}
    </div>
  )
}
