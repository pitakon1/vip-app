import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  maxValue?: number;
  height?: number;
  unit?: string;
  labelColor?: string;
  activeIndex?: number;
}

export default function BarChart({
  data,
  maxValue,
  height = 160,
  unit = '',
  labelColor,
  activeIndex,
}: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);
  const barCount = data.length;

  return (
    <View style={[styles.container, { height }]}>
      {/* 横向网格线 */}
      <View style={styles.gridLines}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.gridLine} />
        ))}
      </View>
      {/* 柱子 */}
      <View style={styles.barsRow}>
        {data.map((d, idx) => {
          const ratio = max > 0 ? d.value / max : 0;
          const barHeight = Math.max(ratio * (height - 40), 3);
          const isActive = activeIndex === idx;
          return (
            <View key={idx} style={styles.barCol}>
              <Text style={[styles.barValue, labelColor && { color: labelColor }]}>
                {d.value >= 10000
                  ? `${(d.value / 10000).toFixed(1)}万`
                  : d.value >= 1000
                    ? `${(d.value / 1000).toFixed(1)}k`
                    : d.value}
              </Text>
              <View style={styles.barWrap}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      backgroundColor: d.color ?? colors.primary,
                      opacity: isActive !== undefined ? (isActive ? 1 : 0.5) : 1,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, labelColor && { color: labelColor }]} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    paddingTop: 4,
  },
  gridLines: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    bottom: 20,
    justifyContent: 'space-between',
  },
  gridLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  barsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingBottom: 20,
    paddingTop: 4,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barValue: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.ink2,
    marginBottom: 4,
  },
  barWrap: {
    width: '60%',
    maxWidth: 28,
    justifyContent: 'flex-end',
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minHeight: 3,
  },
  barLabel: {
    fontSize: 10,
    color: colors.ink3,
    marginTop: 6,
  },
});
