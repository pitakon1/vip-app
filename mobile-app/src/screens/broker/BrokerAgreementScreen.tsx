/**
 * 经纪人协议在线签约。
 * 展示两份协议《房源经纪人上架房源协议》《平台经纪人分销协议》签署状态；
 * 未签可生成并在线签，全部签署后激活 listing_active / distributor_active。
 * 流程：GET /brokers/me → GET /brokers/{id}/agreements → POST createAgreement → GET /contracts/{id} → POST sign。
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import SignaturePad from '@/components/SignaturePad';
import { brokerApi, contractsApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { notify, notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';

interface AgreementState {
  contract_id: string | null;
  status: string;
  signed: boolean;
}

interface BrokerMe {
  id: string;
  listing_active?: boolean;
  distributor_active?: boolean;
  listing_contract_id?: string | null;
  distributor_contract_id?: string | null;
  partner_name?: string;
}

export default function BrokerAgreementScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [broker, setBroker] = useState<BrokerMe | null>(null);
  const [agreements, setAgreements] = useState<{
    distributor: AgreementState;
    listing_agent: AgreementState;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  // 请求失败与「确实没有经纪人身份」必须区分：此前失败后 broker 仍为 null，
  // 页面直接落到「暂无经纪人身份」，用户会误以为账号权限有问题且无重试入口。
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyRole, setBusyRole] = useState<string | null>(null);
  // 手写签名：后端只接受 <svg>（signature_svg），签名资产库存的是 PNG，
  // 直接提交会 400。这里改由 SignaturePad 现场产出 SVG 描边路径并随签署提交，
  // 不再依赖「按 party.name 服务端渲染签名」的绕过路径。
  const [signRole, setSignRole] = useState<'listing_agent' | 'distributor' | null>(null);
  const [signSvg, setSignSvg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const meRes: any = await brokerApi.me();
      const me = meRes?.data ?? {};
      setBroker(me);
      setLoadFailed(false);
      if (me?.id) {
        const agRes: any = await brokerApi.agreements(me.id);
        setAgreements(agRes?.data ?? null);
      }
    } catch (e: any) {
      setBroker(null);
      setAgreements(null);
      setLoadFailed(true);
      notifyError(t('broker.loadFail'), e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const generateAndSign = async (role: 'listing_agent' | 'distributor', signatureSvg: string) => {
    if (!broker?.id) return;
    setBusyRole(role);
    try {
      // 已存在有效协议 → 后端直接返回既有
      const gen: any = await brokerApi.createAgreement(broker.id, role);
      const cid = gen?.data?.contract_id;
      if (!cid) {
        notify(t('broker.retryMsg'), t('broker.genFail'));
        return;
      }
      const detail: any = await contractsApi.get(cid);
      const d = detail?.data;
      const parties = Array.isArray(d?.parties) ? (d.parties as any[]) : [];
      const signFields = Array.isArray(d?.sign_fields) ? (d.sign_fields as any[]) : [];
      // 只签「本人」那一方：此前按 role=agent 猜、甚至回退到最后一方的 id，
      // 加上后端 /sign 要求 {party_id, method}，而这里只发了 {field_id, method}，
      // 所以签署必然失败。现在严格按 party.user_id === 当前用户 取本人。
      const self = currentUserId
        ? parties.find((p) => p?.user_id && String(p.user_id) === String(currentUserId))
        : undefined;
      if (!self?.id) {
        notify(t('broker.retryMsg'), t('broker.noSignSlot'));
        return;
      }
      // 若本人名下已有待签签署区，一并带上（按区签署）；否则整方签署
      const target =
        signFields.find((f) => String(f?.party_id) === String(self.id) && !f?.signed) ??
        signFields.find((f) => String(f?.party_id) === String(self.id));
      await contractsApi.sign(cid, {
        party_id: String(self.id),
        ...(target?.id ? { field_id: String(target.id) } : {}),
        // 后端 SignMethod 枚举值；旧代码传 field_type（signature/seal/date）必然 400
        method: 'personal_handwrite',
        // 现场手写 SVG（<path>/<circle> 描边），与 Web 端签署走同一条通路
        ...(signatureSvg ? { signature_svg: signatureSvg } : {}),
      });
      notify(t('broker.signSuccess'), t('broker.signSuccessMsg'));
      setSignRole(null);
      setSignSvg('');
      await load();
    } catch (e: any) {
      notifyError(t('broker.signFail'), e);
    } finally {
      setBusyRole(null);
    }
  };

  const card = (
    role: 'listing_agent' | 'distributor',
    title: string,
    desc: string,
    state: AgreementState | undefined,
    active: boolean | undefined,
  ) => {
    if (!state) return null;
    const signed = state.signed;
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDesc}>{desc}</Text>
        <View style={styles.statusRow}>
          {signed ? (
            <Text style={styles.statusSigned}>{t('broker.signedActive')}</Text>
          ) : (
            <Text style={styles.statusUnsigned}>{t('broker.unsigned')}</Text>
          )}
          {active ? <Text style={styles.statusActive}>{t('broker.inUse')}</Text> : null}
        </View>
        <Text style={styles.settingTip}>
          {role === 'listing_agent' ? t('broker.listingTip') : t('broker.distributorTip')}
        </Text>
        {!signed ? (
          <TouchableOpacity
            style={styles.signBtn}
            activeOpacity={0.8}
            disabled={busyRole === role}
            onPress={() => {
              setSignRole(role);
              setSignSvg('');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('broker.signA11y', { title })}
          >
            {busyRole === role ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.signBtnText}>{t('broker.signBtn')}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
    );
  }

  if (loadFailed) {
    return (
      <View style={styles.center}>
        <Text style={styles.failTitle}>{t('broker.loadFail')}</Text>
        <Text style={styles.failSub}>{t('broker.loadFailSub')}</Text>
        <TouchableOpacity style={styles.retryBtn} activeOpacity={0.8} onPress={() => void load()}>
          <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!broker?.id) {
    return (
      <View style={styles.center}>
        <Text style={styles.noneText}>{t('broker.noBroker')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.head}>{t('broker.title')}</Text>
        <Text style={styles.headSub}>{t('broker.subtitle')}</Text>

        {card(
          'listing_agent',
          t('broker.listingTitle'),
          t('broker.listingDesc'),
          agreements?.listing_agent,
          broker.listing_active,
        )}
        {card(
          'distributor',
          t('broker.distributorTitle'),
          t('broker.distributorDesc'),
          agreements?.distributor,
          broker.distributor_active,
        )}

        {(broker.listing_active || broker.distributor_active) ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {broker.listing_active && broker.distributor_active
                ? t('broker.activeBoth')
                : broker.listing_active
                  ? t('broker.activeListing')
                  : t('broker.activeDistributor')}
            </Text>
          </View>
        ) : null}

        <Text style={styles.footNote}>{t('broker.footNote')}</Text>
      </ScrollView>

      <Modal
        visible={!!signRole}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!busyRole) {
            setSignRole(null);
            setSignSvg('');
          }
        }}
      >
        <View style={styles.modalMask}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('broker.signModalTitle')}</Text>
            <Text style={styles.modalSub}>{t('broker.signModalSub')}</Text>
            <SignaturePad title={t('broker.signArea')} onResult={setSignSvg} height={180} />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                activeOpacity={0.8}
                disabled={!!busyRole}
                onPress={() => {
                  setSignRole(null);
                  setSignSvg('');
                }}
              >
                <Text style={styles.modalBtnGhostText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, (!signSvg || !!busyRole) && styles.modalBtnDisabled]}
                activeOpacity={0.8}
                disabled={!signSvg || !!busyRole}
                onPress={() => signRole && generateAndSign(signRole, signSvg)}
              >
                {busyRole ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.modalBtnText}>{t('broker.confirmSign')}</Text>
                )}
              </TouchableOpacity>
            </View>
            {!signSvg ? <Text style={styles.modalHint}>{t('broker.signHint')}</Text> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: 18,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  modalSub: { fontSize: 12, color: colors.ink3, marginTop: 4, marginBottom: 12 },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: colors.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  modalBtnDisabled: { opacity: 0.5 },
  modalBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
  modalBtnGhost: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtnGhostText: { color: colors.ink2, fontSize: 15, fontWeight: '600' },
  modalHint: { fontSize: 12, color: colors.warning, marginTop: 10, textAlign: 'center' },
  noneText: { fontSize: 14, color: colors.ink3 },
  failTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  failSub: { fontSize: 13, color: colors.ink3, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
  head: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  headSub: { fontSize: 13, color: colors.ink3, marginTop: 6, marginBottom: 6 },
  card: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 16, marginTop: 12, ...colors.shadow.card },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardDesc: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 14 },
  statusSigned: { fontSize: 13, fontWeight: '700', color: colors.success },
  statusUnsigned: { fontSize: 13, fontWeight: '700', color: colors.warning },
  statusActive: { fontSize: 12, color: colors.primary, backgroundColor: colors.sidebarActive, paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full, overflow: 'hidden' },
  settingTip: { fontSize: 12, color: colors.ink2, marginTop: 8, lineHeight: 18 },
  signBtn: { marginTop: 16, minHeight: 46, paddingVertical: 12, borderRadius: colors.radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...colors.shadow.primary },
  signBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  notice: { backgroundColor: colors.successLight, borderRadius: colors.radius.md, padding: 14, marginTop: 16 },
  noticeText: { fontSize: 14, color: colors.success, fontWeight: '600' },
  footNote: { fontSize: 12, color: colors.ink3, marginTop: 24, lineHeight: 18, textAlign: 'center' },
});