import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { maintenanceApi } from '@/services/api';
import type { MaintenanceTicket } from '@/types';

const PRIORITY_OPTIONS: Array<{ label: string; value: MaintenanceTicket['priority'] }> = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '紧急', value: 'urgent' },
];

export default function MaintenanceScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MaintenanceTicket['priority']>('medium');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('提示', '请输入报修标题');
      return;
    }
    setSubmitting(true);
    try {
      await maintenanceApi.create({
        title: title.trim(),
        description: description.trim(),
        priority,
      });
      Alert.alert('提交成功', '您的报修工单已提交，工作人员将尽快处理');
      setTitle('');
      setDescription('');
      setPriority('medium');
    } catch (err: any) {
      Alert.alert('提交失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card title="报修工单">
        <Text style={styles.label}>标题</Text>
        <TextInput
          style={styles.input}
          placeholder="请简述问题，如：水管漏水"
          placeholderTextColor="#999"
          value={title}
          onChangeText={setTitle}
        />
        <Text style={styles.label}>详细描述</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="请描述问题详情"
          placeholderTextColor="#999"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <Text style={styles.label}>优先级</Text>
        <View style={styles.priorityRow}>
          {PRIORITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.priorityBtn, priority === opt.value && styles.priorityBtnActive]}
              onPress={() => setPriority(opt.value)}
            >
              <Text
                style={[styles.priorityText, priority === opt.value && styles.priorityTextActive]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>提交工单</Text>
          )}
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingVertical: 8 },
  label: { fontSize: 14, color: colors.text, fontWeight: '500', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  textarea: { minHeight: 90 },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  priorityBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(22,119,255,0.08)' },
  priorityText: { fontSize: 14, color: '#666' },
  priorityTextActive: { color: colors.primary, fontWeight: '600' },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
