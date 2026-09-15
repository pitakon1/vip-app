import { useCallback, useEffect, useState } from 'react'
import { Card, Tabs, Checkbox, Button, Space, message, Spin, Tag } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import api from '@/lib/api'

interface PermData {
  categories: Record<string, { code: string; name: string; description?: string }[]>
  roles: Record<string, string[]>
}

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  agent: '经纪人',
  employee: '员工',
  owner: '业主',
  tenant: '租客',
}
const ROLE_COLOR: Record<string, string> = {
  admin: 'magenta',
  agent: 'geekblue',
  employee: 'cyan',
  owner: 'gold',
  tenant: 'green',
}
const CAT_LABEL: Record<string, string> = {
  system: '系统',
  account: '账号管理',
  group: '分组管理',
  role: '角色配置',
  review: '工单审核',
  data: '数据查看',
  commission: '佣金配置',
}

const Permissions = () => {
  const [data, setData] = useState<PermData | null>(null)
  const [role, setRole] = useState('admin')
  const [checked, setChecked] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/permissions')
      const d = res.data?.data ?? res.data
      setData(d)
      setChecked(d?.roles?.[role] ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '加载权限失败')
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleAll = (codes: string[], on: boolean) => {
    setChecked((prev) => (on ? Array.from(new Set([...prev, ...codes])) : prev.filter((c) => !codes.includes(c))))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await api.put(`/admin/permissions/roles/${role}`, { codes: checked })
      const d = res.data?.data ?? res.data
      setChecked(d.permissions ?? [])
      message.success(`已保存「${ROLE_LABEL[role]}」权限`)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>角色权限配置</h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>
            按角色分配功能权限点，登录后前端菜单与接口权限即时生效
          </p>
        </div>
        <div className="rent-page-header__actions">
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            保存配置
          </Button>
        </div>
      </div>

      <Card loading={loading || !data}>
        <Tabs
          activeKey={role}
          onChange={setRole}
          items={Object.keys(ROLE_LABEL).map((r) => ({
            key: r,
            label: <Tag color={ROLE_COLOR[r]}>{ROLE_LABEL[r]}</Tag>,
            children: null,
          }))}
        />

        <Space wrap style={{ marginBottom: 16 }}>
          <span style={{ color: 'var(--rent-ink-3)', fontWeight: 500 }}>
            已选 {checked.length} / {Object.values(data?.categories ?? {}).reduce((s, arr) => s + arr.length, 0)} 项
          </span>
          {Object.entries(data?.categories ?? {}).map(([cat, perms]) => {
            const codes = perms.map((p) => p.code)
            const allOn = codes.every((c) => checked.includes(c))
            const someOn = codes.some((c) => checked.includes(c))
            return (
              <Button
                key={cat}
                size="small"
                onClick={() => toggleAll(codes, !allOn)}
              >
                {allOn ? '✓ 全选' : someOn ? '· 全选' : '+ 全选'} · {CAT_LABEL[cat] || cat}
              </Button>
            )
          })}
        </Space>

        <div className="rent-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {Object.entries(data?.categories ?? {}).map(([cat, perms]) => (
            <Card key={cat} size="small" title={CAT_LABEL[cat] || cat} style={{ marginBottom: 0 }}>
              <Checkbox.Group
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                value={checked}
                onChange={(v) => setChecked(v as string[])}
                options={perms.map((p) => ({ label: p.description ? `${p.name} · ${p.description}` : p.name, value: p.code }))}
              />
            </Card>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default Permissions