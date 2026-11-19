/**
 * 房源通勤测算（C 端详情页）。
 *
 * 地铁线路/上下车站点全部来自后端 Google Routes transit 结果，客户端不内置线路库。
 * 未配置地图 Key 时后端返回 `available:false, reason:'no_key'`，这里按 reason
 * 给出明确提示，绝不本地估算（避免假成功）。
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { publicApi } from '@/services/publicApi';

type CommuteMode = 'transit' | 'driving';

interface CommuteResult {
  available: boolean;
  reason?: string | null;
  missing?: string[];
  duration_minutes?: number | null;
  distance_km?: number | null;
  cached?: boolean;
  transit?: {
    lines?: string[];
    stations?: string[];
    has_rail?: boolean;
  } | null;
}

const REASON_KEY: Record<string, string> = {
  no_key: 'pub.commuteNoKey',
  no_origin: 'pub.commuteNoOrigin',
  no_destination: 'pub.commuteNeedDest',
  no_route: 'pub.commuteNoRoute',
  bad_mode: 'pub.commuteBadMode',
  geocode_failed: 'pub.commuteGeoFailed',
  upstream_error: 'pub.commuteUpstream',
  request_failed: 'pub.commuteUpstream',
};

export default function CommuteEstimate({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const [dest, setDest] = useState('');
  const [mode, setMode] = useState<CommuteMode>('transit');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CommuteResult | null>(null);

  const run = async () => {
    const value = dest.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const res: any = await publicApi.estimateCommute(listingId, { destination: value, mode });
      setResult(res?.data ?? res);
    } catch {
      setResult({ available: false, reason: 'request_failed' });
    } finally {
      setBusy(false);
    }
  };

  const reasonText =
    result && !result.available
      ? t(REASON_KEY[result.reason || ''] || 'pub.commuteUpstream', {
          vars: (result.missing || []).join(' / '),
        })
      : '';

  return (
    <View style={styles.block}>
      <Text style={styles.title}>{t('pub.commuteTitle')}</Text>
      <Text style={styles.hint}>{t('pub.commuteHint')}</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={dest}
          onChangeText={setDest}
          placeholder={t('pub.commuteDestPlaceholder')}
          placeholderTextColor={colors.ink3}
          maxLength={120}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => void run()}
          accessibilityLabel={t('pub.commuteDestPlaceholder')}
        />
        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={() => void run()}
          disabled={busy}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={styles.buttonText}>{t('pub.commuteCalc')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.modeRow}>
        {(['transit', 'driving'] as CommuteMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.chip, mode === m && styles.chipActive]}
            onPress={() => setMode(m)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, mode === m && styles.chipTextActive]}>
              {t(m === 'transit' ? 'pub.commuteTransit' : 'pub.commuteDriving')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {result ? (
        result.available ? (
          <View style={styles.result}>
            <Text style={styles.resultMain}>
              {t('pub.commuteDuration', { n: result.duration_minutes ?? '-' })}
              {result.distance_km != null ? ` · ${result.distance_km} ${t('pub.km')}` : ''}
            </Text>
            {result.cached ? <Text style={styles.sub}>{t('pub.commuteCached')}</Text> : null}
            {result.transit?.lines?.length ? (
              <Text style={styles.sub}>
                {t('pub.commuteLines')}
                {t('common.colon')}
                {result.transit.lines.join(' → ')}
              </Text>
            ) : null}
            {result.transit?.stations?.length ? (
              <Text style={styles.sub}>
                {t('pub.commuteStations')}
                {t('common.colon')}
                {result.transit.stations.join(' · ')}
              </Text>
            ) : null}
            <Text style={styles.disclaimer}>{t('pub.commuteDisclaimer')}</Text>
          </View>
        ) : (
          <Text style={styles.error}>{reasonText}</Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.lg,
    marginBottom: colors.spacing.md,
  },
  title: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  hint: {
    fontSize: colors.fontSize.sm,
    color: colors.ink3,
    marginTop: colors.spacing.xs,
    lineHeight: colors.lineHeight.snug,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: colors.spacing.md,
    gap: colors.spacing.sm,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: colors.radius.md,
    backgroundColor: colors.fieldFill,
    borderWidth: 1,
    borderColor: colors.fieldFillBorder,
    paddingHorizontal: colors.spacing.md,
    fontSize: colors.fontSize.sm,
    color: colors.ink,
  },
  button: {
    height: 44,
    minWidth: 84,
    paddingHorizontal: colors.spacing.md,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: colors.fontSize.sm, fontWeight: '600', color: colors.primaryForeground },
  modeRow: {
    flexDirection: 'row',
    gap: colors.spacing.sm,
    marginTop: colors.spacing.sm,
  },
  chip: {
    paddingHorizontal: colors.spacing.md,
    height: colors.touch.chip,
    borderRadius: colors.radius.full,
    backgroundColor: colors.muted,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
  chipText: { fontSize: colors.fontSize.xs, color: colors.ink2 },
  chipTextActive: { color: colors.ink, fontWeight: '600' },
  result: { marginTop: colors.spacing.md },
  resultMain: { fontSize: colors.fontSize.base, fontWeight: '600', color: colors.ink },
  sub: { fontSize: colors.fontSize.caption, color: colors.ink2, marginTop: colors.spacing.xs },
  disclaimer: {
    fontSize: colors.fontSize.xs,
    color: colors.ink3,
    marginTop: colors.spacing.sm,
    lineHeight: colors.lineHeight.tight,
  },
  error: {
    fontSize: colors.fontSize.sm,
    color: colors.errorInk,
    marginTop: colors.spacing.md,
    lineHeight: colors.lineHeight.snug,
  },
});
