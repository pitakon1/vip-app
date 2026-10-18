/**
 * 关于我们 —— C 端「我的 - 关于我们 / 版权信息」入口的详情页（对齐贝壳）。
 *
 * 展示：应用图标 + 名称 + 标语 → 官方网址 / 客服电话 / 版本号 → 页脚版权与注册号。
 * 全部字段取自公开接口 GET /company/info 的真实值：取不到就不渲染该项，
 * 不写死演示文案、不编造注册号与版权年份；网址可真实打开、电话可真实拨号。
 */
import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { companyApi } from '@/services/api';

interface CompanyInfo {
  name?: string;
  version?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo_url?: string;
  reg_no?: string;
  address?: string;
}

export default function AboutScreen() {
  const { t } = useI18n();
  const [info, setInfo] = React.useState<CompanyInfo>({});

  React.useEffect(() => {
    let alive = true;
    companyApi
      .info()
      .then(({ data }) => {
        const d = (data as any)?.data ?? data;
        if (!alive || !d) return;
        setInfo(d);
      })
      .catch(() => {
        /* 读取失败：相关行不渲染，不伪造内容 */
      });
    return () => {
      alive = false;
    };
  }, []);

  // 网址：补全协议后交给系统浏览器打开；空值时不渲染该行
  const website = (info.website || '').trim();
  const websiteUrl = website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : '';
  // 电话：含数字才可拨号（后端缺省占位「请配置公司电话」不含数字，此时不渲染拨号）
  const phone = (info.phone || '').trim();
  const tel = phone.replace(/[^\d+]/g, '');
  const canCall = tel.replace(/\D/g, '').length > 0;

  const openWebsite = () => {
    WebBrowser.openBrowserAsync(websiteUrl).catch(() => {
      Linking.openURL(websiteUrl).catch(() => undefined);
    });
  };

  const callSupport = () => {
    Linking.openURL(`tel:${tel}`).catch(() => {
      Alert.alert(t('common.hint'), t('profile.callFail'));
    });
  };

  // 图标：优先后端 logo_url，为空回落本地打包图标
  const logoSrc = info.logo_url ? { uri: info.logo_url } : require('../../assets/icon.png');
  const year = new Date().getFullYear();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 品牌区：图标 + 名称 + 标语 */}
      <View style={styles.brand}>
        <Image source={logoSrc} style={styles.logo} resizeMode="cover" />
        <Text style={styles.appName}>{info.name || t('profile.about')}</Text>
        <Text style={styles.slogan}>{t('profile.slogan')}</Text>
      </View>

      {/* 信息列表：网址 / 电话 / 版本号 */}
      <View style={styles.listCard}>
        {websiteUrl ? (
          <TouchableOpacity
            style={[styles.row, styles.rowBorder]}
            activeOpacity={0.7}
            onPress={openWebsite}
            accessibilityRole="link"
            accessibilityLabel={t('profile.website')}
          >
            <Text style={styles.rowLabel}>{t('profile.website')}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {website.replace(/^https?:\/\//i, '')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </TouchableOpacity>
        ) : null}

        {canCall ? (
          <TouchableOpacity
            style={[styles.row, styles.rowBorder]}
            activeOpacity={0.7}
            onPress={callSupport}
            accessibilityRole="button"
            accessibilityLabel={t('profile.hotline')}
          >
            <Text style={styles.rowLabel}>{t('profile.hotline')}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {phone}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </TouchableOpacity>
        ) : null}

        {/* 版本号：只读展示，无箭头 */}
        {info.version ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('profile.versionNo')}</Text>
            <Text style={styles.rowValueRight}>v{info.version}</Text>
          </View>
        ) : null}
      </View>

      {/* 页脚：版权 + 注册号（后端无值则不渲染，不编造） */}
      <View style={styles.footer}>
        {info.name ? (
          <Text style={styles.footerText}>
            {`© ${year} ${info.name} · ${t('profile.copyright')}`}
          </Text>
        ) : null}
        {info.reg_no ? (
          <Text style={styles.footerText}>{`${t('profile.regNo')}：${info.reg_no}`}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 28,
    paddingBottom: 40,
    alignItems: 'stretch',
  },
  brand: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.surface2,
  },
  appName: {
    marginTop: 14,
    fontSize: colors.fontSize.xl,
    fontWeight: '700',
    color: colors.ink,
  },
  slogan: {
    marginTop: 6,
    fontSize: colors.fontSize.base,
    color: colors.ink3,
  },
  listCard: {
    marginHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 8,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    fontSize: colors.fontSize.base,
    color: colors.ink,
    flexShrink: 0,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: colors.fontSize.base,
    color: colors.ink3,
  },
  rowValueRight: {
    flex: 1,
    textAlign: 'right',
    fontSize: colors.fontSize.base,
    color: colors.ink2,
  },
  footer: {
    marginTop: 28,
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 4,
  },
  footerText: {
    fontSize: colors.fontSize.sm,
    color: colors.ink3,
    textAlign: 'center',
  },
});
