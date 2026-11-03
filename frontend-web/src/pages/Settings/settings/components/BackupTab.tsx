import { useTranslation } from 'react-i18next'
import { Empty, Spin } from 'antd'
import type { BackupJob } from '../types'

interface Props {
  jobs: BackupJob[]
  loading: boolean
  running: boolean
  onRun: () => void
  onRefresh: () => void
}

/** Tab 5：数据备份 */
export const BackupTab = ({ jobs, loading, running, onRun, onRefresh }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-tab-panel" data-active="true">
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('settings.backupTitle')}</h3>
          <span className="rent-badge rent-badge--primary">v1.8</span>
        </div>
        <div className="rent-card__body">
          <p className="rent-body rent-mb-4">
            {t('settings.backupIntroA')}
            <span className="rent-table__mono"> .json.gz </span>
            {t('settings.backupIntroB')}
          </p>
          <div className="rent-flex rent-gap-4" style={{ alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
            <button className="rent-btn rent-btn--primary" type="button" onClick={onRun} disabled={running}>
              {running ? t('settings.backupRunning') : t('settings.runBackupNow')}
            </button>
            <span className="rent-text-sm rent-text-muted">{t('settings.autoBackupPolicy')}</span>
            <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={onRefresh} disabled={loading} style={{ marginLeft: 'auto' }}>{t('settings.refresh')}</button>
          </div>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('settings.thTime')}</th>
                  <th>{t('settings.thType')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('settings.thFile')}</th>
                  <th>{t('settings.thSize')}</th>
                  <th>{t('settings.thRemark')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="rent-empty">
                        <Spin size="small" style={{ marginRight: 8 }} />
                        <span className="rent-text-muted">{t('common.loading')}</span>
                      </div>
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="rent-empty">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settings.emptyBackups')} />
                      </div>
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="rent-table__mono">{job.created_at ? new Date(job.created_at).toLocaleString() : '-'}</td>
                      <td>{job.type === 'daily' ? t('settings.backupTypeDaily') : job.type === 'manual' ? t('settings.backupTypeManual') : job.type}</td>
                      <td>
                        <span className="rent-badge" data-success={job.status === 'success' ? 'true' : undefined} data-danger={job.status === 'failed' ? 'true' : undefined}>
                          {job.status === 'success' ? t('settings.statusSuccess') : job.status === 'failed' ? t('settings.statusFailed') : job.status}
                        </span>
                      </td>
                      <td className="rent-table__mono" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.file_path || '-'}</td>
                      <td className="rent-table__mono">{job.size_bytes ? `${(job.size_bytes / 1024 / 1024).toFixed(2)} MB` : '-'}</td>
                      <td className="rent-text-muted">{job.error || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
