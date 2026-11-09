/**
 * 考勤组成员管理弹窗（新增成员 + 当前成员列表）。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，交互与类名保持不变。
 */
import { Modal } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'

export default function GroupMembersModal({
  open,
  group,
  empOptions,
  pickedEmployees,
  setPickedEmployees,
  members,
  membersError,
  onClose,
  onAdd,
  onRemove,
  onRetry,
}: {
  open: boolean
  group: any | null
  empOptions: any[]
  pickedEmployees: string[]
  setPickedEmployees: Dispatch<SetStateAction<string[]>>
  members: any[]
  membersError: string | null
  onClose: () => void
  onAdd: () => void
  onRemove: (employeeId: string) => void
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      title={t('attAdm.membersTitle', { name: group?.name ?? '' })}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnHidden
    >
      <div className="attAdm-form">
        <div className="rent-field">
          <label className="rent-label">{t('attAdm.addMembers')}</label>
          <select
            className="rent-input attAdm-multi"
            multiple
            value={pickedEmployees}
            onChange={(e) =>
              setPickedEmployees(
                Array.from(e.target.selectedOptions).map((o) => (o as HTMLOptionElement).value),
              )
            }
          >
            {empOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name || e.email || e.id} · {e.department || '—'}
              </option>
            ))}
          </select>
          <div className="attAdm-member-actions">
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={onAdd}>
              {t('attAdm.addToGroup')}
            </button>
            <span className="rent-text-sm rent-text-muted">{t('attAdm.exclusiveHint')}</span>
          </div>
        </div>
        <hr className="rent-divider" />
        <div className="rent-text-bold rent-mb-2">
          {t('attAdm.currentMembers', { count: members.length })}
        </div>
        {membersError && members.length === 0 ? (
          <DataState error={membersError} retryText={t('common.retry')} onRetry={onRetry} />
        ) : members.length === 0 ? (
          <DataState empty emptyTitle={t('attAdm.noMembers')} />
        ) : (
          <ul className="attAdm-member-list">
            {members.map((m) => (
              <li key={m.employee_id}>
                <span>
                  {m.name || m.email || m.employee_id}
                  <span className="rent-text-sm rent-text-muted">
                    {' '}
                    · {m.department || '—'}
                  </span>
                </span>
                <button
                  className="rent-btn rent-btn--ghost rent-btn--sm attAdm-danger"
                  onClick={() => onRemove(m.employee_id)}
                >
                  {t('attAdm.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
