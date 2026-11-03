import './settings.css'
import { SettingsHeader } from './settings/components/SettingsHeader'
import { CompanyTab } from './settings/components/CompanyTab'
import { PaymentTab } from './settings/components/PaymentTab'
import { NotificationTab } from './settings/components/NotificationTab'
import { PermissionTab } from './settings/components/PermissionTab'
import { BackupTab } from './settings/components/BackupTab'
import { useSettingsPage } from './settings/hooks/useSettingsPage'

const Settings = () => {
  const s = useSettingsPage()

  return (
    <div className="rent-main">
      <SettingsHeader activeTab={s.activeTab} onChangeTab={s.setActiveTab} updatedAt={s.updatedAt} />

      {s.activeTab === 'company' && (
        <CompanyTab
          form={s.companyForm}
          setForm={s.setCompanyForm}
          loading={s.loading}
          saving={s.saving}
          logoUrl={s.logoUrl}
          logoUploading={s.logoUploading}
          logoInputRef={s.logoInputRef}
          onSave={s.handleCompanySave}
          onReset={s.handleCompanyReset}
          onLogoUpload={s.handleLogoUpload}
          onLogoRemove={s.handleLogoRemove}
        />
      )}

      {s.activeTab === 'payment' && (
        <PaymentTab
          channels={s.channels}
          saving={s.saving}
          onToggleChannel={s.toggleChannel}
          onUpdateField={s.updateChannelField}
          onToggleCard={s.toggleChannelCard}
          onSave={s.handleChannelSave}
          onReset={s.handleChannelReset}
        />
      )}

      {s.activeTab === 'notification' && (
        <NotificationTab
          rows={s.notifyRows}
          saving={s.saving}
          onToggle={s.toggleNotify}
          onSave={s.handleNotifySave}
          onReset={s.handleNotifyReset}
        />
      )}

      {s.activeTab === 'permission' && <PermissionTab />}

      {s.activeTab === 'backup' && (
        <BackupTab
          jobs={s.backupJobs}
          loading={s.backupLoading}
          running={s.backupRunning}
          onRun={s.handleBackupRun}
          onRefresh={s.fetchBackupJobs}
        />
      )}
    </div>
  )
}

export default Settings
