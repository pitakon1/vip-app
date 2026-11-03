/** 「放置/管理签署区」双栏工作台（左配置栏 + 右文档区）。 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { SIGN_TYPES, SIGN_TYPE_META } from '../constants';
import { styles } from '../styles';
import type { useSignStudio } from '../hooks/useSignStudio';
import AssetThumb from './AssetThumb';
import SignFieldCard from './SignFieldCard';
import StudioDocPanel from './StudioDocPanel';

type Studio = ReturnType<typeof useSignStudio>;

interface SignFieldStudioProps {
  studio: Studio;
  detail: any;
  parties: any[];
  canEdit: boolean;
  onAddParty: () => void;
}

export default function SignFieldStudio({ studio, detail, parties, canEdit, onAddParty }: SignFieldStudioProps) {
  const { t } = useI18n();
  const {
    isWide,
    showAddFields,
    setShowAddFields,
    fieldForm,
    setFieldForm,
    fieldsBusy,
    signFields,
    signMethod,
    setSignMethod,
    sealAsset,
    signAsset,
    docUrls,
    openSealLib,
    openSignMake,
    getPlacePan,
    onDocPageLayout,
    submitField,
    applyDefaultLayout,
    removeField,
    doKeywordSearch,
    createKeywordField,
    placeKeywordHitStaff,
    kwKeyword,
    setKwKeyword,
    kwHits,
    kwCount,
    kwSearchBusy,
    kwBusyIdx,
  } = studio;

  return (
    <Modal visible={showAddFields} animationType="slide" onRequestClose={() => setShowAddFields(false)}>
      <View style={styles.studio}>
        <View style={styles.studioHead}>
          <TouchableOpacity onPress={() => setShowAddFields(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </TouchableOpacity>
          <View style={styles.studioHeadTitle}>
            <Text style={styles.studioTitle} numberOfLines={1}>{t('contract.addSignField')}</Text>
          </View>
          <View style={{ width: 32 }} />
        </View>

        {!parties.length ? (
          <View style={styles.studioEmpty}>
            <Ionicons name="person-add-outline" size={30} color={colors.ink3} />
            <Text style={styles.studioEmptyTitle}>{t('contract.needPartyFirst')}</Text>
            <TouchableOpacity
              style={styles.studioEmptyBtn}
              activeOpacity={0.85}
              onPress={onAddParty}
            >
              <Ionicons name="person-add-outline" size={16} color={colors.primaryForeground} />
              <Text style={styles.studioEmptyBtnText}>{t('contract.addParty')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
        {/* 左配置栏 */}
        <View style={isWide ? styles.studioBodyRow : styles.studioStackFlex}>
          <ScrollView style={styles.studioCfgCol} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.studioCfgContent}>
            <Text style={styles.fieldsTip}>{t('contract.fieldPresetTip')}</Text>

            <Text style={styles.cfgSectionTitle}>{t('contract.fieldSelectParty')}</Text>
            <View style={styles.langRow}>
              {parties.filter((p: any) => !!p?.id).map((p: any) => {
                const active = fieldForm.party_id === String(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.8}
                    onPress={() => setFieldForm({ ...fieldForm, party_id: String(p.id) })}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                      {p?.name || t('contract.unknown')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 已保存的签署区：此前编辑器只显示「本次待放置的那一个框」，
                保存过的签署区在左栏与右栏都无处可见，用户以为没保存成功。 */}
            <Text style={styles.cfgSectionTitle}>{t('contract.existingFields')}</Text>
            {signFields.length ? (
              <View style={styles.fieldsList}>{signFields.map((f: any, idx: number) => (
                <SignFieldCard
                  key={f?.id ?? idx}
                  field={f}
                  parties={parties}
                  canEdit={canEdit}
                  fieldsBusy={fieldsBusy}
                  onRemove={removeField}
                />
              ))}</View>
            ) : (
              <Text style={styles.partyNone}>{t('contract.noSignFields')}</Text>
            )}

            <Text style={styles.cfgSectionTitle}>{t('contract.signMethod')}</Text>
            <View style={styles.segRow}>
              {(['position', 'keyword'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.segItem, signMethod === m && styles.segItemOn]}
                  activeOpacity={0.8}
                  onPress={() => setSignMethod(m)}
                >
                  <Text style={[styles.segText, signMethod === m && styles.segTextOn]}>
                    {m === 'position' ? t('contract.signMethodPosition') : t('contract.signMethodKeyword')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {signMethod === 'position' && (
              <>
                <Text style={styles.cfgSectionTitle}>{t('contract.signFieldType')}</Text>
                <View style={styles.langRow}>
                  {SIGN_TYPES.map((type) => {
                    const active = fieldForm.type === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[styles.chip, active && styles.chipActive]}
                        activeOpacity={0.8}
                        onPress={() => setFieldForm({ ...fieldForm, type })}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {t(SIGN_TYPE_META[type].labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* 印章 / 手写签名资产参考块 */}
                <Text style={styles.cfgSectionTitle}>{t('contract.mySeals')}</Text>
                <View style={styles.assetBox}>
                  {sealAsset?.data_url ? (
                    <>
                      <AssetThumb uri={sealAsset.data_url} style={styles.assetThumb} />
                      <View style={styles.assetInfo}>
                        <Text style={styles.assetName} numberOfLines={1}>{sealAsset.name || t('contract.mySeals')}</Text>
                        <Text style={styles.assetMeta}>{t('contract.assetPickedSeal')}</Text>
                      </View>
                      <TouchableOpacity style={styles.assetAct}  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8} onPress={openSealLib}>
                        <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={styles.assetEmpty}>
                      <Ionicons name="business-outline" size={18} color={colors.ink3} />
                      <Text style={styles.assetEmptyText}>{t('contract.sealNotMade')}</Text>
                      <TouchableOpacity style={styles.assetMakeBtn} activeOpacity={0.8} onPress={openSealLib}>
                        <Text style={styles.assetMakeText}>{t('contract.makeSeal')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <Text style={styles.cfgSectionTitle}>{t('contract.mySigns')}</Text>
                <View style={styles.assetBox}>
                  {signAsset?.data_url ? (
                    <>
                      <AssetThumb uri={signAsset.data_url} style={styles.assetThumb} />
                      <View style={styles.assetInfo}>
                        <Text style={styles.assetName} numberOfLines={1}>{signAsset.name || t('contract.mySigns')}</Text>
                        <Text style={styles.assetMeta}>{t('contract.assetPickedSign')}</Text>
                      </View>
                      <TouchableOpacity style={styles.assetAct}  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8} onPress={openSignMake}>
                        <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={styles.assetEmpty}>
                      <Ionicons name="create-outline" size={18} color={colors.ink3} />
                      <Text style={styles.assetEmptyText}>{t('contract.signNotMade')}</Text>
                      <TouchableOpacity style={styles.assetPickBtn} activeOpacity={0.8} onPress={openSignMake}>
                        <Text style={styles.assetPickText}>{t('contract.makeSign')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <Text style={styles.cfgSectionTitle}>{t('contract.placeOnDocHint')}</Text>
                <TouchableOpacity style={styles.defaultBtn} activeOpacity={0.8} onPress={applyDefaultLayout}>
                  <Ionicons name="grid-outline" size={15} color={colors.primary} />
                  <Text style={styles.defaultBtnText}>{t('contract.defaultLayout')}</Text>
                </TouchableOpacity>
              </>
            )}

            {signMethod === 'keyword' && (
              <>
                <Text style={styles.cfgSectionTitle}>{t('contract.keywordSign')}</Text>
                <View style={styles.keywordSearchRow}>
                  <TextInput
                    style={[styles.input, styles.keywordInput]}
                    placeholder={t('contract.keywordPh')}
                    value={kwKeyword}
                    onChangeText={setKwKeyword}
                    placeholderTextColor={colors.ink3}
                  />
                  <TouchableOpacity
                    style={[styles.keywordSearchBtn, kwSearchBusy && styles.btnDisabled]}
                    activeOpacity={0.8}
                    disabled={kwSearchBusy}
                    onPress={doKeywordSearch}
                  >
                    {kwSearchBusy ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Text style={styles.keywordSearchBtnText}>{t('contract.searchKeyword')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {kwCount > 0 && <Text style={styles.keywordCount}>{t('contract.keywordHits', { n: kwCount })}</Text>}
                {kwHits.map((hit, idx) => (
                  <View key={idx} style={styles.keywordHitRow}>
                    <Ionicons name="location-outline" size={15} color={colors.primary} />
                    <Text style={styles.keywordHitText}>
                      {t('contract.hitOnPage', { page: hit?.page ?? 1 })}：{hit?.text ?? ''}
                    </Text>
                    <TouchableOpacity
                      style={styles.keywordAddBtn}
                       hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8}
                      disabled={kwBusyIdx === idx}
                      onPress={() => {
                        placeKeywordHitStaff(hit);
                        createKeywordField(idx);
                      }}
                    >
                      {kwBusyIdx === idx ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons name={fieldForm.type === 'seal' ? 'business-outline' : 'create-outline'} size={15} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, !!fieldsBusy && styles.btnDisabled]}
              activeOpacity={0.85}
              disabled={!!fieldsBusy}
              onPress={submitField}
            >
              {!!fieldsBusy ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryBtnText}>{t('contract.confirm')}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>

          {/* 右栏文档区 */}
          <StudioDocPanel
            detail={detail}
            parties={parties}
            signFields={signFields}
            fieldForm={fieldForm}
            docUrls={docUrls}
            signMethod={signMethod}
            getPlacePan={getPlacePan}
            onDocPageLayout={onDocPageLayout}
          />
        </View>
          </>
        )}
      </View>
    </Modal>
  );
}
