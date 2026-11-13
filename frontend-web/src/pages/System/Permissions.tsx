import { useCallback, useEffect, useState } from 'react'
import { Card, Tabs, Checkbox, Button, Space, message, Tag, Modal } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { errorText } from '@/lib/errorText'

interface PermData {
  categories: Record<string, { code: string; name: string; description?: string }[]>
  roles: Record<string, string[]>
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'systemPermissions.roleAdmin',
  agent: 'systemPermissions.roleAgent',
  employee: 'systemPermissions.roleEmployee',
  partner_admin: 'systemPermissions.rolePartnerAdmin',
  owner: 'systemPermissions.roleOwner',
  tenant: 'systemPermissions.roleTenant',
}
const ROLE_COLOR: Record<string, string> = {
  admin: 'magenta',
  agent: 'geekblue',
  employee: 'cyan',
  partner_admin: 'purple',
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
  partner: 'systemPermissions.catPartner',
  contract: 'systemPermissions.catContract',
  department: 'systemPermissions.catDepartment',
  option: 'systemPermissions.catOption',
}

const Permissions = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<PermData | null>(null)
  const [role, setRole] = useState('admin')
  // 每个角色一份独立草稿：切 Tab 只切视图，不再让异步请求覆盖当前勾选，
  // 否则加载期间点保存会把上一角色的权限码写到新角色上。
  const [drafts, setDrafts] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const checked = drafts[role] ?? []
  const setChecked = (codes: string[]) =>
    setDrafts((prev) => ({ ...prev, [role]: codes }))

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/permissions')
      const d = res.data?.data ?? res.data
      setData(d)
      setDrafts(
        Object.fromEntries(
          Object.keys(ROLE_LABEL).map((r) => [r, d?.roles?.[r] ?? []]),
        ),
      )
    } catch (err: any) {
      message.error(errorText(err, t('systemPermissions.loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleAll = (codes: string[], on: boolean) => {
    setChecked(on ? Array.from(new Set([...checked, ...codes])) : checked.filter((c) => !codes.includes(c)))
  }

  const handleSave = () => {
    // 权限数据未加载完成或正在保存时不提交
    if (!data || loading || saving) return
    Modal.confirm({
      title: t('systemPermissions.confirmSaveTitle', { role: t(ROLE_LABEL[role]) }),
      content: t('systemPermissions.confirmSaveBody', { count: checked.length }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setSaving(true)
        try {
          const res = await api.put(`/admin/permissions/roles/${role}`, { codes: checked })
          const d = res.data?.data ?? res.data
          const saved = d.permissions ?? checked
          setDrafts((prev) => ({ ...prev, [role]: saved }))
          message.success(t('systemPermissions.saved', { role: t(ROLE_LABEL[role]) }))
        } catch (err: any) {
          message.error(errorText(err, t('systemPermissions.saveFailed')))
        } finally {
          setSaving(false)
        }
      },
    })
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
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={loading || !data}
            onClick={handleSave}
          >
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
          <span style={{ color: 'var(--rent-ink-2)', fontWeight: 500 }}>
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