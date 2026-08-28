import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import Card from '../../components/Card';
import colors from '../../theme/colors';
import type { Property, PropertyStatus } from '../../types';

const MOCK_PROPERTIES: Property[] = [
  { id: '1', title: '阳光花园 3-201', address: '浦东新区阳光花园', rent: 8500, status: 'rented', area: 88 },
  { id: '2', title: '翠湖天地 5-1802', address: '黄浦区翠湖天地', rent: 18000, status: 'vacant', area: 130 },
  { id: '3', title: '静安公寓 2-305', address: '静安区静安公寓', rent: 12000, status: 'renewing', area: 95 },
  { id: '4', title: '徐汇苑 8-1001', address: '徐汇区徐汇苑', rent: 15000, status: 'maintenance', area: 120 },
  { id: '5', title: '陆家嘴 1-2501', address: '浦东新区陆家嘴', rent: 25000, status: 'vacant', area: 150 },
];

const statusLabels: Record<PropertyStatus, string> = {
  vacant: '空置',
  rented: '已出租',
  renewing: '续约中',
  maintenance: '维护中',
};

const statusColors: Record<PropertyStatus, string> = {
  vacant: colors.warning,
  rented: colors.success,
  renewing: colors.primary,
  maintenance: colors.error,
};

export default function PropertiesScreen() {
  const [properties] = useState<Property[]>(MOCK_PROPERTIES);

  const renderItem = ({ item }: { item: Property }) => (
    <Card title={item.title}>
      <View style={styles.row}>
        <Text style={styles.address}>{item.address}</Text>
        <View style={[styles.badge, { backgroundColor: statusColors[item.status] }]}>
          <Text style={styles.badgeText}>{statusLabels[item.status]}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.rent}>¥{item.rent.toLocaleString()}/月</Text>
        <Text style={styles.area}>{item.area ?? 0}㎡</Text>
        <TouchableOpacity style={styles.btn} activeOpacity={0.8}>
          <Text style={styles.btnText}>管理</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={properties}
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
  address: { flex: 1, color: '#666', fontSize: 13, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { color: '#fff', fontSize: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  rent: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  area: { color: '#999', fontSize: 13 },
  btn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
