/**
 * 买卖交易闭环：挂牌 / 成交 / 托管 / 按揭
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
import { saleListingApi, propertyDealApi } from '@/services/api';

type Tab = 'listing' | 'deal' | 'escrow' | 'mortgage';

const L_STATUS: Record<string, string> = {
  active: '在售',
  pending: '待审',
  contracted: '已签约',
  sold: '已售',
  cancelled: '已取消',
  archived: '归档',
};
const D_STATUS: Record<string, string> = {
  drafted: '草案',
  signed: '已签约',
  escrow: '托管中',
  transferred: '已过户',
  completed: '已完成',
  cancelled: '已取消',
};
const E_STATUS: Record<string, string> = {
  deposited: '已托管',
  released_seller: '已放款',
  refunded_buyer: '已退款',
};
const M_STATUS: Record<string, string> = {
  applied: '待审批',
  approved: '已批准',
  rejected: '已拒绝',
};
const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');
const fmtMoney = (v?: number, c?: string) => `${cur(c)}${Number(v ?? 0).toLocaleString()}`;
const pick = (d: any) => (Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : []);

export default function SaleDealsScreen() {
  const [tab, setTab] = useState<Tab>('listing');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 挂牌
  const [listings, setListings] = useState<any[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [showListingForm, setShowListingForm] = useState(false);
  const [lTitle, setLTitle] = useState('');
  const [lType, setLType] = useState('sell');
  const [lPrice, setLPrice] = useState('');
  const [lCur, setLCur] = useState('THB');
  const [lAddress, setLAddress] = useState('');
  const [lSize, setLSize] = useState('');

  // 成交
  const [deals, setDeals] = useState<any[]>([]);
  const [showDealForm, setShowDealForm] = useState(false);
  const [dListing, setDListing] = useState('');
  const [dPrice, setDPrice] = useState('');
  const [dCur, setDCur] = useState('THB');

  // 托管
  const [escrows, setEscrows] = useState<any[]>([]);
  const [showEscForm, setShowEscForm] = useState(false);
  const [eDeal, setEDeal] = useState('');
  const [eAmount, setEAmount] = useState('');
  const [eCur, setECur] = useState('THB');

  // 按揭
  const [mortgages, setMortgages] = useState<any[]>([]);
  const [showMortForm, setShowMortForm] = useState(false);
  const [mBank, setMBank] = useState('');
  const [mAmount, setMAmount] = useState('');
  const [mCur, setMCur] = useState('THB');
  const [mTerm, setMTerm] = useState('360');
  const [mDeal, setMDeal] = useState('');

  const load = useCallback(async (target: Tab) => {
    setLoading(true);
    try {
      if (target === 'listing') {
        const params: any = { page_size: 100 };
        if (filterType !== 'all') params.sale_type = filterType;
        const res: any = await saleListingApi.list(params);
        setListings(pick(res?.data));
      } else if (target === 'deal') {
        const res: any = await propertyDealApi.list({ page_size: 100 });
        setDeals(pick(res?.data));
      } else if (target === 'escrow') {
        const res: any = await propertyDealApi.list({ page_size: 100 });
        const dealRows = pick(res?.data);
        const rows = await Promise.all(
          dealRows.map((dd: any) =>
            propertyDealApi.escrows(dd.id).then((r2: any) =>
              (Array.isArray(r2?.data) ? r2.data : []).map((ee: any) => ({ ...ee, dealId: dd.id }))
            ).catch(() => []),
          ),
        );
        setEscrows(rows.flat().reverse());
      } else if (target === 'mortgage') {
        const res: any = await propertyDealApi.myMortgages({});
        setMortgages(Array.isArray(res?.data) ? res.data : []);
      }
    } catch (e) {
      /* 加载失败不阻塞 */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterType]);

  useFocusEffect(
    useCallback(() => {
      load('listing');
    }, [load]),
  );

  const switchTab = (t: Tab) => {
    setTab(t);
    load(t);
  };

  const reload = async () => {
    setRefreshing(true);
    await load(tab);
  };

  const publishListing = async () => {
    if (!lTitle || !lPrice) return;
    await saleListingApi.create({
      sale_type: lType,
      title: lTitle,
      asking_price: Number(lPrice),
      currency: lCur,
      address: lAddress || undefined,
      size_sqm: lSize ? Number(lSize) : undefined,
    });
    Alert.alert('已发布挂牌');
    setLTitle(''); setLPrice(''); setLAddress(''); setLSize('');
    setShowListingForm(false);
    await load('listing');
  };

  const changeListingStatus = async (id: string, status: string) => {
    await saleListingApi.changeStatus(id, status);
    await load('listing');
  };

  const createDeal = async () => {
    if (!dListing || !dPrice) return;
    await propertyDealApi.create({
      sale_listing_id: dListing,
      sale_price: Number(dPrice),
      currency: dCur,
    });
    Alert.alert('已登记成交');
    setDListing(''); setDPrice('');
    setShowDealForm(false);
    await load('deal');
  };

  const changeDealStatus = async (id: string, status: string) => {
    await propertyDealApi.changeStatus(id, status);
    await load('deal');
    if (tab === 'escrow' || tab === 'mortgage') load(tab);
  };

  const registerEscrow = async () => {
    if (!eDeal || !eAmount) return;
    await propertyDealApi.createEscrow({
      deal_id: eDeal,
      amount: Number(eAmount),
      currency: eCur,
    });
    Alert.alert('已登记定金托管');
    setEDeal(''); setEAmount('');
    setShowEscForm(false);
    await load('escrow');
  };

  const actEscrow = async (id: string, act: 'release' | 'refund') => {
    if (act === 'release') await propertyDealApi.releaseEscrow(id);
    else await propertyDealApi.refundEscrow(id);
    await load('escrow');
  };

  const submitMortgage = async () => {
    if (!mBank || !mAmount) return;
    await propertyDealApi.createMortgage({
      bank: mBank,
      loan_amount: Number(mAmount),
      currency: mCur,
      term_months: Number(mTerm) || 360,
      deal_id: mDeal || undefined,
    });
    Alert.alert('已提交按揭申请');
    setMBank(''); setMAmount('');
    setShowMortForm(false);
    await load('mortgage');
  };

  const approveMortgage = async (id: string, status: string) => {
    await propertyDealApi.updateMortgageStatus(id, status);
    await load('mortgage');
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'listing', label: '挂牌' },
    { key: 'deal', label: '成交' },
    { key: 'escrow', label: '托管' },
    { key: 'mortgage', label: '按揭' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabChip, tab === t.key && styles.tabChipActive]}
            onPress={() => switchTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} colors={[colors.primary]} tintColor={colors.primary} />}
      >
        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {/* —— 挂牌 —— */}
        {tab === 'listing' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowListingForm(!showListingForm)}>
                <Text style={styles.addBtnText}>{showListingForm ? '收起发布' : '发布挂牌'}</Text>
              </TouchableOpacity>
              <View style={styles.filterRow}>
                {['all', 'sell', 'buy'].map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.filterChip, filterType === f && styles.filterChipActive]}
                    onPress={() => { setFilterType(f); load('listing'); }}
                  >
                    <Text style={[styles.filterText, filterType === f && styles.filterTextActive]}>
                      {f === 'all' ? '全部' : f === 'sell' ? '出售' : '求购'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {showListingForm && (
              <View style={styles.form}>
                <TextInput style={styles.input} placeholder="房源标题" placeholderTextColor={colors.ink3} value={lTitle} onChangeText={setLTitle} />
                <View style={styles.chipRow}>
                  {['sell', 'buy'].map((t) => (
                    <TouchableOpacity key={t} style={[styles.chip, lType === t && styles.chipActive]} onPress={() => setLType(t)}>
                      <Text style={[styles.chipText, lType === t && styles.chipTextActive]}>{t === 'sell' ? '出售' : '求购'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={styles.input} placeholder="售价" placeholderTextColor={colors.ink3} keyboardType="numeric" value={lPrice} onChangeText={setLPrice} />
                <View style={styles.chipRow}>
                  {['THB', 'USD', 'CNY'].map((c) => (
                    <TouchableOpacity key={c} style={[styles.chip, lCur === c && styles.chipActive]} onPress={() => setLCur(c)}>
                      <Text style={[styles.chipText, lCur === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={styles.input} placeholder="地址" placeholderTextColor={colors.ink3} value={lAddress} onChangeText={setLAddress} />
                <TextInput style={styles.input} placeholder="面积（㎡）" placeholderTextColor={colors.ink3} keyboardType="numeric" value={lSize} onChangeText={setLSize} />
                <TouchableOpacity style={styles.submitBtn} onPress={publishListing}>
                  <Text style={styles.submitBtnText}>发布</Text>
                </TouchableOpacity>
              </View>
            )}

            {listings.length === 0 && !loading && <Text style={styles.empty}>暂无挂牌</Text>}
            {listings.map((l) => (
              <View key={l.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{l.title || '-'}</Text>
                  <View style={[styles.pill, l.sale_type === 'buy' ? styles.pillWarn : styles.pillOk]}>
                    <Text style={[styles.pillText, l.sale_type === 'buy' ? styles.pillWarnText : styles.pillOkText]}>{l.sale_type === 'buy' ? '求购' : '出售'}</Text>
                  </View>
                </View>
                <Text style={styles.price}>{fmtMoney(l.asking_price, l.currency)}</Text>
                <Text style={styles.sub}>状态：{L_STATUS[l.status] || l.status}</Text>
                {l.address ? <Text style={styles.sub} numberOfLines={1}>地址：{l.address}</Text> : null}
                {l.size_sqm ? <Text style={styles.sub}>面积：{l.size_sqm} ㎡</Text> : null}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actBtn} onPress={() => changeListingStatus(l.id, 'contracted')}><Text style={styles.actBtnText}>签约</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.actBtn} onPress={() => changeListingStatus(l.id, 'sold')}><Text style={styles.actBtnText}>售出</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.actBtn} onPress={() => { setDListing(l.id); setDPrice(String(l.asking_price ?? '')); setShowDealForm(true); switchTab('deal'); }}><Text style={styles.actBtnText}>建成交</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.actBtn, styles.actBtnGhost]} onPress={() => Alert.alert('挂牌/估价', '『建成交』以该挂牌发起成交登记')}><Text style={styles.actBtnGhostText}>估价</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* —— 成交 —— */}
        {tab === 'deal' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowDealForm(!showDealForm)}>
                <Text style={styles.addBtnText}>{showDealForm ? '收起登记' : '登记成交'}</Text>
              </TouchableOpacity>
            </View>

            {showDealForm && (
              <View style={styles.form}>
                <Text style={styles.formLabel}>选择挂牌（求购/在售）</Text>
                {listings.length === 0 && <TouchableOpacity style={styles.linkBtn} onPress={() => load('listing')}><Text style={styles.linkText}>加载挂牌列表</Text></TouchableOpacity>}
                {listings.map((l) => (
                  <TouchableOpacity
                    key={l.id}
                    style={[styles.dealChip, dListing === l.id && styles.dealChipActive]}
                    onPress={() => setDListing(l.id)}
                  >
                    <Text style={[styles.dealChipText, dListing === l.id && styles.dealChipTextActive]} numberOfLines={1}>
                      {l.title || l.id.slice(0, 8)}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TextInput style={styles.input} placeholder="成交价" placeholderTextColor={colors.ink3} keyboardType="numeric" value={dPrice} onChangeText={setDPrice} />
                <TextInput style={styles.input} placeholder="币种（THB/USD/CNY）" placeholderTextColor={colors.ink3} value={dCur} onChangeText={setDCur} />
                <TouchableOpacity style={styles.submitBtn} onPress={createDeal} disabled={!dListing}>
                  <Text style={styles.submitBtnText}>登记</Text>
                </TouchableOpacity>
              </View>
            )}

            {deals.length === 0 && !loading && <Text style={styles.empty}>暂无成交</Text>}
            {deals.map((d) => (
              <View key={d.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>成交 #{(d.id || '').slice(0, 8)}</Text>
                  <View style={[styles.pill, styles.pillOk]}>
                    <Text style={[styles.pillText, styles.pillOkText]}>{D_STATUS[d.status] || d.status}</Text>
                  </View>
                </View>
                <Text style={styles.price}>{fmtMoney(d.sale_price, d.currency)}</Text>
                <Text style={styles.sub}>挂牌：{(d.sale_listing_id || '').slice(0, 8)}</Text>
                {d.notes ? <Text style={styles.sub} numberOfLines={2}>备注：{d.notes}</Text> : null}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actBtn} onPress={() => changeDealStatus(d.id, 'escrow')}><Text style={styles.actBtnText}>转托管</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.actBtn} onPress={() => changeDealStatus(d.id, 'signed')}><Text style={styles.actBtnText}>签约</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.actBtn} onPress={() => changeDealStatus(d.id, 'completed')}><Text style={styles.actBtnText}>完成</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* —— 托管 —— */}
        {tab === 'escrow' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowEscForm(!showEscForm)}>
                <Text style={styles.addBtnText}>{showEscForm ? '收起登记' : '登记托管'}</Text>
              </TouchableOpacity>
            </View>

            {showEscForm && (
              <View style={styles.form}>
                <Text style={styles.formLabel}>选择成交单</Text>
                {deals.map((dd) => (
                  <TouchableOpacity
                    key={dd.id}
                    style={[styles.dealChip, eDeal === dd.id && styles.dealChipActive]}
                    onPress={() => setEDeal(dd.id)}
                  >
                    <Text style={[styles.dealChipText, eDeal === dd.id && styles.dealChipTextActive]} numberOfLines={1}>
                      成交 #{(dd.id || '').slice(0, 8)} · {fmtMoney(dd.sale_price, dd.currency)}
                    </Text>
                  </TouchableOpacity>
                ))}
                {deals.length === 0 && <TouchableOpacity style={styles.linkBtn} onPress={() => load('deal')}><Text style={styles.linkText}>加载成交单</Text></TouchableOpacity>}
                <TextInput style={styles.input} placeholder="托管金额" placeholderTextColor={colors.ink3} keyboardType="numeric" value={eAmount} onChangeText={setEAmount} />
                <TextInput style={styles.input} placeholder="币种" placeholderTextColor={colors.ink3} value={eCur} onChangeText={setECur} />
                <TouchableOpacity style={styles.submitBtn} onPress={registerEscrow} disabled={!eDeal}>
                  <Text style={styles.submitBtnText}>登记</Text>
                </TouchableOpacity>
              </View>
            )}

            {escrows.length === 0 && !loading && <Text style={styles.empty}>暂无托管记录</Text>}
            {escrows.map((e) => (
              <View key={e.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>托管 #{(e.id || '').slice(0, 8)}</Text>
                  <View style={[styles.pill, e.status === 'released_seller' || e.status === 'refunded_buyer' ? styles.pillWarn : styles.pillOk]}>
                    <Text style={[styles.pillText, e.status === 'released_seller' || e.status === 'refunded_buyer' ? styles.pillWarnText : styles.pillOkText]}>{E_STATUS[e.status] || e.status}</Text>
                  </View>
                </View>
                <Text style={styles.price}>{fmtMoney(e.amount, e.currency)}</Text>
                <Text style={styles.sub}>关联成交：#{(e.dealId || e.deal_id || '').slice(0, 8)}</Text>
                {e.status === 'deposited' && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.actBtn} onPress={() => actEscrow(e.id, 'release')}><Text style={styles.actBtnText}>放款给卖方</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.actBtn, styles.actBtnDanger]} onPress={() => actEscrow(e.id, 'refund')}><Text style={styles.actBtnText}>退款给买方</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        {/* —— 按揭 —— */}
        {tab === 'mortgage' && (
          <>
            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowMortForm(!showMortForm)}>
                <Text style={styles.addBtnText}>{showMortForm ? '收起申请' : '提交按揭'}</Text>
              </TouchableOpacity>
            </View>

            {showMortForm && (
              <View style={styles.form}>
                <Text style={styles.formLabel}>关联成交单（可选）</Text>
                {deals.length === 0 && <TouchableOpacity style={styles.linkBtn} onPress={() => load('deal')}><Text style={styles.linkText}>可选：先登记成交单</Text></TouchableOpacity>}
                <TextInput style={styles.input} placeholder="银行" placeholderTextColor={colors.ink3} value={mBank} onChangeText={setMBank} />
                <TextInput style={styles.input} placeholder="贷款金额" placeholderTextColor={colors.ink3} keyboardType="numeric" value={mAmount} onChangeText={setMAmount} />
                <TextInput style={styles.input} placeholder="币种" placeholderTextColor={colors.ink3} value={mCur} onChangeText={setMCur} />
                <TextInput style={styles.input} placeholder="期限（月，默认360）" placeholderTextColor={colors.ink3} keyboardType="numeric" value={mTerm} onChangeText={setMTerm} />
                <TouchableOpacity style={styles.submitBtn} onPress={submitMortgage}>
                  <Text style={styles.submitBtnText}>提交</Text>
                </TouchableOpacity>
              </View>
            )}

            {mortgages.length === 0 && !loading && <Text style={styles.empty}>暂无按揭申请</Text>}
            {mortgages.map((m) => (
              <View key={m.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{m.bank || '-'}</Text>
                  <View style={[styles.pill, m.status === 'approved' ? styles.pillOk : m.status === 'rejected' ? styles.pillWarn : styles.pillDefault]}>
                    <Text style={[styles.pillText, m.status === 'approved' ? styles.pillOkText : m.status === 'rejected' ? styles.pillWarnText : styles.pillDefaultText]}>{M_STATUS[m.status] || m.status}</Text>
                  </View>
                </View>
                <Text style={styles.price}>{fmtMoney(m.loan_amount, m.currency)}</Text>
                <Text style={styles.sub}>期限：{m.term_months ?? 0} 个月</Text>
                {m.status === 'applied' && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.actBtn} onPress={() => approveMortgage(m.id, 'approved')}><Text style={styles.actBtnText}>批准</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.actBtn, styles.actBtnDanger]} onPress={() => approveMortgage(m.id, 'rejected')}><Text style={styles.actBtnText}>拒绝</Text></TouchableOpacity>
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
  tabChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: colors.radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, color: colors.ink3 },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: 16 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8, gap: 8, flexWrap: 'wrap' },
  addBtn: { backgroundColor: colors.primary, borderRadius: colors.radius.full, paddingVertical: 8, paddingHorizontal: 16 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: colors.radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.sidebarActive, borderColor: colors.primary },
  filterText: { fontSize: 12, color: colors.ink3 },
  filterTextActive: { color: colors.primary, fontWeight: '600' },
  form: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
  formLabel: { fontSize: 13, color: colors.ink2, marginBottom: 6 },
  input: { height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: colors.ink, marginBottom: 12 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: colors.radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.ink3 },
  chipTextActive: { color: '#fff' },
  submitBtn: { backgroundColor: colors.primary, borderRadius: colors.radius.full, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dealChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  dealChipActive: { backgroundColor: colors.sidebarActive, borderColor: colors.primary },
  dealChipText: { fontSize: 12, color: colors.ink2 },
  dealChipTextActive: { color: colors.primary, fontWeight: '600' },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  linkText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.ink3, paddingVertical: 40 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink, marginRight: 8 },
  price: { fontSize: 17, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  sub: { fontSize: 12, color: colors.ink2, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: colors.radius.full },
  pillOk: { backgroundColor: colors.successLight },
  pillWarn: { backgroundColor: colors.warningLight },
  pillDefault: { backgroundColor: colors.surface2 },
  pillOkText: { color: colors.success },
  pillWarnText: { color: colors.warning },
  pillDefaultText: { color: colors.ink2 },
  pillText: { fontSize: 11 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  actBtn: { backgroundColor: colors.primary, borderRadius: colors.radius.full, paddingVertical: 7, paddingHorizontal: 14 },
  actBtnGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actBtnDanger: { backgroundColor: colors.error },
  actBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  actBtnGhostText: { color: colors.ink2, fontSize: 12 },
});