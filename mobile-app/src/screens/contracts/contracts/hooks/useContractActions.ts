/** 合同写操作与弹窗状态：生成 / 追加签署方 / 编辑 / 作废 / 通知 / 分享 / 上传 / 验签 / 拒签。 */
import { useCallback, useEffect, useState } from 'react';
import { Platform, Clipboard } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { contractsApi } from '@/services/api';
import { downloadProtectedFile, toPublicSignUrl } from '@/lib/api';
import { notify, notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import { FALLBACK_TEMPLATES, FIELD_META, KIND_FIELDS } from '../constants';
import { resolveUploadFile } from '../utils';
import type { ContractTemplate, GenerateForm, PartyForm } from '../types';

interface UseContractActionsOptions {
  detail: any;
  openDetail: (id: string) => Promise<void>;
  reload: (silent?: boolean) => Promise<void>;
  closeDetail: () => void;
}

export function useContractActions({ detail, openDetail, reload, closeDetail }: UseContractActionsOptions) {
  const { t } = useI18n();

  // 生成表单
  const [showGenerate, setShowGenerate] = useState(false);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [genKind, setGenKind] = useState('lease');
  const [genLang, setGenLang] = useState('zh');
  const [genForm, setGenForm] = useState<GenerateForm>(() =>
    Object.fromEntries(Object.keys(FIELD_META).map((f) => [f, '' as string]))
  );
  const [generating, setGenerating] = useState(false);

  // 追加签署方
  const [showParty, setShowParty] = useState(false);
  const [partyForm, setPartyForm] = useState<PartyForm>({ name: '', email: '', role: 'tenant' });
  const [partyBusy, setPartyBusy] = useState(false);

  // 验签
  const [verifyData, setVerifyData] = useState<any>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  // 编辑
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', content_html: '' });
  const [editBusy, setEditBusy] = useState(false);

  // 作废
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const [busyAction, setBusyAction] = useState<string | null>(null);

  // 催办（单个 / 全部，24 小时抑制由后端判定）
  const [showRemind, setShowRemind] = useState(false);
  const [remindPartyId, setRemindPartyId] = useState('');
  const [remindBusy, setRemindBusy] = useState(false);

  // 撤回
  const [showRevoke, setShowRevoke] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeBusy, setRevokeBusy] = useState(false);

  // 二维码（生成链接会覆盖旧 token）
  const [showQr, setShowQr] = useState(false);
  const [qrPartyId, setQrPartyId] = useState('');
  const [qrLink, setQrLink] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);

  // 审批
  const [showApproval, setShowApproval] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);

  // 拒签
  const [showDecline, setShowDecline] = useState(false);
  const [declinePartyId, setDeclinePartyId] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declineBusy, setDeclineBusy] = useState(false);

  // 加载合同模板类型（后端 /contracts/templates）；失败时回退内置三模板
  useEffect(() => {
    (async () => {
      try {
        const res: any = await contractsApi.listTemplates();
        const data = Array.isArray(res?.data) ? res.data : null;
        if (data && data.length) {
          setTemplates(data);
          if (!data.some((item: any) => item.kind === genKind) && data[0]) {
            setGenKind(data[0].kind);
          }
        } else {
          setTemplates(FALLBACK_TEMPLATES);
        }
      } catch {
        setTemplates(FALLBACK_TEMPLATES);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyText = (text: string) => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-console
      navigator.clipboard?.writeText(text).catch(() => {});
    } else {
      Clipboard.setString(text);
    }
  };

  /* ===== 生成合同 ===== */
  const submitGenerate = async () => {
    setGenerating(true);
    const kind = genKind;
    const counters: any = {};
    (KIND_FIELDS[kind] ?? []).forEach((f) => {
      if (genForm[f]) counters[f] = genForm[f];
    });
    try {
      await contractsApi.generate({ counters, language: genLang, kind });
      notify(t('contract.generateDone'));
      setShowGenerate(false);
      await reload(true);
    } catch (e) {
      notifyError(t('contract.generateTitle'), e);
    } finally {
      setGenerating(false);
    }
  };

  /* ===== 复制签署链接 ===== */
  const handleShareLink = async (partyId: string) => {
    if (!detail?.id) return;
    setBusyAction(`link-${partyId}`);
    try {
      const res: any = await contractsApi.createShareLink(detail.id, partyId);
      const url = res?.data?.url ?? res?.data?.token ?? '';
      if (!url) {
        notifyError(t('contract.linkCopied'), new Error(t('contract.unknown')));
        return;
      }
      // 后端返回的是相对路径时必须补站点 origin，否则客户拿到的链接打不开
      const full = toPublicSignUrl(url);
      copyText(full);
      notify(t('contract.linkCopied'), full);
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.copyLink'), e);
    } finally {
      setBusyAction(null);
    }
  };

  /* ===== 发送签署通知 ===== */
  const handleSend = async () => {
    if (!detail?.id) return;
    setBusyAction('send');
    try {
      await contractsApi.sendContract(detail.id, {});
      notify(t('contract.sendDone'));
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.sendNotice'), e);
    } finally {
      setBusyAction(null);
    }
  };

  /* ===== 追加签署方 ===== */
  const submitParty = async () => {
    if (!detail?.id || !partyForm.name.trim()) {
      notify(t('contract.insert'));
      return;
    }
    setPartyBusy(true);
    try {
      await contractsApi.addParty(detail.id, {
        name: partyForm.name.trim(),
        email: partyForm.email.trim() || undefined,
        role: partyForm.role || 'tenant',
      });
      notify(t('contract.addParty'));
      setShowParty(false);
      setPartyForm({ name: '', email: '', role: 'tenant' });
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.addParty'), e);
    } finally {
      setPartyBusy(false);
    }
  };

  /* ===== 验签 ===== */
  const doVerify = async () => {
    if (!detail?.id) return;
    setVerifyLoading(true);
    try {
      const res: any = await contractsApi.verify(detail.id);
      setVerifyData(res?.data ?? {});
    } catch (e) {
      notifyError(t('contract.verifyError'), e);
    } finally {
      setVerifyLoading(false);
    }
  };

  /* ===== 站内拒签（选签署方 + 原因）===== */
  const confirmDecline = async () => {
    if (!detail?.id || !declinePartyId) return;
    setDeclineBusy(true);
    try {
      await contractsApi.decline(detail.id, declinePartyId, declineReason.trim());
      notify(t('contract.declineDone'));
      setShowDecline(false);
      setDeclineReason('');
      await openDetail(detail.id);
      await reload(true);
    } catch (e) {
      notifyError(t('contract.declineDone'), e);
    } finally {
      setDeclineBusy(false);
    }
  };

  /* ===== 编辑 ===== */
  const openEditor = () => {
    setEditForm({ title: detail?.title ?? '', content_html: detail?.content_html ?? '' });
    setShowEdit(true);
  };
  const submitEdit = async () => {
    if (!detail?.id) return;
    setEditBusy(true);
    try {
      await contractsApi.updateContract(detail.id, {
        title: editForm.title.trim(),
        content_html: editForm.content_html,
      });
      notify(t('contract.save'));
      setShowEdit(false);
      await openDetail(detail.id);
      await reload(true);
    } catch (e) {
      notifyError(t('contract.editContent'), e);
    } finally {
      setEditBusy(false);
    }
  };

  /* ===== 作废 ===== */
  const doVoid = async () => {
    if (!detail?.id) return;
    setVoidBusy(true);
    try {
      await contractsApi.voidContract(detail.id, voidReason.trim() || undefined);
      notify(t('contract.void'));
      setShowVoid(false);
      setVoidReason('');
      closeDetail();
      await reload(true);
    } catch (e) {
      notifyError(t('contract.void'), e);
    } finally {
      setVoidBusy(false);
    }
  };

  /* ===== 催办 ===== */
  const openRemind = useCallback(() => {
    setRemindPartyId('');
    setShowRemind(true);
  }, []);
  const submitRemind = async () => {
    if (!detail?.id) return;
    setRemindBusy(true);
    try {
      const res: any = await contractsApi.remindContract(
        detail.id,
        remindPartyId ? { party_id: remindPartyId } : {},
      );
      const data = res?.data ?? {};
      notify(t('contract.remindDone'), t('contract.remindResult', {
        reminded: data?.reminded ?? 0,
        throttled: data?.throttled ?? 0,
      }));
      setShowRemind(false);
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.remind'), e);
    } finally {
      setRemindBusy(false);
    }
  };

  /* ===== 撤回 ===== */
  const openRevoke = useCallback(() => {
    setRevokeReason('');
    setShowRevoke(true);
  }, []);
  const doRevoke = async () => {
    if (!detail?.id) return;
    setRevokeBusy(true);
    try {
      await contractsApi.revokeContract(detail.id, revokeReason.trim() || undefined);
      notify(t('contract.revokeDone'));
      setShowRevoke(false);
      setRevokeReason('');
      await openDetail(detail.id);
      await reload(true);
    } catch (e) {
      notifyError(t('contract.revoke'), e);
    } finally {
      setRevokeBusy(false);
    }
  };

  /* ===== 已签文件 / 存证报告 ===== */
  const downloadSigned = async () => {
    if (!detail?.id) return;
    setBusyAction('signed');
    try {
      const name = `${detail.contract_no || 'contract'}_signed.pdf`;
      const ok = await downloadProtectedFile(`/contracts/${detail.id}/signed-file`, name);
      notify(ok ? t('contract.downloadDone') : t('contract.downloadNativeHint'));
    } catch (e) {
      notifyError(t('contract.downloadSigned'), e);
    } finally {
      setBusyAction(null);
    }
  };
  const downloadEvidence = async () => {
    if (!detail?.id) return;
    setBusyAction('evidence');
    try {
      const name = `${detail.contract_no || 'contract'}_evidence.pdf`;
      const ok = await downloadProtectedFile(`/contracts/${detail.id}/evidence-report`, name);
      notify(ok ? t('contract.downloadDone') : t('contract.downloadNativeHint'));
    } catch (e) {
      notifyError(t('contract.downloadEvidence'), e);
    } finally {
      setBusyAction(null);
    }
  };

  /* ===== 二维码 ===== */
  const openQr = useCallback((parties: any[]) => {
    const target = parties.find((p: any) => !p?.signed && !p?.declined_at && !!p?.id) ?? parties[0];
    setQrPartyId(String(target?.id ?? ''));
    setQrLink(null);
    setShowQr(true);
  }, []);
  const generateQr = async () => {
    if (!detail?.id || !qrPartyId) return;
    setQrBusy(true);
    try {
      const res: any = await contractsApi.createShareLink(detail.id, qrPartyId);
      const url = res?.data?.url ?? res?.data?.token ?? '';
      setQrLink(url ? toPublicSignUrl(url) : null);
    } catch (e) {
      notifyError(t('contract.qrTitle'), e);
    } finally {
      setQrBusy(false);
    }
  };
  const copyQrLink = () => {
    if (qrLink) {
      Clipboard.setString(qrLink);
      notify(t('contract.linkCopied'), qrLink);
    }
  };

  /* ===== 提交审批 ===== */
  const submitApproval = async () => {
    if (!detail?.id) return;
    setApprovalBusy(true);
    try {
      const res: any = await contractsApi.submitApproval(detail.id);
      const data = res?.data ?? {};
      notify(
        data?.requires_approval
          ? t('contract.approval.msgSubmitted')
          : t('contract.approval.msgNotRequired'),
      );
      await openDetail(detail.id);
      await reload(true);
    } catch (e) {
      notifyError(t('contract.approval.submit'), e);
    } finally {
      setApprovalBusy(false);
    }
  };

  /* ===== 上传电子合同 ===== */
  const handleUpload = async () => {
    if (!detail?.id) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = resolveUploadFile(result.assets[0]);
      setBusyAction('upload');
      await contractsApi.uploadFile(detail.id, file);
      notify(t('contract.uploadDone'));
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.upload'), e);
    } finally {
      setBusyAction(null);
    }
  };

  // 打开拒签弹窗：默认选中第一个未签且未拒签的签署方
  const openDecline = useCallback((parties: any[]) => {
    const target = parties.find((p: any) => !p?.signed && !p?.declined_at && !!p?.id) ?? parties[0];
    setDeclinePartyId(String(target?.id ?? ''));
    setDeclineReason('');
    setShowDecline(true);
  }, []);

  return {
    showGenerate,
    setShowGenerate,
    templates,
    genKind,
    setGenKind,
    genLang,
    setGenLang,
    genForm,
    setGenForm,
    generating,
    submitGenerate,
    showParty,
    setShowParty,
    partyForm,
    setPartyForm,
    partyBusy,
    submitParty,
    verifyData,
    setVerifyData,
    verifyLoading,
    doVerify,
    showEdit,
    setShowEdit,
    editForm,
    setEditForm,
    editBusy,
    openEditor,
    submitEdit,
    showVoid,
    setShowVoid,
    voidReason,
    setVoidReason,
    voidBusy,
    doVoid,
    busyAction,
    handleShareLink,
    handleSend,
    handleUpload,
    showRemind,
    setShowRemind,
    remindPartyId,
    setRemindPartyId,
    remindBusy,
    openRemind,
    submitRemind,
    showRevoke,
    setShowRevoke,
    revokeReason,
    setRevokeReason,
    revokeBusy,
    openRevoke,
    doRevoke,
    downloadSigned,
    downloadEvidence,
    showQr,
    setShowQr,
    qrPartyId,
    setQrPartyId,
    qrLink,
    qrBusy,
    openQr,
    generateQr,
    copyQrLink,
    showApproval,
    setShowApproval,
    approvalBusy,
    submitApproval,
    showDecline,
    setShowDecline,
    declinePartyId,
    setDeclinePartyId,
    declineReason,
    setDeclineReason,
    declineBusy,
    confirmDecline,
    openDecline,
  };
}
