import { useCallback, useEffect, useState } from 'react'
import { Card, Tabs, Checkbox, Button, Space, message, Tag } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'

interface PermData {
  categories: Record<string, { code: string; name: string; description?: string }[]>
  roles: Record<string, string[]>
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'systemPermissions.roleAdmin',
  agent: 'systemPermissions.roleAgent',
  employee: 'systemPermissions.roleEmployee',
  owner: 'systemPermissions.roleOwner',
  tenant: 'systemPermissions.roleTenant',
}
const ROLE_COLOR: Record<string, string> = {
  admin: 'magenta',
  agent: 'geekblue',
  employee: 'cyan',
  owner: 'gold',
  tenant: 'green',
}
const CAT_LABEL: Record<string, string> = {
  system: 'menu.section.system',
  account: 'menu.accountUsers',
  group: 'systemPermissions.catGroup',
  role: 'systemPermissions.catRole',
  review: 'menu.reviewCenter',
  data: 'systemPermissions.catData',
  commission: 'systemPermissions.catCommission',
}

const Permissions = () => {
  const { t } = useTranslation()
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
      message.error(err?.response?.data?.detail || t('systemPermissions.loadFailed'))
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
      message.success(t('systemPermissions.saved', { role: t(ROLE_LABEL[role]) }))
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('systemPermissions.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>{t('systemPermissions.title')}</h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>
            {t('systemPermissions.subtitle')}
          </p>
        </div>
        <div className="rent-page-header__actions">
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            {t('systemPermissions.saveBtn')}
          </Button>
        </div>
      </div>

      <Card loading={loading || !data}>
        <Tabs
          activeKey={role}
          onChange={setRole}
          items={Object.keys(ROLE_LABEL).map((r) => ({
            key: r,
            label: <Tag color={ROLE_COLOR[r]}>{t(ROLE_LABEL[r])}</Tag>,
            children: null,
          }))}
        />

        <Space wrap style={{ marginBottom: 16 }}>
          <span style={{ color: 'var(--rent-ink-3)', fontWeight: 500 }}>
            {t('systemPermissions.selectedCount', { selected: checked.length, total: Object.values(data?.categories ?? {}).reduce((s, arr) => s + arr.length, 0) })}
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
                {allOn ? '✓' : someOn ? '·' : '+'} {t('systemPermissions.selectAll')} · {CAT_LABEL[cat] ? t(CAT_LABEL[cat]) : cat}
              </Button>
            )
          })}
        </Space>

        <div className="rent-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {Object.entries(data?.categories ?? {}).map(([cat, perms]) => (
            <Card key={cat} size="small" title={CAT_LABEL[cat] ? t(CAT_LABEL[cat]) : cat} style={{ marginBottom: 0 }}>
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