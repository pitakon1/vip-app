import React, { useEffect, useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';

interface RemoteImageProps {
  /** 远端图片地址；为空时直接渲染占位，不发起请求 */
  uri?: string | null;
  /** 与 <Image style> 用法一致 */
  style?: any;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  /** 占位图标尺寸，跟随容器大小调 */
  iconSize?: number;
  /** 自定义占位（如需要显示文字/骨架屏） */
  fallback?: React.ReactNode;
}

/**
 * 带加载失败兜底的远端图片。
 *
 * 为什么需要：房源图片全部来自外部 URL（业主/经纪人上传、第三方图床），
 * 在泰国市场这种"图片挂掉"是常态而非异常。裸 `<Image>` 加载失败时 RN 会留一块
 * 空白（iOS）或半透明空洞，卡片看上去像坏了；有了 onError 兜底至少给一个中性占位。
 *
 * 注意：`broken` 必须随 `uri` 变化复位——列表项复用时（FlatList/重渲染）
 * 换了新 URL 却因为旧 URL 曾经失败而一直显示占位图。
 */
export default function RemoteImage({
  uri,
  style,
  resizeMode = 'cover',
  iconSize = 22,
  fallback,
}: RemoteImageProps) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [uri]);

  if (!uri || broken) {
    if (fallback) return <>{fallback}</>;
    return (
      <View style={[styles.fallback, style]}>
        <Ionicons name="image-outline" size={iconSize} color={colors.ink3} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: String(uri) }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setBroken(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
