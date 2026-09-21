import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/stores/auth';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { useI18n, LANG_LABELS } from '@/i18n';
import { useUserCapabilities } from '@/hooks/useUserCapabilities';
import { authApi, chatApi } from '@/services/api';
import type { UserRole } from '@/types';

// 从本地 uri 推断图片扩展名（expo image-picker 未必给 fileName）
const _extFromUri = (uri: string) => {
  const m = /\.(jpe?g|png|webp|gif)(\?|#|$)/i.exec(uri);
  return m ? `.${m[1].toLowerCase()}` : '.jpg';
};

const roleLabels: Record<UserRole, string> = {
  owner: '业主',
  tenant: '租客',
  agent: '经纪人',
  employee: '员工',
  admin: '管理员',
};

interface FuncEntry {
  key: string;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  navigate: string;
  /** 使用条件文案（无该能力时展示，告诉用户满足什么条件即可使用） */
  needKey?: string;
}

// 各角色「我的」常用功能（路由必须已在 RootNavigator 注册；业主/租客走统一的 C_FUNC_GRID，不在此重复）
const FUNC_BY_ROLE: Partial<Record<UserRole, FuncEntry[]>> = {
  // 经纪/员工：销售工作台（客户/业绩已是 Tab，不再重复；通讯录收进「我的」）
  agent: [
    { key: 'contacts', labelKey: 'profile.contacts', icon: 'people', navigate: 'Contacts' },
    { key: 'attendance', labelKey: 'profile.attendance', icon: 'location', navigate: 'Attendance' },
    { key: 'properties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'EmployeeProperties' },
    { key: 'myListings', labelKey: 'profile.myListings', icon: 'list', navigate: 'MyListings' },
    { key: 'brokerAgreement', labelKey: 'profile.brokerAgreement', icon: 'document-text', navigate: 'BrokerAgreement' },
  ],
  employee: [
    { key: 'contacts', labelKey: 'profile.contacts', icon: 'people', navigate: 'Contacts' },
    { key: 'attendance', labelKey: 'profile.attendance', icon: 'location', navigate: 'Attendance' },
    { key: 'properties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'EmployeeProperties' },
    { key: 'myListings', labelKey: 'profile.myListings', icon: 'list', navigate: 'MyListings' },
  ],
  // 管理员：对齐管理端设置原型（员工管理入口；不含考勤与聊天）
  admin: [
    { key: 'employees', labelKey: 'profile.employees', icon: 'people', navigate: 'AdminUsers' },
    { key: 'myListings', labelKey: 'profile.myListings', icon: 'list', navigate: 'MyListings' },
  ],
};

// 手机号 / 邮箱掩码（对齐 admin-mobile-settings.html 展示格式，如 138****8888 / a***@rentflow.com）
const maskPhone = (p?: string) =>
  p && p.length >= 7 ? `${p.slice(0, 3)}****${p.slice(-4)}` : p;
const maskEmail = (e?: string) => {
  if (!e || !e.includes('@')) return e;
  const [u, d] = e.split('@');
  const head = u ? `${u.slice(0, 1)}${'*'.repeat(Math.max(u.length - 1, 1))}` : '';
  return `${head}@${d}`;
};

// 管理端「我的」设置列表项（对齐 admin-mobile-settings.html 区块）
// 后端无对应的编辑接口时，点击统一提示「暂未开放」；value 仅展示不可编辑
interface SettingItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  color: string;
  bg: string;
  /** 语言行：打开语言切换弹层 */
  openLang?: boolean;
  /** 跳转已注册导航路由 */
  route?: string;
  /** 高亮强调值（如「已开启」用成功绿） */
  valueTone?: 'success';
}

const APP_COMPANY = 'HaoFang.World';
const APP_VERSION = 'v2.4.1';

// C 端（业主+租客）统一「常用功能」宫格：把业主与租客的全部入口放进同一个宫格。
// 宫格对所有人完全一致，不按角色隐藏；点开无该能力的项时进入「功能暂未开放」空态页。
const C_FUNC_GRID: Array<FuncEntry & { cap: 'owner' | 'tenant' | 'both' }> = [
  // 业主能力项（业主 = 在平台上添加了房源；委托挂牌并入房源管理内）
  { key: 'manageProperties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'OwnerProperties', cap: 'owner', needKey: 'profile.needManageProperties' },
  { key: 'incomeDetail', labelKey: 'profile.incomeDetail', icon: 'trending-up', navigate: 'OwnerIncome', cap: 'owner', needKey: 'profile.needIncomeDetail' },
  // 租客能力项（租客 = 在平台上租了房子）
  { key: 'myLeases', labelKey: 'home.myLease', icon: 'document-text', navigate: 'MyLease', cap: 'tenant', needKey: 'profile.needLeases' },
  { key: 'myDeals', labelKey: 'profile.myDeals', icon: 'receipt', navigate: 'MyOrders', cap: 'tenant', needKey: 'profile.needDeals' },
  { key: 'payments', labelKey: 'profile.payments', icon: 'card', navigate: 'Payments', cap: 'tenant', needKey: 'profile.needPayments' },
  { key: 'maintenance', labelKey: 'profile.maintenance', icon: 'build', navigate: 'TenantMaintenance', cap: 'tenant', needKey: 'profile.needMaintenance' },
  { key: 'services', labelKey: 'profile.services', icon: 'sparkles', navigate: 'TenantServices', cap: 'tenant', needKey: 'profile.needServices' },
  // 通用能力项（文档中心：租客与业主的租房文档/我的文档合并）
  { key: 'documents', labelKey: 'profile.docs', icon: 'folder-open', navigate: 'Documents', cap: 'both', needKey: 'profile.needDocuments' },
];
// 统一：所有人显示全部入口（不按能力过滤）；能否进入由 useUserCapabilities 判断
const C_FUNC_VISIBLE = () => C_FUNC_GRID;
// 当前用户是否具备某项能力：true 进真页面，false 进「功能暂未开放」空态页
const hasFuncCap = (isOwner: boolean, isTenant: boolean, cap: 'owner' | 'tenant' | 'both') =>
  cap === 'owner' ? isOwner : cap === 'tenant' ? isTenant : isOwner || isTenant;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const setUser = useAuthStore((state) => state.setUser);
  const { lang, t } = useI18n();
  const navigation = useNavigation<any>();

  // 访客态：浏览无需注册；「我的」只做引导（对齐贝壳）
  const isGuest = !user;

  // 身份按「能力」判断而非单一 role：用户可能「既是业主又是租客」，名下房产/生效租约决定区块是否展示，二者可并存。
  const { canManageProperty, isActiveTenant } = useUserCapabilities();
  const isTenant = isActiveTenant;
  const isAdmin = user?.role === 'admin';
  const isOwner = canManageProperty;
  // 员工端：经纪人 / 员工 / 管理员均提供「我的」账户与设置自助区块
  const isStaff = isAdmin || user?.role === 'agent' || user?.role === 'employee';

  // 后端无对应编辑接口的功能，点击统一提示「暂未开放」（不伪造假数据）
  const showNotAvailable = (name: string) => {
    const msg = `「${name}」功能暂未开放`;
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert('暂未开放', msg);
    }
  };

  const handleSettingPress = (item: SettingItem) => {
    if (item.route) {
      navigation.navigate(item.route);
      return;
    }
    if (item.openLang) {
      navigation.navigate('SettingsLanguage');
      return;
    }
    // 「我的」账户/设置自接入对应全屏子页
    if (item.key === 'password') {
      navigation.navigate('ChangePassword');
      return;
    }
    if (item.key === 'phone' || item.key === 'email' || item.key === 'account') {
      navigation.navigate('EditProfile');
      return;
    }
    if (item.key === 'timezone' || item.key === 'notification' || item.key === 'notify') {
      navigation.navigate('NotificationPrefs');
      return;
    }
    showNotAvailable(item.label);
  };

  // 管理端「我的」区块数据（对齐 admin-mobile-settings.html）
  const adminAccountItems: SettingItem[] = [
    { key: 'password', icon: 'lock-closed', label: '修改密码', color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1) },
    {
      key: 'phone',
      icon: 'call',
      label: '绑定手机',
      value: user?.phone ? maskPhone(user.phone) : undefined,
      color: colors.info,
      bg: colors.alpha(colors.infoRgb, 0.1),
    },
    {
      key: 'email',
      icon: 'mail',
      label: '绑定邮箱',
      value: user?.email ? maskEmail(user.email) : undefined,
      color: colors.info,
      bg: colors.alpha(colors.infoRgb, 0.1),
    },
  ];
  const adminSystemItems: SettingItem[] = [
    { key: 'language', icon: 'globe', label: '语言', value: lang === 'en' ? 'English' : lang === 'th' ? 'ไทย' : '中文', openLang: true, color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1) },
    { key: 'timezone', icon: 'time', label: '时区', value: 'UTC+8', color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1) },
    { key: 'notification', icon: 'notifications', label: '通知设置', value: '邮件 · 短信 · 推送', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1) },
  ];
  const adminBusinessItems: SettingItem[] = [
    { key: 'commission', icon: 'settings', label: '佣金设置', color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1), route: 'CommissionRules' },
    { key: 'rent-reminder', icon: 'calendar', label: '租金提醒天数', value: '7 天前', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1) },
    { key: 'lease-reminder', icon: 'document-text', label: '合同到期提醒', value: '30 天前', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
    { key: 'auto-dunning', icon: 'refresh', label: '自动催缴', value: '已开启', valueTone: 'success', color: colors.success, bg: colors.alpha(colors.successRgb, 0.1) },
  ];
  const adminAboutItems: SettingItem[] = [
    { key: 'version', icon: 'information-circle', label: '版本信息', value: APP_VERSION, color: colors.ink2, bg: colors.surface2 },
    { key: 'terms', icon: 'document-text', label: '用户协议', color: colors.ink2, bg: colors.surface2 },
    { key: 'privacy', icon: 'shield-checkmark', label: '隐私政策', color: colors.ink2, bg: colors.surface2 },
  ];

  const handleLogout = () => {
    const doLogout = () => logout();
    // react-native-web 下 Alert.alert 是空实现，需用浏览器原生 confirm
    if (Platform.OS === 'web') {
      if (window.confirm('确定要退出登录吗？')) {
        doLogout();
      }
      return;
    }
    Alert.alert('退出登录', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定', style: 'destructive', onPress: doLogout },
    ]);
  };

  const currentLang = LANG_LABELS[lang];

  // 业主「设置」五项（对齐 owner-mobile-settings.html；无接口的项点击提示暂未开放）
  const ownerSettingItems: SettingItem[] = [
    {
      key: 'account',
      icon: 'lock-closed',
      label: t('profile.account'),
      value: user?.phone ? maskPhone(user.phone) : undefined,
      color: colors.ink2,
      bg: colors.surface2,
    },
    {
      key: 'language',
      icon: 'globe',
      label: t('profile.language'),
      value: currentLang,
      openLang: true,
      color: colors.ink2,
      bg: colors.surface2,
    },
    {
      key: 'notify',
      icon: 'notifications',
      label: t('profile.notify'),
      value: t('profile.notifyOn'),
      valueTone: 'success',
      color: colors.ink2,
      bg: colors.surface2,
    },
    {
      key: 'help',
      icon: 'help-circle',
      label: t('profile.help'),
      color: colors.ink2,
      bg: colors.surface2,
    },
    {
      key: 'about',
      icon: 'information-circle',
      label: t('profile.about'),
      value: `${APP_COMPANY} ${APP_VERSION}`,
      color: colors.ink2,
      bg: colors.surface2,
    },
  ];

  // 当前角色的常用功能（员工端用）；C 端 (业主/租客) 走统一的 C_FUNC_VISIBLE 宫格
  const entries =
    user?.role === 'agent' || user?.role === 'employee' ? FUNC_BY_ROLE[user.role] ?? [] : [];
  // C 端统一宫格：所有人显示全部入口（不按角色隐藏）；点开无能力的项进「功能暂未开放」空态页
  const cFuncs = C_FUNC_VISIBLE();

  // 右上角客服入口：未登录点击登录，已登录进入「与平台客服」的 IM 会话
  const openSupport = async () => {
    if (!user) {
      navigation.navigate('Login');
      return;
    }
    try {
      const res = await chatApi.support();
      const conv = Array.isArray(res?.data) ? res.data[0] : res?.data;
      if (!conv?.id) {
        Alert.alert('提示', '客服暂未开通');
        return;
      }
      navigation.navigate('ChatDetail', {
        conversationId: conv.id,
        title: conv.title ?? '平台客服',
      });
    } catch {
      Alert.alert('提示', '客服暂未开通');
    }
  };

  // 点击头像选图并上传：仅已登录可操作，未登录引导登录
  const pickAndUploadAvatar = async () => {
    if (!user) {
      navigation.navigate('Login');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const file = {
        uri: asset.uri,
        name: asset.fileName ?? `avatar${_extFromUri(asset.uri)}`,
        type: asset.mimeType ?? 'image/jpeg',
      } as any;
      const res = await authApi.uploadAvatar(file);
      const updated = res?.data ?? res;
      if (updated && updated.id) {
        setUser(updated);
      } else {
        Alert.alert('提示', '头像上传成功，请稍后刷新查看');
      }
    } catch {
      Alert.alert('提示', '头像上传失败，请重试');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}>
      {/* 顶部浅色目录条：删除「我的」标题，仅保留右上角客服入口（与贝壳一致位于导航栏右上角） */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.supportBtn}
          activeOpacity={0.7}
          onPress={openSupport}
          accessibilityRole="button"
          accessibilityLabel={t('profile.help')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="headset-outline" size={22} color={colors.ink2} />
        </TouchableOpacity>
      </View>

      {/* 用户区：未登录去掉胶囊外壳，登录/注册直接平铺在页面背景上（对齐贝壳） */}
      <View style={isGuest ? styles.guestArea : styles.profileCard}>
        {isGuest ? (
          /* 贝壳式未登录卡：左侧「登录/注册」大字 + 右侧灰色默认头像，整卡点击进登录页 */
          <TouchableOpacity
            style={styles.guestCard}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel={t('pub.loginRegister')}
          >
            <View style={styles.guestInfo}>
              <Text style={styles.guestTitle}>{t('pub.loginRegister')}</Text>
            </View>
            <View style={styles.guestAvatar}>
              <Ionicons name="person-outline" size={28} color={colors.ink3} />
            </View>
          </TouchableOpacity>
        ) : (
          <>
            {/* 已登录头像：点击选图上传；有 avatar_url 显示图片，否则显示首字母 */}
            <TouchableOpacity
              style={styles.avatar}
              activeOpacity={0.8}
              onPress={pickAndUploadAvatar}
              accessibilityRole="button"
              accessibilityLabel={t('profile.editAvatar')}
            >
              {user?.avatar_url ? (
                <Image
                  source={{ uri: user.avatar_url }}
                  style={styles.avatarImg}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.avatarText}>
                  {(user?.name ?? user?.full_name ?? '?').slice(0, 1).toUpperCase()}
                </Text>
              )}
              {/* 更换头像角标：拍照/更换入口提示（登录后点击头像即可更换） */}
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={10} color="#fff" />
              </View>
            </TouchableOpacity>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>
                {user?.name ?? user?.full_name ?? '未知用户'}
              </Text>
              <View style={styles.userMetaRow}>
                <View style={styles.roleTag}>
                  <Text style={styles.roleTagText}>{user ? roleLabels[user.role] : '未登录'}</Text>
                </View>
                {/* 用户卡统一展示掩码手机号（无手机号降级邮箱），与 Web/小程序「我的」用户卡一致 */}
                <Text style={styles.userMeta} numberOfLines={1}>
                  {user?.phone ? maskPhone(user.phone) : user?.email ?? '-'}
                </Text>
              </View>
            </View>
            {isStaff ? (
              <TouchableOpacity
                style={styles.editButton}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('EditProfile')}
              >
                <Ionicons name="create-outline" size={13} color={colors.ink2} />
                <Text style={styles.editButtonText}>编辑资料</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>

      {/* 常用功能宫格（统一：业主入口 + 租客入口共存；按能力过滤，非员工 C 端用户展示） */}
      {!isStaff && cFuncs.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('profile.commonFuncs')}</Text>
          <View style={styles.serviceGrid}>
            {cFuncs.map((entry) => (
              <TouchableOpacity
                key={entry.key}
                style={styles.serviceCell}
                activeOpacity={0.8}
                onPress={() => {
                  // 未登录：宫格项是需登录的动作 → 先登录，登录成功后回到本页继续（对齐贝壳）
                  if (isGuest) {
                    navigation.navigate('Login');
                    return;
                  }
                  const ok = hasFuncCap(isOwner, isTenant, entry.cap);
                  navigation.navigate(
                    ok ? entry.navigate : 'FeatureNotAvailable',
                    ok
                      ? undefined
                      : { feature: t(entry.labelKey), hint: entry.needKey ? t(entry.needKey) : undefined },
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel={t(entry.labelKey)}
              >
                <View style={styles.serviceIcon}>
                  <Ionicons name={entry.icon} size={20} color={colors.primary} />
                </View>
                <Text style={styles.serviceLabel} numberOfLines={1}>
                  {t(entry.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* 管理端「我的」设置区块（对齐 admin-mobile-settings.html） */}
      {isAdmin ? (
        <>
          {/* 账户设置 */}
          <Text style={styles.settingSectionTitle}>账户设置</Text>
          <Card style={styles.settingListCard}>
            {adminAccountItems.map((item, idx) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.settingRow, idx < adminAccountItems.length - 1 && styles.settingRowBorder]}
                onPress={() => handleSettingPress(item)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={16} color={item.color} />
                  </View>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                </View>
                {item.value ? (
                  <Text style={styles.settingValue}>{item.value}</Text>
                ) : null}
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>

          {/* 系统设置 */}
          <Text style={styles.settingSectionTitle}>系统设置</Text>
          <Card style={styles.settingListCard}>
            {adminSystemItems.map((item, idx) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.settingRow, idx < adminSystemItems.length - 1 && styles.settingRowBorder]}
                onPress={() => handleSettingPress(item)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={16} color={item.color} />
                  </View>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                </View>
                {item.value ? (
                  <Text style={styles.settingValue}>{item.value}</Text>
                ) : null}
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>

          {/* 业务设置 */}
          <Text style={styles.settingSectionTitle}>业务设置</Text>
          <Card style={styles.settingListCard}>
            {adminBusinessItems.map((item, idx) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.settingRow, idx < adminBusinessItems.length - 1 && styles.settingRowBorder]}
                onPress={() => handleSettingPress(item)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={16} color={item.color} />
                  </View>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                </View>
                {item.value ? (
                  <Text
                    style={[
                      styles.settingValue,
                      item.valueTone === 'success' && styles.settingValueSuccess,
                    ]}
                  >
                    {item.value}
                  </Text>
                ) : null}
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>

          {/* 员工管理入口 */}
          <TouchableOpacity
            style={styles.employeeEntry}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('AdminUsers')}
          >
            <View style={styles.employeeIcon}>
              <Ionicons name="people" size={18} color={colors.primary} />
            </View>
            <View style={styles.employeeInfo}>
              <Text style={styles.employeeTitle}>员工管理</Text>
              <Text style={styles.employeeDesc}>管理员工账号、角色与权限</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          {/* 关于 */}
          <Text style={styles.settingSectionTitle}>关于</Text>
          <Card style={styles.settingListCard}>
            {adminAboutItems.map((item, idx) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.settingRow, idx < adminAboutItems.length - 1 && styles.settingRowBorder]}
                onPress={() => handleSettingPress(item)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={16} color={item.color} />
                  </View>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                </View>
                {item.value ? (
                  <Text style={styles.settingValue}>{item.value}</Text>
                ) : null}
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </>
      ) : isStaff ? (
        <>
          {/* 常用功能（按角色差异化） */}
          <Card title="常用功能">
            {entries.map((entry, idx) => (
              <TouchableOpacity
                key={entry.key}
                style={[styles.settingRow, idx < entries.length - 1 && styles.settingRowBorder]}
                onPress={() => navigation.navigate(entry.navigate)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.iconBox, { backgroundColor: colors.sidebarActive }]}>
                    <Ionicons name={entry.icon} size={17} color={colors.primary} />
                  </View>
                  <Text style={styles.settingLabel}>{t(entry.labelKey)}</Text>
                </View>
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>

          {/* 账户设置（对齐管理员端「我的」：修改密码/绑定手机/绑定邮箱） */}
          <Text style={styles.settingSectionTitle}>账户设置</Text>
          <Card style={styles.settingListCard}>
            {adminAccountItems.map((item, idx) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.settingRow, idx < adminAccountItems.length - 1 && styles.settingRowBorder]}
                onPress={() => handleSettingPress(item)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={16} color={item.color} />
                  </View>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                </View>
                {item.value ? (
                  <Text style={styles.settingValue}>{item.value}</Text>
                ) : null}
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>

          {/* 系统设置（语言/时区/通知设置） */}
          <Text style={styles.settingSectionTitle}>系统设置</Text>
          <Card style={styles.settingListCard}>
            {adminSystemItems.map((item, idx) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.settingRow, idx < adminSystemItems.length - 1 && styles.settingRowBorder]}
                onPress={() => handleSettingPress(item)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={16} color={item.color} />
                  </View>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                </View>
                {item.value ? (
                  <Text
                    style={[
                      styles.settingValue,
                      item.valueTone === 'success' && styles.settingValueSuccess,
                    ]}
                  >
                    {item.value}
                  </Text>
                ) : null}
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>

          {/* 关于（版本/用户协议/隐私政策） */}
          <Text style={styles.settingSectionTitle}>关于</Text>
          <Card style={styles.settingListCard}>
            {adminAboutItems.map((item, idx) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.settingRow, idx < adminAboutItems.length - 1 && styles.settingRowBorder]}
                onPress={() => handleSettingPress(item)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={16} color={item.color} />
                  </View>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                </View>
                {item.value ? (
                  <Text style={styles.settingValue}>{item.value}</Text>
                ) : null}
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </>
      ) : isGuest ? null : (
        <>
          {/* 设置（租客对齐业主端：账号与安全/语言/通知/帮助/关于；增值服务在「我的服务」宫格，消息在底部 Tab，均不重复） */}
          <Card title={t('profile.settings')}>
            {ownerSettingItems.map((item, idx) => (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.settingRow,
                  idx < ownerSettingItems.length - 1 && styles.settingRowBorder,
                ]}
                onPress={() => handleSettingPress(item)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={16} color={item.color} />
                  </View>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                </View>
                {item.value ? (
                  <Text
                    style={[
                      styles.settingValue,
                      item.valueTone === 'success' && styles.settingValueSuccess,
                    ]}
                  >
                    {item.value}
                  </Text>
                ) : null}
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </>
      )}

      {!isGuest && (
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>
      )}

      {isAdmin && <Text style={styles.footerText}>{`${APP_COMPANY} 管理后台 · ${APP_VERSION}`}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingVertical: 16,
    paddingBottom: 32,
  },

  /* ===== 顶部浅色顶栏（标题 + 右上角客服，对齐贝壳导航栏右上角客服入口） ===== */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topBarTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.02,
  },

  /* ===== 用户区（未登录：直接平铺在页面背景上，无胶囊外壳 —— 对齐贝壳） ===== */
  guestArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },

  /* ===== 用户卡（已登录） ===== */
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.ink3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarText: {
    color: colors.primaryForeground,
    fontSize: 24,
    fontWeight: '700',
  },
  avatarImg: {
    width: 56,
    height: 56,
    borderRadius: colors.radius.full,
  },
  userInfo: {
    marginLeft: 14,
    flex: 1,
    minWidth: 0,
  },
  /* 客服入口：平铺图标（去掉胶囊背景，对齐贝壳顶部图标） */
  supportBtn: {
    padding: 8,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  roleTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: colors.radius.full,
    backgroundColor: colors.sidebarActive,
  },
  roleTagText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  userMeta: {
    fontSize: 13,
    color: colors.ink3,
    flexShrink: 1,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink2,
  },

  /* ===== 访客态（贝壳式：左侧「登录/注册」大字 + 右侧默认头像，整卡可点） ===== */
  guestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    paddingVertical: 4,
  },
  guestAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  guestInfo: {
    flex: 1,
  },
  guestTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
  },

  /* ===== 管理端设置区块（对齐 admin-mobile-settings.html） ===== */
  settingSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
    marginHorizontal: 12,
    marginTop: 18,
    marginBottom: 4,
  },
  settingListCard: {
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  settingIconBox: {
    width: 30,
    height: 30,
    borderRadius: colors.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingValueSuccess: {
    color: colors.success,
    fontWeight: '600',
  },
  employeeEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  employeeIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.md,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  employeeInfo: { flex: 1, minWidth: 0 },
  employeeTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  employeeDesc: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  footerText: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.ink3,
    marginTop: 16,
  },

  /* ===== 我的租约 ===== */
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
    marginHorizontal: 12,
    marginTop: 18,
    marginBottom: 8,
  },

  /* ===== 我的服务宫格（保留胶囊卡片外壳） ===== */
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  serviceCell: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sidebarActive,
  },
  serviceLabel: { fontSize: 12, color: colors.ink2, maxWidth: 72 },

  /* ===== 列表行 ===== */
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  settingRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: colors.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  settingValue: {
    fontSize: 14,
    color: colors.ink2,
    marginRight: 8,
  },
  arrow: {
    fontSize: 20,
    color: colors.ink3,
  },
  logoutButton: {
    backgroundColor: colors.surface,
    marginHorizontal: 12,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: colors.radius.md,
    alignItems: 'center',
  },
  logoutText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
});