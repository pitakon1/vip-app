/**
 * 员工/管理端「电子合同」管理页。
 *
 * 共用后端 contractsApi（员工可见全量，可生成 / 追加签署方 / 复制签署链接 /
 * 推送签署通知 / 编辑 / 作废 / 上传电子合同文件）。
 *
 * 只读字段由后端返回，`can_edit` 为 false 时仅展示、隐藏全部写操作。
 * 功能图标一律 SVG（Ionicons），长列表用 FlatList；文本全部走 i18n 三语。
 *
 * 结构：本文件只做编排；列表 / 弹窗 / hooks 均在 `./contracts` 私有目录内，
 * 不产生跨端共享文件。
 */
import React from 'react';
import { View } from 'react-native';
import LoadingState from '@/components/LoadingState';
import SignAssetPicker from '@/components/SignAssetPicker';
import { useI18n } from '@/i18n';
import { notify } from '@/utils/feedback';
import { FIELD_META, FALLBACK_TEMPLATES, KIND_FIELDS } from './contracts/constants';
import { stripHtml } from './contracts/utils';
import { styles } from './contracts/styles';
import { useContractsList } from './contracts/hooks/useContractsList';
import { useContractDetail } from './contracts/hooks/useContractDetail';
import { useContractActions } from './contracts/hooks/useContractActions';
import { useSignStudio } from './contracts/hooks/useSignStudio';
import ContractsList from './contracts/components/ContractsList';
import ContractDetailModal from './contracts/components/ContractDetailModal';
import GenerateContractModal from './contracts/components/GenerateContractModal';
import AddPartyModal from './contracts/components/AddPartyModal';
import EditContractModal from './contracts/components/EditContractModal';
import VoidContractModal from './contracts/components/VoidContractModal';
import RevokeModal from './contracts/components/RevokeModal';
import RemindModal from './contracts/components/RemindModal';
import ShareQrModal from './contracts/components/ShareQrModal';
import ApprovalCenterModal from './contracts/components/ApprovalCenterModal';
import DeclineModal from './contracts/components/DeclineModal';
import VerifyModal from './contracts/components/VerifyModal';
import SignFieldStudio from './contracts/components/SignFieldStudio';
import SignMakeModal from './contracts/components/SignMakeModal';

