/**
 * 多国市场：市场列表 / 支付渠道 / 合规文档
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
import { marketApi } from '@/services/api';

type Tab = 'market' | 'channel' | 'compliance';

const MK_STATUS: Record<string, string> = { launching: '筹备', active: '运营', paused: '暂停' };
const DOCTYPE: Record<string, string> = {
  contract_template: '合同模板',
  privacy_policy: '隐私政策',
  license: '牌照',
  onboarding: '入驻须知',
};
const pick = (d: any) => (Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : []);

export default function MarketsScreen() {
  const [tab, setTab] = useState<Tab>('market');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 市场
  const [markets, setMarkets] = useState<any[]>([]);
  const [showMkForm, setShowMkForm] = useState(false);
  const [mCode, setMCode] = useState('');
  const [mCountry, setMCountry] = useState('');
  const [mCur, setMCur] = useState('THB');
  const [mPub, setMPub] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState('');

  // 渠道
  const [channels, setChannels] = useState<any[]>([]);
  const [showChForm, setShowChForm] = useState(false);
  const [chCode, setChCode] = useState('');
  const [chName, setChName] = useState('');
  const [chType, setChType] = useState('wallet');
  const [chMarket, setChMarket] = useState('');

  // 合规
  const [compliance, setCompliance] = useState<any[]>([]);
  const [showCompForm, setShowCompForm] = useState(false);
  const [cMarket, setCMarket] = useState('');
  const [cType, setCType] = useState('contract_template');
  const [cTitle, setCTitle] = useState('');
  const [cLang, setCLang] = useState('en');
  const [cVersion, setCVersion] = useState('1.0');

  const CHANNEL_TYPES = ['wallet', 'bank', 'card', 'cash'];

  const load = useCallback(async (target: Tab) => {
    setLoading(true);
    try {
      if (target === 'market') {
        const res: any = await marketApi.list({ page_size: 100 });
        const rows = pick(res?.data);
        setMarkets(rows);
        if (!selectedMarket && rows.length) setSelectedMarket(rows[0].market_code);
      } else if (target === 'channel') {
        const res: any = await marketApi.channels(selectedMarket || undefined);
        setChannels(Array.isArray(res?.data) ? res.data : []);
      } else if (target === 'compliance') {
        const res: any = await marketApi.compliance(selectedMarket || undefined);
        setCompliance(Array.isArray(res?.data) ? res.data : []);
      }
    } catch (e) {
      /* 加载失败不阻塞 */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMarket]);

  useFocusEffect(
    useCallback(() => { load('market'); }, [load]),
  );

  const switchTab = (t: Tab) => { if (t !== 'market') load(t); setTab(t); };
  const reload = async () => { setRefreshing(true); await load(tab); };

  const addMarket = async () => {
    if (!mCode || !mCountry) return;
    await marketApi.create({
      market_code: mCode,
      country_name: mCountry,
      currency: mCur,
      published: mPub,
    });
    Alert.alert('已新增市场');
    setMCode(''); setMCountry(''); setMPub(false); setShowMkForm(false);
    await load('market');
  };

  const addChannel = async () => {
    if (!chMarket && !selectedMarket) return;
    if (!chCode || !chName) return;
    const mk = chMarket || selectedMarket;
    const marketsRes: any = await marketApi.list({ page_size: 100 });
    const rows = pick(marketsRes?.data);
    const target = rows.find((m: any) => m.market_code === mk);
    await marketApi.createChannel({
      market_code: mk,
      channel_code: chCode,
      channel_name: chName,
      channel_type: chType,
      supported_currency: target?.currency || mCur,
    });
    Alert.alert('已新增支付渠道');
    setChCode(''); setChName(''); setShowChForm(false);
    await load('channel');
  };

  const addCompliance = async () => {
    const mk = cMarket || selectedMarket;
    if (!mk || !cTitle) return;
    await marketApi.createCompliance({
      market_code: mk,
      doc_type: cType,
      title: cTitle,
      language: cLang,
      version: cVersion,
    });
    Alert.alert('已上传合规文档');
    setCTitle(''); setShowCompForm(false);
    await load('compliance');
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'market', label: '市场' },
    { key: 'channel', label: '支付渠道' },
    { key: 'compliance', label: '合规文档' },
  ];

  const renderMarketSelector = () => (
    <View style={styles.selectRow}>
      <Text style={styles.formLabel}>选择市场</Text>
      <View style={styles.chipRow}>
        {markets.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.chip, selectedMarket === m.market_code && styles.chipActive]}
            onPress={() => setSelectedMarket(m.market_code)}
          >
            <Text style={[styles.chipText, selectedMarket === m.market_code && styles.chipTextActive]}>{m.market_code}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {markets.length === 0 && <Text style={styles.hint}>请先在「市场」新增国家市场</Text>}
    </View>
  );

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

        {/* —— 市场 —— */}
        {tab === 'market' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowMkForm(!showMkForm)}>
                <Text style={styles.addBtnText}>{showMkForm ? '收起新增' : '新增市场'}</Text>
              </TouchableOpacity>
            </View>

            {showMkForm && (
              <View style={styles.form}>
                <TextInput style={styles.input} placeholder="市场代码（如 TH/MY/VN）" placeholderTextColor={colors.ink3} value={mCode} onChangeText={setMCode} autoCapitalize="characters" />
                <TextInput style={styles.input} placeholder="国家名称" placeholderTextColor={colors.ink3} value={mCountry} onChangeText={setMCountry} />
                <TextInput style={styles.input} placeholder="币种（THB/USD）" placeholderTextColor={colors.ink3} value={mCur} onChangeText={setMCur} />
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setMPub(!mPub)}>
                  <Text style={[styles.ghostBtnText, mPub && { color: colors.primary }]}>{mPub ? '已发布（前台可见）' : '未发布（内部筹备）'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} onPress={addMarket}>
                  <Text style={styles.submitBtnText}>新增</Text>
                </TouchableOpacity>
              </View>
            )}

            {markets.length === 0 && !loading && <Text style={styles.empty}>暂无市场</Text>}
            {markets.map((m) => (
              <View key={m.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{m.country_name || '-'} ({m.market_code})</Text>
                  <View style={[styles.pill, m.published ? styles.pillOk : styles.pillWarn]}>
                    <Text style={styles.pillText}>{m.published ? '已发布' : '筹备中'}</Text>
                  </View>
                </View>
                <Text style={styles.sub}>状态：{MK_STATUS[m.status] || m.status}</Text>
                <Text style={styles.sub}>币种：{m.currency} · 语言 {m.default_language}</Text>
                <Text style={styles.sub}>时区：{m.timezone || '-'}</Text>
                <Text style={styles.sub}>
                  VAT {m.vat_rate ?? 0}% · 过户费 {(m.transfer_fee_rate ?? 0) * 100}%
                  {m.license_required ? ' · 需牌照' : ''}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* —— 支付渠道 —— */}
        {tab === 'channel' && (
          <>
            {renderMarketSelector()}
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowChForm(!showChForm)}>
                <Text style={styles.addBtnText}>{showChForm ? '收起新增' : '新增支付渠道'}</Text>
              </TouchableOpacity>
            </View>

            {showChForm && (
              <View style={styles.form}>
                <TextInput style={styles.input} placeholder="渠道代码（如 promptpay）" placeholderTextColor={colors.ink3} value={chCode} onChangeText={setChCode} />
                <TextInput style={styles.input} placeholder="渠道名称" placeholderTextColor={colors.ink3} value={chName} onChangeText={setChName} />
                <View style={styles.chipRow}>
                  {CHANNEL_TYPES.map((t) => (
                    <TouchableOpacity key={t} style={[styles.chip, chType === t && styles.chipActive]} onPress={() => setChType(t)}>
                      <Text style={[styles.chipText, chType === t && styles.chipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.submitBtn} onPress={addChannel}>
                  <Text style={styles.submitBtnText}>新增</Text>
                </TouchableOpacity>
              </View>
            )}

            {channels.length === 0 && !loading && <Text style={styles.empty}>该市场暂无支付渠道</Text>}
            {channels.map((c) => (
              <View key={c.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{c.channel_name || c.channel_code}</Text>
                  <View style={[styles.pill, c.status === 'active' ? styles.pillOk : styles.pillWarn]}>
                    <Text style={styles.pillText}>{c.status === 'active' ? '启用' : c.status}</Text>
                  </View>
                </View>
                <Text style={styles.sub}>代码：{c.channel_code} · 类型：{c.channel_type}</Text>
                <Text style={styles.sub}>支持币种：{c.supported_currency || '-'} · 市场 {c.market_code}</Text>
              </View>
            ))}
          </>
        )}

        {/* —— 合规 —— */}
        {tab === 'compliance' && (
          <>
            {renderMarketSelector()}
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowCompForm(!showCompForm)}>
                <Text style={styles.addBtnText}>{showCompForm ? '收起上传' : '上传合规文档'}</Text>
              </TouchableOpacity>
            </View>

            {showCompForm && (
              <View style={styles.form}>
                <View style={styles.chipRow}>
                  {Object.keys(DOCTYPE).map((t) => (
                    <TouchableOpacity key={t} style={[styles.chip, cType === t && styles.chipActive]} onPress={() => setCType(t)}>
                      <Text style={[styles.chipText, cType === t && styles.chipTextActive]}>{DOCTYPE[t]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={styles.input} placeholder="文档标题" placeholderTextColor={colors.ink3} value={cTitle} onChangeText={setCTitle} />
                <TextInput style={styles.input} placeholder="语言（en/th/zh）" placeholderTextColor={colors.ink3} value={cLang} onChangeText={setCLang} />
                <TextInput style={styles.input} placeholder="版本（如 1.0）" placeholderTextColor={colors.ink3} value={cVersion} onChangeText={setCVersion} />
                <TouchableOpacity style={styles.submitBtn} onPress={addCompliance}>
                  <Text style={styles.submitBtnText}>上传</Text>
                </TouchableOpacity>
              </View>
            )}

            {compliance.length === 0 && !loading && <Text style={styles.empty}>该市场暂无合规文档</Text>}
            {compliance.map((d) => (
              <View key={d.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{d.title || '-'}</Text>
                  <Text style={styles.cardTag}>{DOCTYPE[d.doc_type] || d.doc_type}</Text>
                </View>
                <Text style={styles.sub}>市场：{d.market_code} · 语言 {d.language} · v{d.version}</Text>
                {d.effective_date ? <Text style={styles.sub}>生效：{String(d.effective_date).slice(0, 10)}</Text> : null}
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
  formLabel: { fontSize: 13, color: colors.ink2, marginBottom: 6 },
  input: { height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: colors.ink, marginBottom: 12 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.ink3 },
  chipTextActive: { color: '#fff' },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  ghostBtn: { paddingVertical: 8, marginBottom: 12 },
  ghostBtnText: { fontSize: 13, color: colors.ink3 },
  selectRow: { marginTop: 8 },
  empty: { textAlign: 'center', color: colors.ink3, paddingVertical: 40 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink, marginRight: 8 },
  cardTag: { fontSize: 11, color: colors.ink3 },
  sub: { fontSize: 12, color: colors.ink2, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  pillOk: { backgroundColor: colors.successLight },
  pillWarn: { backgroundColor: colors.warningLight },
  pillText: { fontSize: 11 },
  hint: { fontSize: 12, color: colors.ink3, paddingVertical: 6 },
});