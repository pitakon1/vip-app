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
import ContractDetailCard from './ContractDetailCard'
import ContractEditModal from './ContractEditModal'
import AddPartyModal from './AddPartyModal'
import VoidContractModal from './VoidContractModal'
import PlaceFieldsModal from './PlaceFieldsModal'
import DeclineModal from './DeclineModal'
import SignAssetLibraryModal from './SignAssetLibraryModal'

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

      <ContractList
        contracts={list.contracts}
        loading={list.contractsLoading}
        error={list.contractsError}
        onRetry={() => { void list.loadList() }}
        onOpen={detail.handleOpen}
      />

      {detail.detail.contract && (
        <ContractDetailCard
          detail={detail.detail}
          canEdit={detail.canEdit}
          onCopyLink={detail.handleCopyLink}
          onSend={detail.handleSend}
          onOpenPreview={signFields.openPreview}
          onOpenSigLib={signAssets.openSigLib}
          onOpenEdit={detail.openEdit}
          onOpenParty={() => detail.setPartyOpen(true)}
          onOpenVoid={() => detail.setVoidOpen(true)}
          onDecline={detail.openDecline}
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