export default function ContractsScreen() {
  const { t } = useI18n();
  const { list, loading, refreshing, error, load, refresh } = useContractsList();
  const { detail, detailLoading, openDetail, closeDetail } = useContractDetail();
  const actions = useContractActions({ detail, openDetail, reload: load, closeDetail });
  const canEdit = !!detail?.can_edit;
  const parties: any[] = Array.isArray(detail?.parties) ? detail.parties : [];
  const signFields: any[] = Array.isArray(detail?.sign_fields) ? detail.sign_fields : [];
  const studio = useSignStudio({ detail, parties, signFields, openDetail });

  // 当前选中模板的范本正文（后端用空字段渲染出的标准样张），无 content_html 时展示内置字段表样例
  const genPreviewHtml =
    (actions.templates.length ? actions.templates : FALLBACK_TEMPLATES)
      .find((item) => item.kind === actions.genKind)?.content_html || '';
  const genPreviewText = genPreviewHtml
    ? stripHtml(genPreviewHtml)
    : (KIND_FIELDS[actions.genKind] ?? []).map((f) => `· ${t(FIELD_META[f].labelKey)}: ____`).join('\n');

  if (loading && list.length === 0) {
    return (
      <View style={styles.center}>
        <LoadingState label={t('pub.loading')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ContractsList
        list={list}
        refreshing={refreshing}
        error={error}
        onRefresh={refresh}
        onRetry={() => load()}
        onOpenDetail={openDetail}
        onGenerate={() => actions.setShowGenerate(true)}
        onOpenApproval={() => actions.setShowApproval(true)}
      />

      {/* ===== 生成合同 ===== */}
      <GenerateContractModal
        visible={actions.showGenerate}
        onClose={() => actions.setShowGenerate(false)}
        templates={actions.templates}
        genKind={actions.genKind}
        setGenKind={actions.setGenKind}
        genLang={actions.genLang}
        setGenLang={actions.setGenLang}
        genForm={actions.genForm}
        setGenForm={actions.setGenForm}
        generating={actions.generating}
        onSubmit={actions.submitGenerate}
        genPreviewText={genPreviewText}
      />

      {/* ===== 详情 ===== */}
      <ContractDetailModal
        detail={detail}
        detailLoading={detailLoading}
        canEdit={canEdit}
        parties={parties}
        signFields={signFields}
        fieldsBusy={studio.fieldsBusy}
        busyAction={actions.busyAction}
        onClose={closeDetail}
        onShareLink={actions.handleShareLink}
        onRemoveField={studio.removeField}
        onSend={actions.handleSend}
        onAddFields={studio.openStudioFields}
        onVerify={actions.doVerify}
        onAddParty={() => actions.setShowParty(true)}
        onEdit={actions.openEditor}
        onUpload={actions.handleUpload}
        onOpenSealLib={studio.openSealLib}
        onDecline={() => actions.openDecline(parties)}
        onVoid={() => actions.setShowVoid(true)}
        onRemind={actions.openRemind}
        onRevoke={actions.openRevoke}
        onQr={() => actions.openQr(parties)}
        onDownloadSigned={actions.downloadSigned}
        onDownloadEvidence={actions.downloadEvidence}
        onSubmitApproval={actions.submitApproval}
        onOpenApproval={() => actions.setShowApproval(true)}
        approvalBusy={actions.approvalBusy}
      />

      {/* ===== 催办 ===== */}
      <RemindModal
        visible={actions.showRemind}
        onClose={() => actions.setShowRemind(false)}
        parties={parties}
        selectedPartyId={actions.remindPartyId}
        setSelectedPartyId={actions.setRemindPartyId}
        busy={actions.remindBusy}
        onSubmit={actions.submitRemind}
      />

      {/* ===== 撤回 ===== */}
      <RevokeModal
        visible={actions.showRevoke}
        onClose={() => actions.setShowRevoke(false)}
        reason={actions.revokeReason}
        setReason={actions.setRevokeReason}
        busy={actions.revokeBusy}
        onSubmit={actions.doRevoke}
      />

      {/* ===== 签署二维码 ===== */}
      <ShareQrModal
        visible={actions.showQr}
        onClose={() => actions.setShowQr(false)}
        parties={parties}
        selectedPartyId={actions.qrPartyId}
        setSelectedPartyId={actions.setQrPartyId}
        busy={actions.qrBusy}
        link={actions.qrLink}
        onGenerate={actions.generateQr}
        onCopy={actions.copyQrLink}
      />

      {/* ===== 审批中心（待我审 / 我提交的）===== */}
      <ApprovalCenterModal
        visible={actions.showApproval}
        onClose={() => actions.setShowApproval(false)}
        onChanged={() => {
          load();
          if (detail?.id) openDetail(detail.id);
        }}
      />

      {/* ===== 追加签署方 ===== */}
      <AddPartyModal
        visible={actions.showParty}
        onClose={() => actions.setShowParty(false)}
        partyForm={actions.partyForm}
        setPartyForm={actions.setPartyForm}
        partyBusy={actions.partyBusy}
        onSubmit={actions.submitParty}
      />

      {/* ===== 编辑 ===== */}
      <EditContractModal
        visible={actions.showEdit}
        onClose={() => actions.setShowEdit(false)}
        editForm={actions.editForm}
        setEditForm={actions.setEditForm}
        editBusy={actions.editBusy}
        onSubmit={actions.submitEdit}
      />

      {/* ===== 作废 ===== */}
      <VoidContractModal
        visible={actions.showVoid}
        onClose={() => actions.setShowVoid(false)}
        voidReason={actions.voidReason}
        setVoidReason={actions.setVoidReason}
        voidBusy={actions.voidBusy}
        onSubmit={actions.doVoid}
      />

      {/* ===== 添加签署区 ===== */}
      <SignFieldStudio
        studio={studio}
        detail={detail}
        parties={parties}
        canEdit={canEdit}
        onAddParty={() => {
          studio.setShowAddFields(false);
          actions.setShowParty(true);
        }}
      />

      {/* ===== 验签报告 ===== */}
      <VerifyModal
        verifyData={actions.verifyData}
        verifyLoading={actions.verifyLoading}
        onClose={() => actions.setVerifyData(null)}
      />

      {/* ===== 拒签（选签署方 + 原因）===== */}
      <DeclineModal
        visible={actions.showDecline}
        onClose={() => actions.setShowDecline(false)}
        parties={parties}
        declinePartyId={actions.declinePartyId}
        setDeclinePartyId={actions.setDeclinePartyId}
        declineReason={actions.declineReason}
        setDeclineReason={actions.setDeclineReason}
        declineBusy={actions.declineBusy}
        onSubmit={actions.confirmDecline}
      />

      {/* ===== 我的签名/印章库（复用弹窗，含印章/手写签名类型切换）===== */}
      <SignAssetPicker
        visible={studio.showLibrary}
        onClose={() => studio.setShowLibrary(false)}
        assetType={studio.libAssetType}
        onAssetTypeChange={studio.setLibAssetType}
        onSelect={(asset: any) => {
          if (asset?.data_url) {
            if (asset.asset_type === 'seal') studio.setSealAsset(asset);
            else studio.setSignAsset(asset);
          }
          notify(t('contract.assetSaved'));
          studio.setShowLibrary(false);
        }}
      />

      {/* ===== 手写签名画板（手写签名入口直接弹出，写完「使用该签名」入库并回填）===== */}
      <SignMakeModal
        visible={studio.signMakeVisible}
        onClose={() => studio.setSignMakeVisible(false)}
        onResult={studio.setSignDraftSvg}
        svgRef={studio.signSvgRef}
        onUse={studio.useSignDraft}
      />
    </View>
  );
}
