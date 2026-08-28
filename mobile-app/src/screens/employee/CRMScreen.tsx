import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import Card from '../../components/Card';
import colors from '../../theme/colors';

interface Lead {
  id: string;
  name: string;
  phone: string;
  intention: 'high' | 'medium' | 'low';
  status: 'new' | 'following' | 'deal' | 'lost';
  note: string;
}

const MOCK_LEADS: Lead[] = [
  { id: '1', name: '张先生', phone: '138****1234', intention: 'high', status: 'following', note: '意向阳光花园 2 室' },
  { id: '2', name: '李女士', phone: '139****5678', intention: 'medium', status: 'new', note: '预算 1 万以内' },
  { id: '3', name: '王先生', phone: '137****9012', intention: 'high', status: 'deal', note: '已签约翠湖天地' },
  { id: '4', name: '赵女士', phone: '135****3456', intention: 'low', status: 'lost', note: '价格不合适' },
];

const intentionMap: Record<Lead['intention'], { label: string; color: string }> = {
  high: { label: '高意向', color: colors.error },
  medium: { label: '中意向', color: colors.warning },
  low: { label: '低意向', color: colors.success },
};

const statusMap: Record<Lead['status'], string> = {
  new: '新线索',
  following: '跟进中',
  deal: '已成交',
  lost: '已流失',
};

export default function CRMScreen() {
  const [leads] = useState<Lead[]>(MOCK_LEADS);

  const renderItem = ({ item }: { item: Lead }) => {
    const it = intentionMap[item.intention];
    return (
      <Card>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.phone}>{item.phone}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: it.color }]}>
            <Text style={styles.badgeText}>{it.label}</Text>
          </View>
        </View>
        <Text style={styles.note}>{item.note}</Text>
        <View style={styles.footer}>
          <Text style={styles.status}>{statusMap[item.status]}</Text>
          <TouchableOpacity style={styles.btn} activeOpacity={0.8}>
            <Text style={styles.btnText}>跟进</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={leads}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  info: { flex: 1 },
  name: { fontSize: 16, color: colors.text, fontWeight: '600' },
  phone: { fontSize: 13, color: '#999', marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { color: '#fff', fontSize: 12 },
  note: { fontSize: 13, color: '#666', marginTop: 10 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  status: { fontSize: 13, color: colors.primary },
  btn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
