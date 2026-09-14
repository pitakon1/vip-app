/**
 * 数据决策：市场指数 / 研究报告 / 流失预警
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
import { marketDataApi } from '@/services/api';

type Tab = 'index' | 'report' | 'churn';

const RTYPE: Record<string, string> = { district: '区域', city: '城市', country: '国家' };
const SIGNAL_TYPE: Record<string, string> = {
  lease_expiring: '租约到期',
  late_payment: '逾期付款',
  low_engagement: '低活跃',
};
const LEVEL: Record<string, string> = { info: '提示', warning: '警告', critical: '严重' };
const fmtMoney = (v?: number, c?: string) => `${c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿'}${Number(v ?? 0).toLocaleString()}`;
const pick = (d: any) => (Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : []);

export default function MarketIntelScreen() {
  const [tab, setTab] = useState<Tab>('index');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 指数
  const [indices, setIndices] = useState<any[]>([]);
  const [showIdxForm, setShowIdxForm] = useState(false);
  const [iMarket, setIMarket] = useState('');
  const [iType, setIType] = useState('sale');
  const [iPeriod, setIPeriod] = useState('');
  const [iValue, setIValue] = useState('');
  const [iDelta, setIDelta] = useState('');

  // 报告
  const [reports, setReports] = useState<any[]>([]);
  const [showRepForm, setShowRepForm] = useState(false);
  const [rMarket, setRMarket] = useState('');
  const [rType, setRType] = useState('district');
  const [rArea, setRArea] = useState('');
  const [rPeriod, setRPeriod] = useState('');
  const [rSummary, setRSummary] = useState('');

  // 流失预警
  const [signals, setSignals] = useState<any[]>([]);
  const [showSigForm, setShowSigForm] = useState(false);
  const [sType, setSType] = useState('lease_expiring');
  const [sLevel, setSLevel] = useState('info');
  const [sDetail, setSDetail] = useState('');

  const load = useCallback(async (target: Tab) => {
    setLoading(true);
    try {
      if (target === 'index') {
        const res: any = await marketDataApi.indices({});
        setIndices(Array.isArray(res?.data) ? res.data : []);
      } else if (target === 'report') {
        const res: any = await marketDataApi.reports({ page_size: 100 });
        setReports(pick(res?.data));
      } else if (target === 'churn') {
        const res: any = await marketDataApi.churnSignals({ page_size: 100 });
        setSignals(pick(res?.data));
      }
    } catch (e) {
      /* 加载失败不阻塞 */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { load('index'); }, [load]),
  );

  const switchTab = (t: Tab) => { setTab(t); load(t); };
  const reload = async () => { setRefreshing(true); await load(tab); };

  const addIndex = async () => {
    if (!iValue || !iPeriod) return;
    await marketDataApi.createIndex({
      market_code: iMarket || 'TH',
      index_type: iType,
      period: iPeriod,
      value: Number(iValue),
      delta_pct: iDelta ? Number(iDelta) : undefined,
    });
    Alert.alert('已新增市场指数');
    setIPeriod(''); setIValue(''); setIDelta('');
    setShowIdxForm(false);
    await load('index');
  };

  const addReport = async () => {
    if (!rPeriod) return;
    await marketDataApi.createReport({
      market_code: rMarket || 'TH',
      report_type: rType,
      area: rArea || undefined,
      period: rPeriod,
      summary: rSummary || undefined,
    });
    Alert.alert('已生成研究报告');
    setRPeriod(''); setRArea(''); setRSummary('');
    setShowRepForm(false);
    await load('report');
  };

  const addSignal = async () => {
    if (!sDetail) return;
    await marketDataApi.createChurnSignal({
      signal_type: sType,
      level: sLevel,
      detail: sDetail,
      suggested_action: LEVEL[sLevel] === '严重' ? '优先跟进' : '安排回访',
    });
    Alert.alert('已上报流失预警');
    setSDetail('');
    setShowSigForm(false);
    await load('churn');
  };

  const resolve = async (id: string) => {
    await marketDataApi.resolveChurnSignal(id);
    await load('churn');
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'index', label: '市场指数' },
    { key: 'report', label: '研究报告' },
    { key: 'churn', label: '流失预警' },
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

        {/* —— 指数 —— */}
        {tab === 'index' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowIdxForm(!showIdxForm)}>
                <Text style={styles.addBtnText}>{showIdxForm ? '收起新增' : '新增指数'}</Text>
              </TouchableOpacity>
            </View>

            {showIdxForm && (
              <View style={styles.form}>
                <TextInput style={styles.input} placeholder="市场代码（默认 TH）" placeholderTextColor={colors.ink3} value={iMarket} onChangeText={setIMarket} />
                <View style={styles.chipRow}>
                  {['sale', 'rent'].map((t) => (
                    <TouchableOpacity key={t} style={[styles.chip, iType === t && styles.chipActive]} onPress={() => setIType(t)}>
                      <Text style={[styles.chipText, iType === t && styles.chipTextActive]}>{t === 'sale' ? '售价' : '租金'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={styles.input} placeholder="统计周期（如 2026-Q2）" placeholderTextColor={colors.ink3} value={iPeriod} onChangeText={setIPeriod} />
                <TextInput style={styles.input} placeholder="指数值" placeholderTextColor={colors.ink3} keyboardType="numeric" value={iValue} onChangeText={setIValue} />
                <TextInput style={styles.input} placeholder="环比涨跌 %（可选）" placeholderTextColor={colors.ink3} keyboardType="numeric" value={iDelta} onChangeText={setIDelta} />
                <TouchableOpacity style={styles.submitBtn} onPress={addIndex}>
                  <Text style={styles.submitBtnText}>新增</Text>
                </TouchableOpacity>
              </View>
            )}

            {indices.length === 0 && !loading && <Text style={styles.empty}>暂无市场指数</Text>}
            {indices.map((idx) => (
              <View key={idx.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{idx.market_code} · {idx.index_type === 'sale' ? '售价指数' : '租金指数'}</Text>
                  <View style={[styles.pill, Number(idx.delta_pct) >= 0 ? styles.pillOk : styles.pillWarn]}>
                    <Text style={styles.pillText}>{(idx.delta_pct ?? 0) >= 0 ? '+' : ''}{idx.delta_pct ?? 0}%</Text>
                  </View>
                </View>
                <Text style={styles.bigNum}>{fmtMoney(idx.value, idx.currency)}</Text>
                <Text style={styles.sub}>周期 {idx.period} · 样本 {idx.sample_count ?? 0}</Text>
                {idx.avg_price_sqm != null && <Text style={styles.sub}>均价/㎡：{fmtMoney(idx.avg_price_sqm, idx.currency)}</Text>}
                {idx.avg_rent != null && <Text style={styles.sub}>平均租金：{fmtMoney(idx.avg_rent, idx.currency)}</Text>}
              </View>
            ))}
          </>
        )}

        {/* —— 报告 —— */}
        {tab === 'report' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowRepForm(!showRepForm)}>
                <Text style={styles.addBtnText}>{showRepForm ? '收起生成' : '生成报告'}</Text>
              </TouchableOpacity>
            </View>

            {showRepForm && (
              <View style={styles.form}>
                <TextInput style={styles.input} placeholder="市场代码（默认 TH）" placeholderTextColor={colors.ink3} value={rMarket} onChangeText={setRMarket} />
                <View style={styles.chipRow}>
                  {Object.keys(RTYPE).map((t) => (
                    <TouchableOpacity key={t} style={[styles.chip, rType === t && styles.chipActive]} onPress={() => setRType(t)}>
                      <Text style={[styles.chipText, rType === t && styles.chipTextActive]}>{RTYPE[t]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={styles.input} placeholder="区域名（如 Bangkok）" placeholderTextColor={colors.ink3} value={rArea} onChangeText={setRArea} />
                <TextInput style={styles.input} placeholder="统计周期（如 2026-Q2）" placeholderTextColor={colors.ink3} value={rPeriod} onChangeText={setRPeriod} />
                <TextInput style={[styles.input, styles.multiline]} placeholder="摘要" placeholderTextColor={colors.ink3} multiline value={rSummary} onChangeText={setRSummary} />
                <TouchableOpacity style={styles.submitBtn} onPress={addReport}>
                  <Text style={styles.submitBtnText}>生成</Text>
                </TouchableOpacity>
              </View>
            )}

            {reports.length === 0 && !loading && <Text style={styles.empty}>暂无研究报告</Text>}
            {reports.map((rp) => (
              <View key={rp.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{rp.market_code} · {RTYPE[rp.report_type] || rp.report_type}</Text>
                  <Text style={styles.cardTag}>{rp.period}</Text>
                </View>
                {rp.area ? <Text style={styles.sub}>区域：{rp.area}</Text> : null}
                {rp.property_type ? <Text style={styles.sub}>物业类型：{rp.property_type}</Text> : null}
                {rp.summary ? <Text style={styles.summary} numberOfLines={3}>{rp.summary}</Text> : null}
                {rp.published_at ? <Text style={styles.sub}>发布：{String(rp.published_at).replace('T', ' ').slice(0, 19)}</Text> : null}
              </View>
            ))}
          </>
        )}

        {/* —— 流失预警 —— */}
        {tab === 'churn' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowSigForm(!showSigForm)}>
                <Text style={styles.addBtnText}>{showSigForm ? '收起上报' : '上报预警'}</Text>
              </TouchableOpacity>
            </View>

            {showSigForm && (
              <View style={styles.form}>
                <View style={styles.chipRow}>
                  {Object.keys(SIGNAL_TYPE).map((t) => (
                    <TouchableOpacity key={t} style={[styles.chip, sType === t && styles.chipActive]} onPress={() => setSType(t)}>
                      <Text style={[styles.chipText, sType === t && styles.chipTextActive]}>{SIGNAL_TYPE[t]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.chipRow}>
                  {Object.keys(LEVEL).map((l) => (
                    <TouchableOpacity key={l} style={[styles.chip, sLevel === l && styles.chipActive]} onPress={() => setSLevel(l)}>
                      <Text style={[styles.chipText, sLevel === l && styles.chipTextActive]}>{LEVEL[l]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={[styles.input, styles.multiline]} placeholder="信号详情" placeholderTextColor={colors.ink3} multiline value={sDetail} onChangeText={setSDetail} />
                <TouchableOpacity style={styles.submitBtn} onPress={addSignal}>
                  <Text style={styles.submitBtnText}>上报</Text>
                </TouchableOpacity>
              </View>
            )}

            {signals.length === 0 && !loading && <Text style={styles.empty}>暂无流失预警</Text>}
            {signals.map((s) => (
              <View key={s.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{SIGNAL_TYPE[s.signal_type] || s.signal_type}</Text>
                  <View style={[styles.pill, s.level === 'critical' ? styles.pillDanger : s.level === 'warning' ? styles.pillWarn : styles.pillOk]}>
                    <Text style={styles.pillText}>{LEVEL[s.level] || s.level}</Text>
                  </View>
                </View>
                {s.detail ? <Text style={styles.summary} numberOfLines={2}>详情：{s.detail}</Text> : null}
                {s.suggested_action ? <Text style={styles.sub}>建议：{s.suggested_action}</Text> : null}
                <Text style={styles.sub}>
                  {s.triggered_at ? `触发 ${String(s.triggered_at).replace('T', ' ').slice(0, 19)}` : ''}
                  {s.is_resolved ? ' · 已处理' : ''}
                </Text>
                {!s.is_resolved && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.actBtn} onPress={() => resolve(s.id)}>
                      <Text style={styles.actBtnText}>标记处理</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexWrap: 'wrap' },
  tabChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, color: colors.ink3 },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: 16 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-start', marginVertical: 8 },
  addBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  form: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
  input: { height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: colors.ink, marginBottom: 12 },
  multiline: { height: 72, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.ink3 },
  chipTextActive: { color: '#fff' },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.ink3, paddingVertical: 40 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink, marginRight: 8 },
  cardTag: { fontSize: 11, color: colors.ink3 },
  bigNum: { fontSize: 20, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  sub: { fontSize: 12, color: colors.ink2, marginTop: 2 },
  summary: { fontSize: 13, color: colors.ink2, marginTop: 4, lineHeight: 18 },
  pill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  pillOk: { backgroundColor: colors.successLight },
  pillWarn: { backgroundColor: colors.warningLight },
  pillDanger: { backgroundColor: colors.errorLight },
  pillText: { fontSize: 11 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  actBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});