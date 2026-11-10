/**
 * 筛选下拉面板的统一行为（App 端收口）。
 *
 * 全端「筛选条 + 顶部下拉面板」必须表现一致：
 *  1) 再次点击当前已展开的筛选项 = 收起；点击其他项 = 切到该项面板（usePanelToggle）；
 *  2) 面板展开时点击面板外的空白区 / 列表区 = 收起（PanelBackdrop + usePanelAnchor）。
 *
 * 注意：面板本身由各页面渲染（各页维度差异大），本模块只统一「何时开、何时关」的交互，
 * 避免每个页面各写一套 toggle / 遮罩而互相不一致。
 */
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { View } from 'react-native';

/** 单展开面板的开关：同一 key 再点一次收起。 */
export function usePanelToggle<K extends string>(initial: K | null = null) {
  const [openKey, setOpenKey] = useState<K | null>(initial);
  const toggle = useCallback((key: K) => {
    setOpenKey((prev) => (prev === key ? null : key));
  }, []);
  const close = useCallback(() => setOpenKey(null), []);
  return { openKey, toggle, close, setOpenKey };
}

/**
 * 量出「筛选条 + 已展开面板」的下沿，换算成相对 root 容器的 y。
 *
 * 面板展开/收起都会触发 onLayout，此时面板已完成布局，量到的下沿包含面板高度；
 * 遮罩从该处铺到屏幕底部，因此只覆盖面板以下区域，不会挡住面板内的选项和「重置 / 确定」。
 * root 容器不一定是窗口原点（例如带原生导航头的页面），故用两个 measureInWindow 相减。
 */
export function usePanelAnchor() {
  const rootRef = useRef<View>(null);
  const anchorRef = useRef<View>(null);
  const [top, setTop] = useState(0);

  const measureAnchor = useCallback(() => {
    anchorRef.current?.measureInWindow?.((_x, ay, _w, ah) => {
      rootRef.current?.measureInWindow?.((_rx, ry) => {
        setTop(Math.max(0, Math.round(ay + ah - ry)));
      });
    });
  }, []);

  return { rootRef, anchorRef, backdropTop: top, measureAnchor };
}

/** 面板外点击遮罩：透明、只接管点击，点击即收起面板。 */
export function PanelBackdrop({ top, onClose }: { top: number; onClose: () => void }) {
  return (
    <Pressable
      style={[styles.backdrop, { top }]}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="close"
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
    elevation: 15,
  },
});
