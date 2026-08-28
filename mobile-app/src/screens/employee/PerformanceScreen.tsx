import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import Card from '../../components/Card';
import colors from '../../theme/colors';

interface RankItem {
  id: string;
  rank: number;
  name: string;
  deals: number;
  amount: number;
}

const MOCK_RANK: RankItem[] = [
  { id: '1', rank: 1, name: '陈经纪人', deals: 12, amount: 286000 },
  { id: '2', rank: 2, name: '林经纪人', deals: 10, amount: 245000 },
  { id: '3', rank: 3, name: '黄经纪人', deals: 8, amount: 198000 },
  { id: '4', rank: 4, name: '刘经纪人', deals: 6, amount: 132000 },
  { id: '5', rank: 5, name: '吴经纪人', deals: 5, amount: 98000 },
];

export default function PerformanceScreen() {
  const renderItem = ({ item }: { item: RankItem }) => (
    <Card>
      <View style={styles.row}>
        <View style={[styles.rankBadge, item.rank <= 3 && styles.rankTop]}>
          <Text style={styles.rankText}>{item.rank}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.deals}>成交 {item.deals} 单</Text>
        </View>
        <Text style={styles.amount}>¥{item.amount.toLocaleString()}</Text>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>本月成交</Text>
          <Text style={styles.summaryValue}>41 单</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>成交总额</Text>
          <Text style={styles.summaryValue}>¥959,000</Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>业绩排行榜</Text>
      <FlatList
        data={MOCK_RANK}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summary: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 20,
    alignItems: 'center',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  summaryValue: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 6 },
  divider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: 'rgba(255,255,255,0.4)' },
  sectionTitle: { fontSize: 15, color: colors.text, fontWeight: '600', marginHorizontal: 12, marginTop: 16, marginBottom: 4 },
  list: { paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankTop: { backgroundColor: colors.warning },
  rankText: { fontSize: 14, fontWeight: '700', color: colors.text },
  info: { flex: 1 },
  name: { fontSize: 15, color: colors.text, fontWeight: '500' },
  deals: { fontSize: 12, color: '#999', marginTop: 4 },
  amount: { fontSize: 15, color: colors.error, fontWeight: '600' },
});
