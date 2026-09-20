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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import { brokerApi, contractsApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';

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
  const [broker, setBroker] = useState<BrokerMe | null>(null);
  const [agreements, setAgreements] = useState<{
    distributor: AgreementState;
    listing_agent: AgreementState;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRole, setBusyRole] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const meRes: any = await brokerApi.me();
      const me = meRes?.data ?? {};
      setBroker(me);
      if (me?.id) {
        const agRes: any = await brokerApi.agreements(me.id);
        setAgreements(agRes?.data ?? null);
      }
    } catch (e: any) {
      notifyError('加载失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const generateAndSign = async (role: 'listing_agent' | 'distributor') => {
    if (!broker?.id) return;
    setBusyRole(role);
    try {
      // 已存在有效协议 → 后端直接返回既有
      const gen: any = await brokerApi.createAgreement(broker.id, role);
      const cid = gen?.data?.contract_id;
      if (!cid) {
        notify('请重试', '未能生成协议');
        return;
      }
      const detail: any = await contractsApi.get(cid);
      const d = detail?.data;
      const parties = Array.isArray(d?.parties) ? (d.parties as any[]) : [];
      // 经纪人自己作为签署方（role=agent / witness 为平台甲方），取当前用户对应方
      const self = parties.find((p) => p?.role === 'agent');
      const partyId = self?.id ?? parties[parties.length - 1]?.id;
      if (!partyId) {
        notify('请重试', '未找到您的签署位');
        return;
      }
      await contractsApi.sign(cid, String(partyId));
      notify('签署成功', '协议已在线签署，相关权限已激活');
      await load();
    } catch (e: any) {
      notifyError('签署失败', e);
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
            <Text style={styles.statusSigned}>已在线签署 · 权限已激活</Text>
          ) : (
            <Text style={styles.statusUnsigned}>未签署</Text>
          )}
          {active ? <Text style={styles.statusActive}>使用中</Text> : null}
        </View>
        <Text style={styles.settingTip}>
          {role === 'listing_agent'
            ? '签署后即可作为「房源上架经纪人」在发布房源入口上架房源'
            : '签署后即可参与平台分销、赚取转介绍与联合单分成'}
        </Text>
        {!signed ? (
          <TouchableOpacity
            style={styles.signBtn}
            activeOpacity={0.8}
            disabled={busyRole === role}
            onPress={() => generateAndSign(role)}
            accessibilityRole="button"
            accessibilityLabel={`签署${title}`}
          >
            {busyRole === role ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.signBtnText}>生成并在线签署</Text>
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

  if (!broker?.id) {
    return (
      <View style={styles.center}>
        <Text style={styles.noneText}>暂无经纪人身份，无法在线签约</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.head}>经纪人合作协议</Text>
      <Text style={styles.headSub}>在线生成并签署平台协议，签署完成后自动激活对应权限</Text>

      {card(
        'listing_agent',
        '《房源经纪人上架房源协议》',
        '签署后解锁「发布房源」的上架资格',
        agreements?.listing_agent,
        broker.listing_active,
      )}
      {card(
        'distributor',
        '《平台经纪人分销协议》',
        '签署后解锁分销与转介绍资格',
        agreements?.distributor,
        broker.distributor_active,
      )}

      {(broker.listing_active || broker.distributor_active) ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            您现在可以上架房源{broker.listing_active ? '' : ''}
            {broker.distributor_active ? ' / 参与分销' : ''}
          </Text>
        </View>
      ) : null}

      <Text style={styles.footNote}>
        协议由平台提供电子文档，全程数字签名加密，维护您的权益。如需纸质版，可联系平台客服。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  noneText: { fontSize: 14, color: colors.ink3 },
  head: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  headSub: { fontSize: 13, color: colors.ink3, marginTop: 6, marginBottom: 6 },
  card: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 16, marginTop: 12, ...colors.shadow.card },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardDesc: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  statusSigned: { fontSize: 13, fontWeight: '700', color: colors.success },
  statusUnsigned: { fontSize: 13, fontWeight: '700', color: colors.warning },
  statusActive: { fontSize: 12, color: colors.primary, backgroundColor: colors.sidebarActive, paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full, overflow: 'hidden' },
  settingTip: { fontSize: 12, color: colors.ink2, marginTop: 8, lineHeight: 18 },
  signBtn: { marginTop: 16, height: 46, borderRadius: colors.radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...colors.shadow.primary },
  signBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  notice: { backgroundColor: colors.successLight, borderRadius: colors.radius.md, padding: 14, marginTop: 16 },
  noticeText: { fontSize: 14, color: colors.success, fontWeight: '600' },
  footNote: { fontSize: 12, color: colors.ink3, marginTop: 24, lineHeight: 18, textAlign: 'center' },
});