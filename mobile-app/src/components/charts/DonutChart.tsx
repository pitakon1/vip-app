import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

interface DonutSegment {
  value: number;
  color: string;
  label: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerText?: string;
  centerSub?: string;
}

/**
 * 环形图 - RN 纯 View 实现
 * 原理：将环分成左右两个半圆，每段用旋转 + 裁剪实现
 */
export default function DonutChart({
  segments,
  size = 140,
  strokeWidth = 14,
  centerText,
  centerSub,
}: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const radius = size / 2;
  const innerRadius = radius - strokeWidth;

  // 计算累计百分比
  let cumulative = 0;
  const segs = segments.map((seg) => {
    const pct = seg.value / total;
    const start = cumulative;
    cumulative += pct;
    return { ...seg, pct, start };
  });

  // 渲染单个半圆（左或右）
  // rotateAngle: 该半圆整体旋转角度
  // segsInHalf: 落在该半圆内的段
  const renderHalf = (half: 'left' | 'right', startAngle: number) => {
    // startAngle: 半圆起始角度（右半圆从 0 开始，左半圆从 180 开始）
    const halfStart = startAngle; // 度
    const halfEnd = startAngle + 180;

    // 找出与该半圆相交的段，计算每段在半圆内的起止百分比
    const halfSegs: { color: string; startPct: number; endPct: number }[] = [];

    segs.forEach((seg) => {
      const segStartDeg = seg.start * 360;
      const segEndDeg = (seg.start + seg.pct) * 360;

      // 相交检测
      const overlapStart = Math.max(segStartDeg, halfStart);
      const overlapEnd = Math.min(segEndDeg, halfEnd);

      if (overlapEnd > overlapStart) {
        halfSegs.push({
          color: seg.color,
          startPct: (overlapStart - halfStart) / 180,
          endPct: (overlapEnd - halfStart) / 180,
        });
      }
    });

    const halfSize = size / 2;

    return (
      <View
        style={[
          styles.halfContainer,
          half === 'right' ? styles.halfRight : styles.halfLeft,
          { width: halfSize, height: size },
        ]}
      >
        {halfSegs.map((hs, idx) => {
          // 在半圆内，旋转从 -90deg（顶部）开始
          // startPct=0 → 旋转 0deg（3点钟方向）
          // 用 rotate 旋转扇区
          const rotateDeg = hs.startPct * 180 - 90; // 起始角度
          const spanDeg = (hs.endPct - hs.startPct) * 180; // 扇区角度

          // 如果扇区很小，直接跳过
          if (spanDeg < 0.5) return null;

          return (
            <View
              key={idx}
              style={{
                position: 'absolute',
                width: halfSize,
                height: size,
                transform: [{ rotate: `${rotateDeg}deg` }],
                ...(half === 'right'
                  ? { left: 0, transformOrigin: `${halfSize}px center` }
                  : { right: 0, transformOrigin: `0px center` }),
              }}
            >
              {/* 扇区：用一个三角形/矩形近似 */}
              <View
                style={{
                  width: halfSize,
                  height: size,
                  overflow: 'hidden',
                  transform: [{ rotate: `${spanDeg}deg` }],
                  transformOrigin: half === 'right' ? `${halfSize}px center` : '0px center',
                }}
              >
                <View
                  style={{
                    width: halfSize,
                    height: size,
                    backgroundColor: hs.color,
                    transform: [
                      { translateX: half === 'right' ? -halfSize + strokeWidth / 2 : 0 },
                    ],
                    borderRadius: half === 'right' ? 0 : radius,
                    borderTopLeftRadius: half === 'right' ? 0 : radius,
                    borderBottomLeftRadius: half === 'right' ? 0 : radius,
                    borderTopRightRadius: half === 'right' ? radius : 0,
                    borderBottomRightRadius: half === 'right' ? radius : 0,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* 背景环 */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: strokeWidth,
          borderColor: colors.surface2,
        }}
      />
      {/* 右半圆（0-180度） */}
      {renderHalf('right', 0)}
      {/* 左半圆（180-360度） */}
      {renderHalf('left', 180)}
      {/* 内圆挖空 */}
      <View
        style={{
          position: 'absolute',
          width: innerRadius * 2,
          height: innerRadius * 2,
          borderRadius: innerRadius,
          left: strokeWidth,
          top: strokeWidth,
          backgroundColor: colors.surface,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {centerText !== undefined && (
          <Text style={styles.centerText}>{centerText}</Text>
        )}
        {centerSub !== undefined && <Text style={styles.centerSub}>{centerSub}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  halfContainer: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  halfRight: {
    right: 0,
  },
  halfLeft: {
    left: 0,
  },
  centerText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  centerSub: {
    fontSize: 11,
    color: colors.ink3,
    marginTop: 2,
  },
});
