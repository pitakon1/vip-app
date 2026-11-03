import { useTranslation } from 'react-i18next'
import { PERMISSION_MATRIX } from '../constants'

const AllowedIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--state-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
)

const DeniedIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
)

/** Tab 4：权限管理（预设权限矩阵，只读） */
export const PermissionTab = () => {
  const { t } = useTranslation()
  return (
    <div className="rent-tab-panel" data-active="true">
      <p className="rent-body rent-mb-4">{t('settings.permissionIntro')}</p>
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('settings.permMatrixTitle')}</h3>
          <span className="rent-badge rent-badge--neutral">{t('settings.presetPermissions')}</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>{t('settings.thPermission')}</th>
                  <th className="rent-perm-cell">{t('settings.roleAdmin')}</th>
                  <th className="rent-perm-cell">{t('settings.roleOwner')}</th>
                  <th className="rent-perm-cell">{t('settings.roleTenant')}</th>
                  <th className="rent-perm-cell">{t('settings.roleEmployee')}</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MATRIX.map((perm) => (
                  <tr key={perm.name}>
                    <td>{t(perm.name)}</td>
                    <td className="rent-perm-cell">
                      <span className="rent-perm-icon">
                        {perm.admin ? <AllowedIcon size={18} /> : <DeniedIcon size={18} />}
                      </span>
                    </td>
                    <td className="rent-perm-cell">
                      <span className="rent-perm-icon">
                        {perm.owner ? <AllowedIcon size={18} /> : <DeniedIcon size={18} />}
                      </span>
                    </td>
                    <td className="rent-perm-cell">
                      <span className="rent-perm-icon">
                        {perm.tenant ? <AllowedIcon size={18} /> : <DeniedIcon size={18} />}
                      </span>
                    </td>
                    <td className="rent-perm-cell">
                      <span className="rent-perm-icon">
                        {perm.employee ? <AllowedIcon size={18} /> : <DeniedIcon size={18} />}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rent-card__footer rent-flex rent-gap-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
            <span className="rent-perm-icon"><AllowedIcon size={16} /></span>
            <span className="rent-text-sm rent-text-muted">{t('settings.allowed')}</span>
          </span>
          <span className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
            <span className="rent-perm-icon"><DeniedIcon size={16} /></span>
            <span className="rent-text-sm rent-text-muted">{t('settings.denied')}</span>
          </span>
          <span className="rent-text-sm rent-text-muted" style={{ marginLeft: 'auto' }}>{t('settings.permFooterHint')}</span>
        </div>
      </div>
    </div>
  )
}
