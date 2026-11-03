/** 「放置签署区」右栏：PDF 页图 + 已保存签署区示意框 + 本次待放置草稿框。 */
import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  type LayoutChangeEvent,
  type DimensionValue,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { SIGN_TYPE_META } from '../constants';
import { styles } from '../styles';
import type { SignFieldForm } from '../types';

interface StudioDocPanelProps {
  detail: any;
  parties: any[];
  signFields: any[];
  fieldForm: SignFieldForm;
  docUrls: Record<number, string>;
  signMethod: 'position' | 'keyword';
  getPlacePan: (page: number) => { panHandlers: any };
  onDocPageLayout: (page: number) => (e: LayoutChangeEvent) => void;
}

export default function StudioDocPanel({
  detail,
  parties,
  signFields,
  fieldForm,
  docUrls,
  signMethod,
  getPlacePan,
  onDocPageLayout,
}: StudioDocPanelProps) {
  const { t } = useI18n();

  return (
    <ScrollView style={styles.studioDocCol} contentContainerStyle={styles.studioDocContent}>
      {detail?.pdf_available ? (
        <>
          <View style={styles.docPlaceTip}>
            <Ionicons name="hand-left-outline" size={15} color={colors.primary} />
            <Text style={styles.docPlaceTipText}>
              {signMethod === 'keyword' ? t('contract.kwPlaceTip') : t('contract.dragHintOnDoc')}
            </Text>
          </View>
          {Object.keys(docUrls).length ? (
            Object.keys(docUrls)
              .map(Number)
              .sort((a, b) => a - b)
              .map((page) => {
                const active = Number(fieldForm.page) === page;
                // 该页已保存的签署区：一律渲染成虚线框 + 归属姓名标签。
                // 此前右栏只画「本次待放置的那一个草稿框」，保存过的签署区在文档上
                // 完全不可见，用户以为「加了签署区、加了姓名」没生效。
                const pageFields = signFields.filter(
                  (f: any) => (Number(f?.page) || 1) === page,
                );
                const draftParty = parties.find(
                  (p: any) => String(p?.id) === String(fieldForm.party_id),
                );
                return (
                  <View
                    key={page}
                    style={[styles.pdfPageWrap, active && styles.pdfPageWrapActive]}
                    onLayout={onDocPageLayout(page)}
                    {...getPlacePan(page).panHandlers}
                  >
                    <Image source={{ uri: docUrls[page] }} style={styles.pdfPageImage} resizeMode="stretch" />
                    {pageFields.map((f: any, i: number) => {
                      const meta = SIGN_TYPE_META[f?.field_type ?? 'signature'] ?? SIGN_TYPE_META.signature;
                      const owner = parties.find((p: any) => String(p?.id) === String(f?.party_id));
                      const signed = !!f?.signed;
                      return (
                        <View
                          key={f?.id ?? `f-${page}-${i}`}
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            left: `${Number(f?.x) || 0}%` as DimensionValue,
                            top: `${Number(f?.y) || 0}%` as DimensionValue,
                            width: `${Number(f?.w) || 20}%` as DimensionValue,
                            height: `${Number(f?.h) || 8}%` as DimensionValue,
                            borderWidth: 1.5,
                            borderStyle: 'dashed',
                            borderColor: signed ? colors.success : colors.primary,
                            backgroundColor: colors.alpha(
                              signed ? colors.successRgb : colors.primaryRgb,
                              0.14,
                            ),
                            borderRadius: 6,
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                          }}
                        >
                          <Text style={styles.fieldTag} numberOfLines={2}>
                            {t(meta.labelKey)} · {owner?.name || t('contract.unknown')}
                          </Text>
                        </View>
                      );
                    })}
                    {active && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          left: `${Number(fieldForm.x) || 0}%` as DimensionValue,
                          top: `${Number(fieldForm.y) || 0}%` as DimensionValue,
                          width: fieldForm.type === 'signature' ? ('22%' as DimensionValue) : ('13%' as DimensionValue),
                          height: fieldForm.type === 'signature' ? ('8%' as DimensionValue) : ('6%' as DimensionValue),
                          borderWidth: 2,
                          borderStyle: 'solid',
                          borderColor: colors.warning,
                          backgroundColor: colors.alpha(colors.warningRgb, 0.16),
                          borderRadius: 6,
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        <Ionicons
                          name={SIGN_TYPE_META[fieldForm.type]?.icon ?? 'create-outline'}
                          size={14}
                          color={colors.warning}
                        />
                        <Text style={[styles.fieldTag, { color: colors.warning }]} numberOfLines={1}>
                          {draftParty?.name || t('contract.unknown')}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
          ) : (
            <View style={styles.pdfLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
        </>
      ) : (
        <View style={styles.noPdfBox}>
          <Ionicons name="document-outline" size={30} color={colors.ink3} />
          <Text style={styles.noPdfText}>{t('contract.noPdfPreview')}</Text>
          <Text style={styles.noPdfText}>{t('contract.placeByFormHint')}</Text>
        </View>
      )}
    </ScrollView>
  );
}
