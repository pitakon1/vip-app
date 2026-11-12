/** 合同列表：生成入口 + 下拉刷新 + 空态/失败态。 */
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import { useI18n } from '@/i18n';
import { styles } from '../styles';
import type { ContractItem } from '../types';
import ContractRow from './ContractRow';

interface ContractsListProps {
  list: ContractItem[];
  refreshing: boolean;
  error: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  onOpenDetail: (id: string) => void;
  onGenerate: () => void;
  onOpenApproval: () => void;
}

export default function ContractsList({
  list,
  refreshing,
  error,
  onRefresh,
  onRetry,
  onOpenDetail,
  onGenerate,
  onOpenApproval,
}: ContractsListProps) {
  const { t } = useI18n();

  return (
    <FlatList
      data={list}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ContractRow item={item} onPress={onOpenDetail} />}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <View>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={onGenerate}
          >
            <Ionicons name="add" size={18} color={colors.primaryForeground} />
            <Text style={styles.primaryBtnText}>{t('contract.generateTitle')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.approvalEntry} activeOpacity={0.85} onPress={onOpenApproval}>
            <Ionicons name="file-tray-full-outline" size={16} color={colors.primary} />
            <Text style={styles.approvalEntryText}>{t('contract.approval.center')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>{t('contract.manage')}</Text>
        </View>
      }
      ListEmptyComponent={
        error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={t('contract.loadFail')}
            actionLabel={t('pub.retry')}
            onAction={onRetry}
          />
        ) : (
          <EmptyState icon="document-text-outline" title={t('contract.empty')} sub={t('contract.emptyHint')} />
        )
      }
    />
  );
}
