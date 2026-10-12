/**
 * 手写签名画布（法大大风格签署）：
 * 手指/鼠标在画布上拖拽绘制，输出一段 SVG 字符串（signature_svg），
 * 由父级随 sign 请求提交。文本走 i18n。
 */
import React, { useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
  /** 嵌入式（如叠在 PDF 签署框内）：画布铺满父容器、隐藏标题与清空按钮 */
  fill?: boolean;
  /** 是否显示「清空」按钮，默认显示；嵌入 PDF 时由父级统一管理可传 false */
  showClear?: boolean;
}

const STROKE_COLORS = [colors.primary, colors.error, colors.success];

const toSvg = (strokes: Point[][], widths: number[], w: number, h: number) => {
  if (!strokes.length) return '';
  const paths: string[] = [];
  strokes.forEach((pts, i) => {
    const color = STROKE_COLORS[i % STROKE_COLORS.length];
    const sw = widths[i] ?? 4;
    if (pts.length === 1) {
      paths.push(
        `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="${Math.max(1, sw / 2)}" fill="${color}" stroke="none"/>`,
      );
      return;
    }
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let k = 1; k < pts.length; k++) {
      d += ` L ${pts[k].x} ${pts[k].y}`;
    }
    paths.push(
      `<path d="${d}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`,
    );
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${paths.join('')}</svg>`;
};

export default function SignaturePad({
  onResult,
  title,
  height = 200,
  fill = false,
  showClear = true,
}: Props) {
  const { t } = useI18n();
  const strokesRef = useRef<Point[][]>([]);
  const widthsRef = useRef<number[]>([]);
  // 当前笔速度累计：抬手时折算速度加权线宽（快=细、慢=粗，1~4px）
  const curSpeed = useRef({ dist: 0, count: 0 });
  const sizeRef = useRef({ width: 300, height: 150 });
  const [size, setSize] = useState(sizeRef.current);
  const [version, setVersion] = useState(0);

  const touch = () => setVersion((v) => v + 1);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    if (width > 0 && h > 0) {
      // 动态适配画布尺寸：SVG 以实际渲染宽高为坐标系，保证坐标按 % 换算后不拉伸
      sizeRef.current = { width, height: h };
      setSize(sizeRef.current);
    }
  };

  const penResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        strokesRef.current.push([{ x: locationX, y: locationY }]);
        curSpeed.current = { dist: 0, count: 0 };
        touch();
      },
      onPanResponderMove: (evt: GestureResponderEvent, _s: PanResponderGestureState) => {
        const { locationX, locationY } = evt.nativeEvent;
        const cur = strokesRef.current;
        if (!cur.length) return;
        const last = cur[cur.length - 1];
        const prev = last[last.length - 1];
        curSpeed.current.dist += Math.hypot(locationX - prev.x, locationY - prev.y);
        curSpeed.current.count += 1;
        last.push({ x: locationX, y: locationY });
        touch();
      },
      onPanResponderRelease: () => {
        const { dist, count } = curSpeed.current;
        const avgSpeed = count > 0 ? dist / count : 0;
        const w = Math.min(4, Math.max(1, 4 - avgSpeed * 0.15)); // 快=细、慢=粗
        widthsRef.current.push(w);
      },
    }),
  ).current;

  React.useEffect(() => {
    // 仅在有内容时回传，避免初始空串误清空父级
    if (version > 0) onResult(toSvg(strokesRef.current, widthsRef.current, sizeRef.current.width, sizeRef.current.height));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const strokes = strokesRef.current;

  const undo = () => {
    strokesRef.current.pop();
    widthsRef.current.pop();
    touch();
  };

  const clear = () => {
    strokesRef.current = [];
    widthsRef.current = [];
    touch();
    onResult('');
  };

  return (
    <View style={[styles.wrap, fill && styles.wrapFill]}>
      {!!title && !fill && <Text style={styles.title}>{title}</Text>}
      <View
        {...penResponder.panHandlers}
        onLayout={onLayout}
        style={[styles.canvas, fill && styles.canvasFill, !fill && { height }]}
        collapsable={false}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`}>
          {strokes.map((pts, i) => {
            const color = STROKE_COLORS[i % STROKE_COLORS.length];
            const sw = widthsRef.current[i] ?? 4;
            if (pts.length === 1) {
              return <Circle key={i} cx={pts[0].x} cy={pts[0].y} r={Math.max(1, sw / 2)} fill={color} />;
            }
            let d = `M ${pts[0].x} ${pts[0].y}`;
            for (let k = 1; k < pts.length; k++) d += ` L ${pts[k].x} ${pts[k].y}`;
            return (
              <Path key={i} d={d} stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none" />
            );
          })}
        </Svg>
        {strokes.length === 0 ? <Text style={styles.hint}>{t('contract.signHere')}</Text> : null}
      </View>
      {showClear && !fill && (
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.ghostBtn, !strokes.length && styles.ghostBtnDisabled]}
            activeOpacity={0.85}
            onPress={undo}
            disabled={!strokes.length}
          >
            <Ionicons name="arrow-undo-outline" size={15} color={colors.primary} />
            <Text style={[styles.ghostText, !strokes.length && styles.ghostTextDisabled]}>
              {t('contract.undoSign')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} activeOpacity={0.85} onPress={clear}>
            <Ionicons name="refresh-outline" size={15} color={colors.primary} />
            <Text style={styles.ghostText}>{t('contract.clear')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 6 },
  wrapFill: { flex: 1 },
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
  canvasFill: { flex: 1 },
  hint: { position: 'absolute', fontSize: 12, color: colors.ink3 },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  ghostBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  ghostBtnDisabled: {
    borderColor: colors.line,
  },
  ghostText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  ghostTextDisabled: { color: colors.ink3 },
});