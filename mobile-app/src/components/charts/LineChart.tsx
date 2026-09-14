import React from 'react';
import { View, Text, StyleSheet, type DimensionValue } from 'react-native';
import colors from '../../theme/colors';

interface LineChartProps {
  data: { label: string; value: number }[];
  maxValue?: number;
  height?: number;
  lineColor?: string;
  fillColor?: string;
  showDots?: boolean;
  activeIndex?: number;
}

export default function LineChart({
  data,
  maxValue,
  height = 180,
  lineColor,
  fillColor,
  showDots = true,
  activeIndex,
}: LineChartProps) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);
  const chartHeight = height - 40;
  const count = data.length;
  const lc = lineColor ?? colors.primary;
  const fc = fillColor ?? `${colors.primary}22`;

  // 计算每个点的坐标
  const points = data.map((d, idx) => {
    const ratio = max > 0 ? d.value / max : 0;
    const y = chartHeight * (1 - ratio);
    const x = count > 1 ? (idx / (count - 1)) * 100 : 50;
    return { x, y, value: d.value, label: d.label };
  });

  // 生成 SVG 风格的 path（用多个小矩形模拟折线）
  // 简化：用绝对定位的点 + 连线 View
  const lineSegments: { left: DimensionValue; top: number; width: DimensionValue; angle: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + (dy * (100 / 100)) ** 2); // 近似
    const angle = Math.atan2(dy, (dx * chartHeight) / 100) * (180 / Math.PI);
    lineSegments.push({
      left: `${p1.x}%`,
      top: p1.y,
      width: `${length}%`,
      angle: -angle,
    });
  }

  return (
    <View style={[styles.container, { height }]}>
      {/* 网格线 */}
      <View style={[styles.grid, { height: chartHeight, top: 4 }]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.gridLine} />
        ))}
      </View>
      {/* 折线下填充区域 - 用渐变近似 */}
      <View style={[styles.chartArea, { height: chartHeight, top: 4 }]}>
        {points.map((p, idx) => {
          if (idx === 0) return null;
          const prev = points[idx - 1];
          const avgY = (prev.y + p.y) / 2;
          const width = p.x - prev.x;
          return (
            <View
              key={idx}
              style={{
                position: 'absolute',
                left: `${prev.x}%`,
                top: avgY,
                width: `${width}%`,
                height: chartHeight - avgY,
                backgroundColor: fc,
              }}
            />
          );
        })}
      </View>
      {/* 折线 */}
      <View style={[styles.chartArea, { height: chartHeight, top: 4 }]} pointerEvents="none">
        {lineSegments.map((seg, idx) => (
          <View
            key={idx}
            style={{
              position: 'absolute',
              left: seg.left,
              top: seg.top,
              width: seg.width,
              height: 2,
              backgroundColor: lc,
              transform: [{ rotate: `${seg.angle}deg` }],
              transformOrigin: 'left center',
            }}
          />
        ))}
        {/* 数据点 */}
        {showDots &&
          points.map((p, idx) => {
            const isActive = activeIndex === idx;
            return (
              <View
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${p.x}%`,
                  top: p.y - 4,
                  marginLeft: -4,
                  width: isActive ? 10 : 8,
                  height: isActive ? 10 : 8,
                  borderRadius: isActive ? 5 : 4,
                  backgroundColor: '#fff',
                  borderWidth: 2,
                  borderColor: lc,
                }}
              />
            );
          })}
      </View>
      {/* X 轴标签 */}
      <View style={styles.xLabels}>
        {data.map((d, idx) => (
          <Text key={idx} style={styles.xLabel} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
  },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'space-between',
  },
  gridLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
  },
  chartArea: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  xLabels: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xLabel: {
    fontSize: 10,
    color: colors.ink3,
    textAlign: 'center',
    flex: 1,
  },
});
