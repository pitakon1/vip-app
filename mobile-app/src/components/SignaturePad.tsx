/**
 * 手写签名画布（法大大风格签署）：
 * 手指/鼠标在画布上拖拽绘制，输出一段 SVG 字符串（signature_svg），
 * 由父级随 sign 请求提交。文本走 i18n。
 */
import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureResponderEvent, PanResponderGestureState } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';

interface Point {
  x: number;
  y: number;
}

interface Props {
  /** 每次绘制结束时回调，返回完整 SVG 字符串（为空表示已清空） */
  onResult: (svg: string) => void;
  /** 标题（可选），通常由父级传入签署方姓名 */
  title?: string;
  height?: number;
}

const STROKE_COLORS = [colors.primary, colors.error, colors.success];

const toSvg = (strokes: Point[][]) => {
  if (!strokes.length) return '';
  const paths: string[] = [];
  strokes.forEach((pts, i) => {
    const color = STROKE_COLORS[i % STROKE_COLORS.length];
    if (pts.length === 1) {
      paths.push(
        `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="2" fill="${color}" stroke="none"/>`,
      );
      return;
    }
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let k = 1; k < pts.length; k++) {
      d += ` L ${pts[k].x} ${pts[k].y}`;
    }
    paths.push(
      `<path d="${d}" stroke="${color}" stroke-width="3" stroke-linecap="round" fill="none"/>`,
    );
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150" width="300" height="150">${paths.join('')}</svg>`;
};

export default function SignaturePad({ onResult, title, height = 200 }: Props) {
  const { t } = useI18n();
  const strokesRef = useRef<Point[][]>([]);
  const [version, setVersion] = useState(0);

  const touch = () => setVersion((v) => v + 1);

  const penResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        strokesRef.current.push([{ x: locationX, y: locationY }]);
        touch();
      },
      onPanResponderMove: (evt: GestureResponderEvent, _s: PanResponderGestureState) => {
        const { locationX, locationY } = evt.nativeEvent;
        const cur = strokesRef.current;
        if (!cur.length) return;
        cur[cur.length - 1].push({ x: locationX, y: locationY });
        touch();
      },
    }),
  ).current;

  React.useEffect(() => {
    // 仅在有内容时回传，避免初始空串误清空父级
    if (version > 0) onResult(toSvg(strokesRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const strokes = strokesRef.current;

  const clear = () => {
    strokesRef.current = [];
    touch();
    onResult('');
  };

  return (
    <View style={styles.wrap}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      <View {...penResponder.panHandlers} style={[styles.canvas, { height }]} collapsable={false}>
        <Svg width="100%" height="100%">
          {strokes.map((pts, i) => {
            const color = STROKE_COLORS[i % STROKE_COLORS.length];
            if (pts.length === 1) {
              return <Circle key={i} cx={pts[0].x} cy={pts[0].y} r={2} fill={color} />;
            }
            let d = `M ${pts[0].x} ${pts[0].y}`;
            for (let k = 1; k < pts.length; k++) d += ` L ${pts[k].x} ${pts[k].y}`;
            return (
              <Path key={i} d={d} stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" />
            );
          })}
        </Svg>
        {strokes.length === 0 ? <Text style={styles.hint}>{t('contract.signHere')}</Text> : null}
      </View>
      <TouchableOpacity style={styles.clearBtn} activeOpacity={0.85} onPress={clear}>
        <Ionicons name="refresh-outline" size={15} color={colors.primary} />
        <Text style={styles.clearText}>{t('contract.clear')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 6 },
  title: { fontSize: 13, color: colors.ink3, marginBottom: 6 },
  canvas: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: { position: 'absolute', fontSize: 12, color: colors.ink3 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  clearText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});