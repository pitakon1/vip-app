/**
 * 分销体系：渠道商 / 转介绍 / 联合单分成
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '@/theme/colors';
import { brokerApi } from '@/services/api';

type Tab = 'broker' | 'referral' | 'split';

const B_STATUS: Record<string, string> = { pending: '待审', active: '启用', suspended: '暂停' };
const B_TYPE: Record<string, string> = { individual: '独立', agency: '中介', franchise: '加盟', affiliate: '联盟' };
const B_LEVEL: Record<string, string> = { silver: '白银', gold: '黄金', platinum: '铂金', franchisor: '加盟主' };
const R_STATUS: Record<string, string> = { referred: '已推荐', converted: '已转化', closed: '已成交' };
const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');
const pick = (d: any) => (Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : []);
interface PPart { role: string; rate: string; }

export default function DistributionScreen() {
  const [tab, setTab] = useState<Tab>('broker');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 渠道商
  const [brokers, setBrokers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [bName, setBName] = useState('');
  const [bType, setBType] = useState('individual');
  const [bContact, setBContact] = useState('');
  const [bCountry, setBCountry] = useState('TH');
  const [bRate, setBRate] = useState('');
  const [approveId, setApproveId] = useState<string | null>(null);
  const [aLevel, setALevel] = useState('silver');
  const [aRate, setARate] = useState('');

  // 转介绍
  const [referrals, setReferrals] = useState<any[]>([]);
  const [showRefForm, setShowRefForm] = useState(false);
  const [rCode, setRCode] = useState('');
  const [rName, setRName] = useState('');
  const [rPhone, setRPhone] = useState('');

  // 分成
  const [showSplitForm, setShowSplitForm] = useState(false);
  const [sDeal, setSDeal] = useState('');
  const [sTotal, setSTotal] = useState('');
  const [sCur, setSCur] = useState('THB');
  const [parts, setParts] = useState<PPart[]>([{ role: 'agent', rate: '50' }]);

  const load = useCallback(async (target: Tab) => {
    setLoading(true);
    try {
      if (target === 'broker') {
        const res: any = await brokerApi.list({ page_size: 100 });
        setBrokers(pick(res?.data));
      } else if (target === 'referral') {
        const res: any = await brokerApi.myReferrals();
        setReferrals(pick(res?.data ?? res?.data));
      } else if (target === 'split') {
        // 分成记录依赖各成交单，这里以奖励状态展示历史转介绍作为参考
        const res: any = await brokerApi.myReferrals();
        setReferrals(pick(res?.data));
      }
    } catch (e) {
      /* 加载失败不阻塞 */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { load('broker'); }, [load]),
  );

  const switchTab = (t: Tab) => { setTab(t); load(t); };
  const reload = async () => { setRefreshing(true); await load(tab); };

  const registerBroker = async () => {
    if (!bName) return;
    await brokerApi.create({
      partner_name: bName,
      broker_type: bType,
      contact_name: bContact || undefined,
      country: bCountry,
      base_rate: Number(bRate) || 0,
    });
    Alert.alert('已登记，等待审批');
    setBName(''); setBContact(''); setBRate(''); setShowForm(false);
    await load('broker');
  };

  const approveBroker = async (id: string) => {
    await brokerApi.approve(id, { level: aLevel, base_rate: Number(aRate) || 0 });
    Alert.alert('已通过审批');
    setApproveId(null); setARate('');
    await load('broker');
  };

  const suspendBroker = async (id: string) => {
    await brokerApi.suspend(id);
    await load('broker');
  };

  const recordReferral = async () => {
    if (!rCode) return;
    const params: any = { invite_code: rCode };
    if (rName) params.referred_name = rName;
    if (rPhone) params.referred_phone = rPhone;
    await brokerApi.createReferral(params);
    Alert.alert('已记录转介绍');
    setRCode(''); setRName(''); setRPhone(''); setShowRefForm(false);
    await load('referral');
  };

  const submitSplit = async () => {
    if (!sDeal || !sTotal) return;
    const participants = parts.map((p) => ({ role: p.role, rate: Math.max(0, Math.min(100, Number(p.rate) || 0)) }));
    await brokerApi.createSplitDeal({ deal_id: sDeal, commission_total: Number(sTotal), currency: sCur, participants });
    Alert.alert('已发起联合单分成');
    setSDeal(''); setSTotal(''); setParts([{ role: 'agent', rate: '50' }]); setShowSplitForm(false);
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'broker', label: '渠道商' },
    { key: 'referral', label: '转介绍' },
    { key: 'split', label: '分成' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tabChip, tab === t.key && styles.tabChipActive]} onPress={() => switchTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} colors={[colors.primary]} tintColor={colors.primary} />}
      >
        {loading && <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>}

        {/* —— 渠道商 —— */}
        {tab === 'broker' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(!showForm)}>
                <Text style={styles.addBtnText}>{showForm ? '收起登记' : '登记渠道商'}</Text>
              </TouchableOpacity>
            </View>

            {showForm && (
              <View style={styles.form}>
                <TextInput style={styles.input} placeholder="渠道商名称" placeholderTextColor={colors.ink3} value={bName} onChangeText={setBName} />
                <View style={styles.chipRow}>
                  {Object.keys(B_TYPE).map((t) => (
                    <TouchableOpacity key={t} style={[styles.chip, bType === t && styles.chipActive]} onPress={() => setBType(t)}>
                      <Text style={[styles.chipText, bType === t && styles.chipTextActive]}>{B_TYPE[t]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={styles.input} placeholder="联系人" placeholderTextColor={colors.ink3} value={bContact} onChangeText={setBContact} />
                <TextInput style={styles.input} placeholder="国家代码（如 TH）" placeholderTextColor={colors.ink3} value={bCountry} onChangeText={setBCountry} />
                <TextInput style={styles.input} placeholder="基础佣金率 %" placeholderTextColor={colors.ink3} keyboardType="numeric" value={bRate} onChangeText={setBRate} />
                <TouchableOpacity style={styles.submitBtn} onPress={registerBroker}>
                  <Text style={styles.submitBtnText}>登记</Text>
                </TouchableOpacity>
              </View>
            )}

            {brokers.length === 0 && !loading && <Text style={styles.empty}>暂无渠道商</Text>}
            {brokers.map((b) => (
              <View key={b.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{b.partner_name || '-'}</Text>
                  <View style={[styles.pill, b.status === 'suspended' ? styles.pillWarn : styles.pillOk]}>
                    <Text style={[styles.pillText, b.status === 'suspended' ? styles.pillWarnText : styles.pillOkText]}>{B_STATUS[b.status] || b.status}</Text>
                  </View>
                </View>
                <Text style={styles.sub}>{B_TYPE[b.broker_type] || b.broker_type} · {B_LEVEL[b.level] || b.level}</Text>
                <Text style={styles.sub}>邀请码：{b.invite_code || '-'}</Text>
                {b.contact_name ? <Text style={styles.sub}>联系人：{b.contact_name}</Text> : null}
                <Text style={styles.sub}>国家：{b.country || '-'} · 佣金率 {b.base_rate ?? 0}%</Text>

                <View style={styles.actions}>
                  {b.status === 'pending' && (
                    <TouchableOpacity style={styles.actBtn} onPress={() => { setApproveId(approveId === b.id ? null : b.id); setALevel('silver'); setARate(String(b.base_rate ?? 0)); }}>
                      <Text style={styles.actBtnText}>审批</Text>
                    </TouchableOpacity>
                  )}
                  {b.status === 'active' && (
                    <TouchableOpacity style={[styles.actBtn, styles.actBtnDanger]} onPress={() => suspendBroker(b.id)}>
                      <Text style={styles.actBtnText}>暂停</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {approveId === b.id && (
                  <View style={styles.approveBox}>
                    <Text style={styles.formLabel}>定级与佣金率</Text>
                    <View style={styles.chipRow}>
                      {Object.keys(B_LEVEL).map((lv) => (
                        <TouchableOpacity key={lv} style={[styles.chip, aLevel === lv && styles.chipActive]} onPress={() => setALevel(lv)}>
                          <Text style={[styles.chipText, aLevel === lv && styles.chipTextActive]}>{B_LEVEL[lv]}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput style={styles.input} placeholder="佣金率 %" placeholderTextColor={colors.ink3} keyboardType="numeric" value={aRate} onChangeText={setARate} />
                    <TouchableOpacity style={styles.submitBtn} onPress={() => approveBroker(b.id)}>
                      <Text style={styles.submitBtnText}>确认审批</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        {/* —— 转介绍 —— */}
        {tab === 'referral' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowRefForm(!showRefForm)}>
                <Text style={styles.addBtnText}>{showRefForm ? '收起记录' : '记录转介绍'}</Text>
              </TouchableOpacity>
            </View>

            {showRefForm && (
              <View style={styles.form}>
                <TextInput style={styles.input} placeholder="邀请码（如 SEAxxx）" placeholderTextColor={colors.ink3} value={rCode} onChangeText={setRCode} />
                <TextInput style={styles.input} placeholder="被推荐人姓名" placeholderTextColor={colors.ink3} value={rName} onChangeText={setRName} />
                <TextInput style={styles.input} placeholder="联系电话（可选）" placeholderTextColor={colors.ink3} value={rPhone} onChangeText={setRPhone} />
                <TouchableOpacity style={styles.submitBtn} onPress={recordReferral}>
                  <Text style={styles.submitBtnText}>记录</Text>
                </TouchableOpacity>
              </View>
            )}

            {referrals.length === 0 && !loading && <Text style={styles.empty}>暂无转介绍记录</Text>}
            {referrals.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{r.referred_name || '未署名'}</Text>
                  <View style={[styles.pill, styles.pillOk]}>
                    <Text style={[styles.pillText, styles.pillOkText]}>{R_STATUS[r.status] || r.status}</Text>
                  </View>
                </View>
                <Text style={styles.sub}>邀请码：{r.invite_code || '-'}</Text>
                {r.referred_phone ? <Text style={styles.sub}>电话：{r.referred_phone}</Text> : null}
                <Text style={styles.sub}>
                  奖励：{r.reward_status || 'pending'}
                  {r.created_at ? ` · ${String(r.created_at).replace('T', ' ').slice(0, 19)}` : ''}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* —— 分成 —— */}
        {tab === 'split' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowSplitForm(!showSplitForm)}>
                <Text style={styles.addBtnText}>{showSplitForm ? '收起发起' : '发起联合单分成'}</Text>
              </TouchableOpacity>
            </View>

            {showSplitForm && (
              <View style={styles.form}>
                <TextInput style={styles.input} placeholder="成交单 ID" placeholderTextColor={colors.ink3} value={sDeal} onChangeText={setSDeal} />
                <TextInput style={styles.input} placeholder="佣金总额" placeholderTextColor={colors.ink3} keyboardType="numeric" value={sTotal} onChangeText={setSTotal} />
                <TextInput style={styles.input} placeholder="币种（THB/USD/CNY）" placeholderTextColor={colors.ink3} value={sCur} onChangeText={setSCur} />

                <Text style={styles.formLabel}>分成参与方（比例合计 100%）</Text>
                {parts.map((p, i) => (
                  <View key={i} style={styles.partRow}>
                    <View style={styles.chipRow}>
                      {['agent', 'broker'].map((rl) => (
                        <TouchableOpacity key={rl} style={[styles.smallChip, p.role === rl && styles.smallChipActive]} onPress={() => { const np = [...parts]; np[i] = { ...np[i], role: rl }; setParts(np); }}>
                          <Text style={[styles.smallChipText, p.role === rl && styles.smallChipTextActive]}>{rl === 'agent' ? '经纪人' : '渠道商'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.partInputRow}>
                      <TextInput style={[styles.input, styles.rateInput]} placeholder="%" placeholderTextColor={colors.ink3} keyboardType="numeric" value={p.rate} onChangeText={(v) => { const np = [...parts]; np[i] = { ...np[i], rate: v }; setParts(np); }} />
                      <TouchableOpacity style={styles.removeBtn} onPress={() => setParts(parts.filter((_, j) => j !== i))}>
                        <Text style={styles.removeBtnText}>删除</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setParts([...parts, { role: 'agent', rate: '0' }])}>
                  <Text style={styles.ghostBtnText}>+ 添加参与方</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.submitBtn} onPress={submitSplit}>
                  <Text style={styles.submitBtnText}>发起分成</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.hint}>分成记录（关联成交单）请到「成交/托管」查看金额流向；此处可发起多人佣金拆分。</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexWrap: 'wrap' },
  tabChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: colors.radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, color: colors.ink3 },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: 16 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-start', marginVertical: 8 },
  addBtn: { backgroundColor: colors.primary, borderRadius: colors.radius.full, paddingVertical: 8, paddingHorizontal: 16 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  form: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
  formLabel: { fontSize: 13, color: colors.ink2, marginBottom: 6 },
  input: { height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: colors.ink, marginBottom: 12 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: colors.radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.ink3 },
  chipTextActive: { color: '#fff' },
  submitBtn: { backgroundColor: colors.primary, borderRadius: colors.radius.full, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  approveBox: { backgroundColor: colors.surface2, borderRadius: 10, padding: 12, marginTop: 10 },
  empty: { textAlign: 'center', color: colors.ink3, paddingVertical: 40 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink, marginRight: 8 },
  sub: { fontSize: 12, color: colors.ink2, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: colors.radius.full },
  pillOk: { backgroundColor: colors.successLight },
  pillWarn: { backgroundColor: colors.warningLight },
  pillOkText: { color: colors.success },
  pillWarnText: { color: colors.warning },
  pillText: { fontSize: 11 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actBtn: { backgroundColor: colors.primary, borderRadius: colors.radius.full, paddingVertical: 7, paddingHorizontal: 14 },
  actBtnDanger: { backgroundColor: colors.error },
  actBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  partRow: { marginBottom: 12 },
  smallChip: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: colors.radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  smallChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  smallChipText: { fontSize: 12, color: colors.ink3 },
  smallChipTextActive: { color: '#fff' },
  partInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rateInput: { flex: 1, marginBottom: 0 },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  removeBtnText: { fontSize: 13, color: colors.error },
  ghostBtn: { paddingVertical: 8, alignItems: 'center', marginBottom: 12 },
  ghostBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.ink3, paddingVertical: 8, textAlign: 'center' },
});