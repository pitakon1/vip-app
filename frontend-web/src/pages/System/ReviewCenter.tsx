import { useCallback, useEffect, useState } from 'react'
import { Table, Tag, Button, Space, message, Card, Popconfirm } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import api from '@/lib/api'

interface ReviewItem {
  type: string
  id: string
  title: string
  applicant: string
  reason: string
  status: string
  created_at?: string
}

interface ReviewData {
  summary: Record<string, number>
  items: ReviewItem[]
}

const TYPE_META: Record<string, { label: string; color: string }> = {
  trip: { label: '外勤申请', color: 'warning' },
  maintenance: { label: '报修工单', color: 'blue' },
  service: { label: '服务订单', color: 'green' },
  contract: { label: '合同流转', color: 'purple' },
}
const STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  open: '待受理',
  assigned: '已分派',
  in_progress: '处理中',
  draft: '草稿',
  sent: '已发出',
  partially_signed: '部分签署',
}

const ReviewCenter = () => {
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/review-center/todos')
      const d = res.data?.data ?? res.data
      setData(d)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '加载待办失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 外勤审批
  const handleTrip = async (id: string, action: 'approved' | 'rejected') => {
    try {
      await api.post(`/attendance/external-trips/${id}/approve`, { action, reply_note: action === 'approved' ? '管理员审批通过' : '管理员驳回' })
      message.success(action === 'approved' ? '已通过' : '已驳回')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    }
  }

  // 报修工单受理 -> assigned；完结 -> resolved
  const handleTicket = async (id: string, status: string) => {
    try {
      await api.patch(`/maintenance/${id}`, { status })
      message.success('工单状态已更新')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    }
  }

  // 服务订单受理 -> assigned
  const handleOrder = async (id: string, status: string) => {
    try {
      await api.patch(`/service-orders/${id}`, { status })
      message.success('订单状态已更新')
      fetchData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    }
  }

  if (!data) return null

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>工单审核中心</h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>
            统一处理外勤申请、报修工单、服务订单与合同流转待办
          </p>
        </div>
        <div className="rent-page-header__actions">
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            刷新
          </Button>
        </div>
      </div>

      <div className="rent-grid rent-grid--4" style={{ marginBottom: 16 }}>
        {Object.entries(TYPE_META).map(([k, m]) => (
          <Card key={k} size="small">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--rent-ink-3)' }}>{m.label}</span>
              <Tag color={m.color}>{data.summary[k] ?? 0}</Tag>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--rent-ink)', marginTop: 8 }}>
              {data.summary[k] ?? 0}
            </div>
          </Card>
        ))}
      </div>

      <div className="rent-card" style={{ padding: 16 }}>
        <Table<ReviewItem>
          rowKey={(r) => `${r.type}-${r.id}`}
          loading={loading}
          dataSource={data.items}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 项待办` }}
          locale={{ emptyText: '暂无待办，所有工单已处理完毕' }}
          columns={[
            {
              title: '类型',
              dataIndex: 'type',
              width: 110,
              render: (t: string) => {
                const m = TYPE_META[t] || { label: t, color: 'default' }
                return <Tag color={m.color}>{m.label}</Tag>
              },
            },
            { title: '事项', dataIndex: 'title', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
            { title: '申请人', dataIndex: 'applicant', width: 110 },
            { title: '内容', dataIndex: 'reason', ellipsis: true },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (v: string) => <Tag>{STATUS_LABEL[v] || v}</Tag>,
            },
            { title: '提交时间', dataIndex: 'created_at', width: 120, render: (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : '-') },
            {
              title: '操作',
              width: 200,
              render: (_, r) => (
                <Space>
                  {r.type === 'trip' && (
                    <>
                      <Button size="small" type="primary" onClick={() => handleTrip(r.id, 'approved')}>
                        通过
                      </Button>
                      <Popconfirm title="确认驳回该外勤申请？" onConfirm={() => handleTrip(r.id, 'rejected')}>
                        <Button size="small" danger>
                          驳回
                        </Button>
                      </Popconfirm>
                    </>
                  )}
                  {r.type === 'maintenance' && (
                    <>
                      <Button size="small" type="primary" onClick={() => handleTicket(r.id, 'assigned')}>
                        受理
                      </Button>
                      <Button size="small" onClick={() => handleTicket(r.id, 'resolved')}>
                        完结
                      </Button>
                    </>
                  )}
                  {r.type === 'service' && (
                    <Button size="small" type="primary" onClick={() => handleOrder(r.id, 'assigned')}>
                      受理
                    </Button>
                  )}
                  {r.type === 'contract' && <span style={{ color: 'var(--rent-ink-3)' }}>请在合同管理页处理</span>}
                </Space>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}

export default ReviewCenter