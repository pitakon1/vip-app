import { useTranslation } from 'react-i18next'
import SealCropperModal from '@/components/SealCropperModal'
import './contracts.css'
import { useContractList } from './hooks/useContractList'
import { useContractGeneration } from './hooks/useContractGeneration'
import { useContractUpload } from './hooks/useContractUpload'
import { useContractDetail } from './hooks/useContractDetail'
import { useSignFields } from './hooks/useSignFields'
import { useSignAssets } from './hooks/useSignAssets'
import GenerateContractCard from './GenerateContractCard'
import UploadContractCard from './UploadContractCard'
import ContractList from './ContractList'
import ContractStatsBar from './ContractStatsBar'
import ApprovalCenterCard from './ApprovalCenterCard'
import ContractDetailCard from './ContractDetailCard'
import ContractEditModal from './ContractEditModal'
import AddPartyModal from './AddPartyModal'
import VoidContractModal from './VoidContractModal'
import PlaceFieldsModal from './PlaceFieldsModal'
import DeclineModal from './DeclineModal'
import SignAssetLibraryModal from './SignAssetLibraryModal'
import SignOrderModal from './SignOrderModal'
import CallbackModal from './CallbackModal'
import ShareLinkQrModal from './ShareLinkQrModal'

/**
 * 合同管理：生成 / 上传 / 列表 / 详情。
 *
 * 纯结构拆分：本文件只保留编排与页面级挂载，
 * 列表、卡片、弹窗与数据逻辑均落在本页面私有目录内。
 */

