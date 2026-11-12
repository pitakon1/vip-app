/** 合同审批中心：待我审 / 我提交的，支持查看命中规则与通过/驳回。
 *
 * 只做单级/两级串行审批，不做自由流；审批人校验、自审拒绝、层级推进
 * 全部由后端 contract_approval 服务判定，这里只负责展示与提交动作。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { contractsApi } from '@/services/api';
import { STATUS_META } from '../constants';
import { fmtDate } from '../utils';
import { styles } from '../styles';

type Scope = 'pending' | 'submitted';

interface ApprovalCenterModalProps {
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const FIELD_KEYS: Record<string, string> = {
  rent_ratio: 'contract.approval.fieldRentRatio',
  rent_free_days: 'contract.approval.fieldRentFreeDays',
  term_months: 'contract.approval.fieldTermMonths',
  deposit_months: 'contract.approval.fieldDepositMonths',
  total_discount_rate: 'contract.approval.fieldTotalDiscount',
  contract_total: 'contract.approval.fieldContractTotal',
};

export default function ApprovalCenterModal({ visible, onClose, onChanged }: ApprovalCenterModalProps) {
  const { t } = useI18n();
  const [scope, setScope] = useState<Scope>('pending');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<any | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextScope: Scope) => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await contractsApi.listApprovals(nextScope);
      const data = res?.data ?? res;
      setItems(Array.isArray(data) ? data : data?.items ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.msg || e?.message || t('contract.approval.errLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!visible) return;
    setActive(null);
    setComment('');
    load(scope);
  }, [visible, scope, load]);

  const openDetail = async (item: any) => {
    setComment('');
    try {
      const res: any = await contractsApi.getApproval(String(item.id));
      setActive(res?.data ?? res);
    } catch (e: any) {
      setError(e?.response?.data?.msg || e?.message || t('contract.approval.errLoad'));
    }
  };

  const act = async (kind: 'approve' | 'reject') => {
    if (!active) return;
    if (kind === 'reject' && !comment.trim()) {
      setError(t('contract.approval.commentRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === 'approve') {
        await contractsApi.approveApproval(String(active.id), comment.trim() || undefined);
      } else {
        await contractsApi.rejectApproval(String(active.id), comment.trim());
      }
      setActive(null);
      setComment('');
      await load(scope);
      onChanged?.();
    } catch (e: any) {
      setError(
        e?.response?.data?.msg ||
          e?.response?.data?.detail ||
          e?.message ||
          t(kind === 'approve' ? 'contract.approval.errApprove' : 'contract.approval.errReject'),
      );
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (status?: string) => {
    switch (status) {
      case 'approved':
        return t('contract.approval.statusApproved');
      case 'rejected':
        return t('contract.approval.statusRejected');
      case 'cancelled':
        return t('contract.approval.statusCancelled');
      default:
        return t('contract.approval.statusPending');
    }
  };

  const tab = (key: Scope, label: string) => (
    <TouchableOpacity
      key={key}
      style={[styles.approvalTab, scope === key && styles.approvalTabActive]}
      activeOpacity={0.8}
      onPress={() => {
        setScope(key);
        setActive(null);
      }}
    >
      <Text style={[styles.approvalTabText, scope === key && styles.approvalTabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalMask}>
        <View style={[styles.modalCard, styles.approvalCard]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>
              {active ? t('contract.approval.detailTitle') : t('contract.approval.title')}
            </Text>
            <View style={styles.approvalHeadRight}>
              {active ? (
                <TouchableOpacity onPress={() => setActive(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="arrow-back" size={20} color={colors.ink2} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
          </View>

          {!active ? (
            <>
              <View style={styles.approvalTabs}>
                {tab('pending', t('contract.approval.tabPending'))}
                {tab('submitted', t('contract.approval.tabSubmitted'))}
              </View>
              {error ? <Text style={styles.approvalError}>{error}</Text> : null}
              <ScrollView
                style={styles.approvalList}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(scope)} />}
              >
                {items.length === 0 && !loading ? (
                  <Text style={styles.approvalEmpty}>{t('contract.approval.empty')}</Text>
                ) : null}
                {items.map((it) => (
                  <TouchableOpacity
                    key={String(it.id)}
                    style={styles.approvalItem}
                    activeOpacity={0.8}
                    onPress={() => openDetail(it)}
                  >
                    <View style={styles.approvalItemTop}>
                      <Text style={styles.approvalItemTitle} numberOfLines={1}>
                        {it.contract_title || it.contract_no || t('contract.approval.contractFallback')}
                      </Text>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor:
                              it.status === 'approved'
                                ? colors.alpha(colors.successRgb, 0.12)
                                : it.status === 'rejected'
                                ? colors.alpha(colors.errorRgb, 0.1)
                                : colors.alpha(colors.warningRgb, 0.12),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            {
                              color:
                                it.status === 'approved'
                                  ? colors.success
                                  : it.status === 'rejected'
                                  ? colors.error
                                  : colors.warning,
                            },
                          ]}
                        >
                          {statusLabel(it.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.approvalItemMeta}>
                      {`${t('contract.approval.submitter')}：${it.submitter_name || '-'} · ${fmtDate(
                        it.submitted_at,
                      )}`}
                    </Text>
                    <Text style={styles.approvalItemMeta}>
                      {`${t('contract.approval.levelProgress')}：${it.current_level}/${it.required_level}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <ScrollView style={styles.approvalList} contentContainerStyle={styles.approvalDetailContent}>
              <Text style={styles.approvalDetailTitle}>{active.contract_title || '-'}</Text>
              <Text style={styles.approvalItemMeta}>{`${t('contract.approval.contract')}：${
                active.contract_no || '-'
              }`}</Text>
              <Text style={styles.approvalItemMeta}>{`${t('contract.approval.status')}：${statusLabel(
                active.status,
              )}`}</Text>
              <Text style={styles.approvalItemMeta}>{`${t('contract.approval.submitter')}：${
                active.submitter_name || '-'
              }`}</Text>
              <Text style={styles.approvalItemMeta}>{`${t('contract.approval.levelProgress')}：${
                active.current_level
              }/${active.required_level}`}</Text>

              <Text style={styles.approvalSection}>{t('contract.approval.ruleHits')}</Text>
              {(active.rule_hits || []).length === 0 ? (
                <Text style={styles.approvalEmpty}>{t('contract.approval.noRuleHits')}</Text>
              ) : (
                (active.rule_hits || []).map((hit: any, idx: number) => (
                  <Text key={`${hit.rule_id || idx}`} style={styles.approvalRule}>
                    {`${t(FIELD_KEYS[hit.field] || 'contract.approval.contractTotal')} ${
                      hit.operator
                    } ${hit.threshold} · ${t('contract.approval.actualValue')} ${hit.value} · L${
                      hit.approval_level || 1
                    }`}
                  </Text>
                ))
              )}

              <Text style={styles.approvalSection}>{t('contract.approval.opinion')}</Text>
              <TextInput
                style={styles.input}
                value={comment}
                onChangeText={setComment}
                multiline
                placeholder={t('contract.approval.opinionPlaceholder')}
                placeholderTextColor={colors.ink3}
              />
              {active.comment ? (
                <Text style={styles.approvalItemMeta}>{`${t('contract.approval.opinion')}：${active.comment}`}</Text>
              ) : null}
              {error ? <Text style={styles.approvalError}>{error}</Text> : null}

              {active.status === 'pending' && scope === 'pending' ? (
                <View style={styles.approvalActions}>
                  <TouchableOpacity
                    style={[styles.approvalBtn, styles.approvalRejectBtn, busy && styles.btnDisabled]}
                    disabled={busy}
                    activeOpacity={0.85}
                    onPress={() => act('reject')}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.error} />
                    ) : (
                      <Text style={styles.approvalRejectText}>{t('contract.approval.reject')}</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.approvalBtn, busy && styles.btnDisabled]}
                    disabled={busy}
                    activeOpacity={0.85}
                    onPress={() => act('approve')}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>{t('contract.approval.approve')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
