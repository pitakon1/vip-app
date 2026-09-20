import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

interface ProgressSegment {
  value: number;
  color: string;
  label: string;
  subLabel?: string;
}

interface ProgressStackProps {
  segments: ProgressSegment[];
  totalLabel?: string;
  totalValue?: string;
  barHeight?: number;
  showLegend?: boolean;
}

export default function ProgressStack({
  segments,
  totalLabel,
  totalValue,
  barHeight = 12,
  showLegend = true,
}: ProgressStackProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;

  return (
    <View style={styles.container}>
      {(totalLabel || totalValue) && (
        <View style={styles.headerRow}>
          {totalLabel && <Text style={styles.totalLabel}>{totalLabel}</Text>}
          {totalValue && <Text style={styles.totalValue}>{totalValue}</Text>}
        </View>
      )}
      {/* 堆叠进度条 */}
      <View style={[styles.bar, { height: barHeight }]}>
        {segments.map((seg, idx) => {
          const pct = (seg.value / total) * 100;
          if (pct < 1) return null;
          return (
            <View
              key={idx}
              style={{
                width: `${pct}%`,
                height: '100%',
                backgroundColor: seg.color,
                marginLeft: idx === 0 ? 0 : 2,
              }}
            />
          );
        })}
      </View>
      {/* 图例 */}
      {showLegend && (
        <View style={styles.legend}>
          {segments.map((seg, idx) => {
            const pct = ((seg.value / total) * 100).toFixed(0);
            return (
              <View key={idx} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: seg.color }]} />
                <View style={styles.legendText}>
                  <Text style={styles.legendLabel}>{seg.label}</Text>
                  {seg.subLabel && <Text style={styles.legendSub}>{seg.subLabel}</Text>}
                </View>
                <Text style={styles.legendPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  bar: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  legend: {
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  legendText: {
    flex: 1,
  },
  legendLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  legendSub: {
    fontSize: 11,
    color: colors.ink2,
    marginTop: 1,
  },
  legendPct: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink2,
  },
});