const Contracts = () => {
  const { t } = useTranslation()

  const list = useContractList()
  const generation = useContractGeneration({ onGenerated: list.loadList })
  const upload = useContractUpload({ onUploaded: list.loadList })
  const detail = useContractDetail({ onChanged: list.loadList })
  const signFields = useSignFields({ detail: detail.detail, setDetail: detail.setDetail })
  const signAssets = useSignAssets()

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('contracts.title')}</h2>
          <p className="rent-page-header__subtitle">{t('contracts.subtitle')}</p>
        </div>
      </div>

      <GenerateContractCard
        templates={list.templates}
        kind={generation.kind}
        setKind={generation.setKind}
        language={generation.language}
        setLanguage={generation.setLanguage}
        form={generation.form}
        setForm={generation.setForm}
        onGenerate={generation.handleGenerate}
      />

      <UploadContractCard
        pendingFile={upload.pendingFile}
        uploading={upload.uploading}
        fileInputRef={upload.fileInputRef}
        onPick={upload.handleFilePicked}
        onConfirm={upload.handleUploadConfirm}
        onCancel={() => upload.setPendingFile(null)}
      />

      <ContractStatsBar
        stats={list.stats}
        loading={list.statsLoading}
        error={list.statsError}
        onRetry={() => { void list.loadStats() }}
      />

      <ApprovalCenterCard />

      <ContractList
        contracts={list.contracts}
        loading={list.contractsLoading}
        error={list.contractsError}
        onRetry={() => { void list.loadList() }}
        onOpen={detail.handleOpen}
        onSuggestResign={(id) => {
          detail.handleOpen(id)
          // 等详情渲染后滚到签署区所在卡片
          window.setTimeout(() => {
            document.getElementById('contract-detail-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 300)
        }}
      />

      {detail.detail.contract && (
        <ContractDetailCard
          detail={detail.detail}
          canEdit={detail.canEdit}
          canRevoke={detail.canRevoke}
          onCopyLink={detail.handleCopyLink}
          onShowQr={detail.handleShowQr}
          onRotateLink={detail.handleRotateLink}
          onSend={detail.handleSend}
          onOpenPreview={signFields.openPreview}
          onOpenSigLib={signAssets.openSigLib}
          onOpenEdit={detail.openEdit}
          onOpenParty={() => detail.setPartyOpen(true)}
          onOpenVoid={() => detail.setVoidOpen(true)}
          onRevoke={detail.handleRevoke}
          onRemind={detail.handleRemind}
          onDecline={detail.openDecline}
          onOpenSignOrder={() => detail.setSignOrderOpen(true)}
          onOpenCallback={detail.openCallback}
          onSubmitApproval={detail.handleSubmitApproval}
        />
      )}

      {/* 编辑合同 */}
      <ContractEditModal
        open={detail.editOpen}
        title={detail.editTitle}
        content={detail.editContent}
        onTitleChange={detail.setEditTitle}
        onContentChange={detail.setEditContent}
        onCancel={() => detail.setEditOpen(false)}
        onOk={detail.handleEditSave}
      />

      {/* 追加签署方 */}
      <AddPartyModal
        open={detail.partyOpen}
        form={detail.partyForm}
        setForm={detail.setPartyForm}
        onCancel={() => detail.setPartyOpen(false)}
        onOk={detail.handleAddParty}
      />

      {/* 作废合同 */}
      <VoidContractModal
        open={detail.voidOpen}
        reason={detail.voidReason}
        onReasonChange={detail.setVoidReason}
        onCancel={() => detail.setVoidOpen(false)}
        onOk={detail.handleVoid}
      />

      {/* 签署框放置编辑器 */}
      <PlaceFieldsModal
        open={signFields.previewOpen}
        state={signFields}
        detail={detail.detail}
        sigAssets={signAssets.sigAssets}
        sigSourceLabel={signAssets.sigSourceLabel}
        onClose={signFields.closePreview}
        onOpenSigLib={signAssets.openSigLib}
      />

      {/* 拒签弹窗 */}
      <DeclineModal
        open={detail.declineOpen}
        parties={detail.detail.parties}
        partyId={detail.declineParty}
        setPartyId={detail.setDeclineParty}
        reason={detail.declineReason}
        setReason={detail.setDeclineReason}
        onCancel={() => detail.setDeclineOpen(false)}
        onOk={detail.handleDecline}
      />

      {/* 我的签名/印章资产库 */}
      <SignAssetLibraryModal
        open={signAssets.sigLibOpen}
        onClose={() => signAssets.setSigLibOpen(false)}
        sigAssets={signAssets.sigAssets}
        sigAssetType={signAssets.sigAssetType}
        setSigAssetType={signAssets.setSigAssetType}
        sigAssetName={signAssets.sigAssetName}
        setSigAssetName={signAssets.setSigAssetName}
        sigUploading={signAssets.sigUploading}
        sigFileRef={signAssets.sigFileRef}
        onPickFile={signAssets.handleSigFile}
        onRemove={signAssets.handleSigRemove}
        sigAssetTypeLabel={signAssets.sigAssetTypeLabel}
        sigSourceLabel={signAssets.sigSourceLabel}
        sigScope={signAssets.sigScope}
        setSigScope={signAssets.setSigScope}
        sigSealType={signAssets.sigSealType}
        setSigSealType={signAssets.setSigSealType}
        canUseCompanyScope={signAssets.canUseCompanyScope}
      />

      {/* 多人签署顺序编排 */}
      <SignOrderModal
        open={detail.signOrderOpen}
        parties={detail.detail.parties}
        type={detail.detail.contract?.sign_order_type}
        onCancel={() => detail.setSignOrderOpen(false)}
        onOk={detail.handleSaveSignOrder}
      />

      {/* 签署完成回调配置 */}
      <CallbackModal
        open={detail.callbackOpen}
        url={detail.detail.contract?.callback_url}
        events={detail.callbackEvents}
        subscriptions={detail.callbackSubscriptions}
        secret={detail.callbackSecret}
        saving={detail.callbackSaving}
        onCancel={() => detail.setCallbackOpen(false)}
        onSave={detail.handleSaveCallback}
        onRetry={detail.handleRetryCallback}
      />

      {/* 免登录签署链接二维码 */}
      <ShareLinkQrModal
        open={detail.qrOpen}
        onCancel={() => detail.setQrOpen(false)}
        partyName={detail.qrPartyName}
        qrDataUrl={detail.qrDataUrl}
        url={detail.qrUrl}
      />

      {/* 印模上传裁剪弹窗 */}
      <SealCropperModal
        open={signAssets.sealCropOpen}
        src={signAssets.sealCropSrc}
        onOk={signAssets.onSealCropOk}
        onCancel={() => signAssets.setSealCropOpen(false)}
      />
    </div>
  )
}

export default Contracts
