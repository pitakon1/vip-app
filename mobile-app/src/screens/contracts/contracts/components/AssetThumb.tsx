/** 资产缩略图：RN 的 <Image> 渲染不了 SVG data URL（历史签名资产就是 svg）。 */
import React from 'react';
import { Image, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

/**
 * 按前缀分流——SVG 走 react-native-svg 的 <SvgXml>，其余（PNG data URL / http）仍走 <Image>。
 */
export default function AssetThumb({ uri, style }: { uri?: string | null; style?: any }) {
  if (!uri) return null;
  if (uri.startsWith('data:image/svg+xml')) {
    const sep = uri.indexOf(',');
    let xml = '';
    if (sep >= 0) {
      try {
        xml = decodeURIComponent(uri.slice(sep + 1));
      } catch {
        xml = '';
      }
    }
    if (!xml) return null;
    return (
      <View style={style}>
        <SvgXml xml={xml} width="100%" height="100%" />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode="contain" />;
}
