import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';

interface RemoteImageProps {
  /** 远端图片地址；为空时直接渲染占位，不发起请求 */
  uri?: string | null;
  /** 与 <Image style> 用法一致 */
  style?: any;
  /** 兼容旧 resizeMode 语义，映射到 expo-image 的 contentFit */
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  /** 占位图标尺寸，跟随容器大小调 */
  iconSize?: number;
  /** 自定义占位（如需要显示文字/骨架屏） */
  fallback?: React.ReactNode;
}

// resizeMode → expo-image contentFit（expo-image 不支持 repeat/center，就近映射）
const FIT_MAP: Record<string, 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
  repeat: 'cover',
};

/**
 * 带加载失败兜底的远端图片（内存 + 磁盘双缓存）。
 *
 * 为什么换成 expo-image：房源图片全部来自外部 URL（业主/经纪人上传、第三方图床），
 * 列表滚动时 RN 自带 <Image> 每次都要走网络/内存缓存，反复拉取同一批图；
 * expo-image 默认 memory-disk 双缓存 + 模糊占位过渡，滚动浏览房源图几乎零重复下载。
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
      contentFit={FIT_MAP[resizeMode] ?? 'cover'}
      cachePolicy="memory-disk"
      transition={150}
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
