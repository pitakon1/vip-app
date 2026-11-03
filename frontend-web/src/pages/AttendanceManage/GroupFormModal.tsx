/**
 * 考勤组新增/编辑弹窗。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，字段、类名与交互保持不变。
 */
import { Modal } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import type { GroupForm } from './attendanceTypes'

export default function GroupFormModal({
  open,
  isEdit,
  form,
  setForm,
  saving,
  onCancel,
  onSubmit,
}: {
  open: boolean
  isEdit: boolean
  form: GroupForm
  setForm: Dispatch<SetStateAction<GroupForm>>
  saving: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      title={isEdit ? t('attAdm.editGroup') : t('attAdm.newGroup')}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={saving}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      width={640}
      destroyOnClose
    >
      <div className="attAdm-form">
        <div className="rent-grid rent-grid--2">
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.thGroupName')}</label>
            <input
              className="rent-input"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.thDepartment')}</label>
            <input
              className="rent-input"
              placeholder={t('attAdm.phDepartment')}
              value={form.department}
              onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
            />
          </div>
        </div>
        <div className="rent-grid rent-grid--2">
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.thShift')}</label>
            <div className="attAdm-shift">
              <input
                className="rent-input"
                type="time"
                value={form.work_start}
                onChange={(e) => setForm((p) => ({ ...p, work_start: e.target.value }))}
              />
              <span className="attAdm-filter__sep">~</span>
              <input
                className="rent-input"
                type="time"
                value={form.work_end}
                onChange={(e) => setForm((p) => ({ ...p, work_end: e.target.value }))}
              />
            </div>
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.thGrace')}</label>
            <div className="attAdm-shift">
              <input
                className="rent-input"
                type="number"
                min={0}
                value={form.late_grace_minutes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, late_grace_minutes: e.target.value }))
                }
              />
              <input
                className="rent-input"
                type="number"
                min={0}
                value={form.early_grace_minutes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, early_grace_minutes: e.target.value }))
                }
              />
            </div>
            <div className="rent-text-sm rent-text-muted">{t('attAdm.graceHint')}</div>
          </div>
        </div>
        <div className="rent-grid rent-grid--3">
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.labelLat')}</label>
            <input
              className="rent-input"
              type="number"
              step="0.0001"
              value={form.office_lat}
              onChange={(e) => setForm((p) => ({ ...p, office_lat: e.target.value }))}
            />
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.labelLng')}</label>
            <input
              className="rent-input"
              type="number"
              step="0.0001"
              value={form.office_lng}
              onChange={(e) => setForm((p) => ({ ...p, office_lng: e.target.value }))}
            />
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.thRadius')}</label>
            <input
              className="rent-input"
              type="number"
              step="0.1"
              min={0.1}
              value={form.radius_km}
              onChange={(e) => setForm((p) => ({ ...p, radius_km: e.target.value }))}
            />
          </div>
        </div>
        <div className="rent-grid rent-grid--2">
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.labelOffset')}</label>
            <input
              className="rent-input"
              type="number"
              step="0.5"
              value={form.utc_offset_hours}
              onChange={(e) => setForm((p) => ({ ...p, utc_offset_hours: e.target.value }))}
            />
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.labelDesc')}</label>
            <input
              className="rent-input"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
        </div>
        <div className="attAdm-switches">
          <label className="attAdm-check">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
            />
            {t('attAdm.isDefault')}
          </label>
          <label className="attAdm-check">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            {t('attAdm.enabled')}
          </label>
        </div>
      </div>
    </Modal>
  )
}
