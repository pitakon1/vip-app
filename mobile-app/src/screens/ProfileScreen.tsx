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
  Linking,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import * as Application from 'expo-application';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/stores/auth';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { useI18n, LANG_LABELS } from '@/i18n';
import { authApi, chatApi, companyApi } from '@/services/api';
import { clearCache } from '@/lib/cache';
import type { UserRole } from '@/types';

// 从本地 uri 推断图片扩展名（expo image-picker 未必给 fileName）
const _extFromUri = (uri: string) => {
  const m = /\.(jpe?g|png|webp|gif)(\?|#|$)/i.exec(uri);
  return m ? `.${m[1].toLowerCase()}` : '.jpg';
};

interface FuncEntry {
  key: string;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  navigate: string;
}

// 各角色「我的」常用功能（路由必须已在 RootNavigator 注册；业主/租客走统一的 C_FUNC_GRID，不在此重复）
const FUNC_BY_ROLE: Partial<Record<UserRole, FuncEntry[]>> = {
  // 经纪/员工：销售工作台（客户/业绩已是 Tab，不再重复；通讯录收进「我的」）
  agent: [
    { key: 'contacts', labelKey: 'profile.contacts', icon: 'people', navigate: 'Contacts' },
    { key: 'attendance', labelKey: 'profile.attendance', icon: 'location', navigate: 'Attendance' },
    { key: 'manageProperties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'EmployeeProperties' },
    { key: 'brokerAgreement', labelKey: 'profile.brokerAgreement', icon: 'document-text', navigate: 'BrokerAgreement' },
    { key: 'contracts', labelKey: 'profile.contracts', icon: 'document-text', navigate: 'Contracts' },
  ],
  employee: [
    { key: 'contacts', labelKey: 'profile.contacts', icon: 'people', navigate: 'Contacts' },
    { key: 'attendance', labelKey: 'profile.attendance', icon: 'location', navigate: 'Attendance' },
    { key: 'manageProperties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'EmployeeProperties' },
    { key: 'contracts', labelKey: 'profile.contracts', icon: 'document-text', navigate: 'Contracts' },
  ],
  // 管理员：对齐管理端设置原型（员工管理入口；房源管理走 AdminProperties；不含考勤与聊天）
  admin: [
    { key: 'employees', labelKey: 'profile.employees', icon: 'people', navigate: 'AdminUsers' },
    { key: 'manageProperties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'AdminProperties' },
  ],
  // 合作公司管理员：本公司聚合页（成员/绩效/房源）
  partner_admin: [
    { key: 'partnerHub', labelKey: 'partner.title', icon: 'business', navigate: 'PartnerHub' },
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
// 应用商店上架信息：「去评分 / 立即更新」跳转用。
// iOS 的数字 App ID 只有上架 App Store 后才有，届时在 app.json 记下后填到这里；
// 留空时按钮降级为「去应用商店更新」的明确提示（不跳一个打不开的链接）。
const APP_STORE_ID = '';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.vip.rental';

// 语义化版本比较：a > b 返回正数，相等返回 0（用于「检查更新」本地版本 vs 后端版本）
const cmpVersion = (a: string, b: string) => {
  const pa = a.split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
};
// 版本号只认公开接口 GET /company/info 的真实值（与小程序 profile 写法一致）：
// 取不到就留空、由调用处不渲染，不再回落到写死的 'v2.4.1'——那个值与后端版本
// 及 app.json 的 0.1.0 都不符，等于对外报一个不存在的版本号。

// C 端（业主+租客）统一「常用功能」宫格：把业主与租客的全部入口放进同一个宫格。
// 宫格对所有人完全一致，不按角色隐藏、不做能力门槛——登录即可进入任意入口。
const C_FUNC_GRID: FuncEntry[] = [
  // 业主能力项（业主 = 在平台上添加了房源；委托挂牌并入房源管理内）
  { key: 'manageProperties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'OwnerProperties' },
  { key: 'incomeDetail', labelKey: 'profile.incomeDetail', icon: 'trending-up', navigate: 'OwnerIncome' },
  // 租客能力项（租客 = 在平台上租了房子）
  { key: 'myLeases', labelKey: 'home.myLease', icon: 'document-text', navigate: 'MyLease' },
  { key: 'myDeals', labelKey: 'profile.myDeals', icon: 'receipt', navigate: 'MyOrders' },
  { key: 'payments', labelKey: 'profile.payments', icon: 'card', navigate: 'Payments' },
  { key: 'maintenance', labelKey: 'profile.maintenance', icon: 'build', navigate: 'TenantMaintenance' },
  { key: 'services', labelKey: 'profile.services', icon: 'sparkles', navigate: 'TenantServices' },
  // 通用能力项（电子合同签署：租客与业主共用「我的合同」）
  { key: 'myContracts', labelKey: 'profile.contracts', icon: 'document-text', navigate: 'MyContracts' },
  // 通用能力项（文档中心：租客与业主的租房文档/我的文档合并）
  { key: 'documents', labelKey: 'profile.docs', icon: 'folder-open', navigate: 'Documents' },
  // C 端关注/浏览历史：登录即可用（未登录 → 先进 Login）
  { key: 'favorites', labelKey: 'pub.myFollow', icon: 'heart', navigate: 'Favorites' },
  { key: 'history', labelKey: 'pub.myHistory', icon: 'time', navigate: 'History' },
  { key: 'priceAlerts', labelKey: 'pub.priceAlerts', icon: 'notifications', navigate: 'PriceAlerts' },
];

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
  const isAdmin = user?.role === 'admin';
  // 员工端：经纪人 / 员工 / 管理员均提供「我的」账户与设置自助区块
  const isStaff =
    isAdmin || user?.role === 'agent' || user?.role === 'employee' || user?.role === 'partner_admin';
  // 合作公司管理员：本公司管理入口
  const isPartnerAdmin = user?.role === 'partner_admin';

  // 管理端「系统设置 / 业务设置」两区块的真实值。
  // 此前时区写死 'UTC+8'、通知写死 '邮件 · 短信 · 推送'、提醒天数写死 '7/30 天前'，
  // 与后台实际配置完全脱钩（在 Web 改了设置这里也不会变）。
  const [userPrefs, setUserPrefs] = React.useState<{ timezone?: string; email?: boolean; push?: boolean }>({});
  const [business, setBusiness] = React.useState<{
    rent_reminder_days: number;
    lease_reminder_days: number;
    auto_dunning: boolean;
  } | null>(null);
  // 公司名称/版本/联系方式（公开接口）：此前页脚与「关于」写死 'HaoFang.World v2.4.1'
  const [appInfo, setAppInfo] = React.useState<{
    name?: string;
    version?: string;
    phone?: string;
    website?: string;
    email?: string;
    logo_url?: string;
    reg_no?: string;
    address?: string;
  }>({});

  // 回到「我的」时重新拉取（业务设置子页保存后返回能立即看到新值）
  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      companyApi
        .info()
        .then(({ data }) => {
          const info = data?.data ?? data;
          if (!alive || !info) return;
          setAppInfo({
            name: info.name,
            version: info.version,
            phone: info.phone,
            website: info.website,
            email: info.email,
            logo_url: info.logo_url,
            reg_no: info.reg_no,
            address: info.address,
          });
        })
        .catch(() => {
          /* 读取失败则不显示版本号，不伪造版本 */
        });
      if (user) {
        authApi
          .preferences()
          .then(({ data }) => {
            const p = data ?? {};
            if (!alive) return;
            setUserPrefs({
              timezone: p.timezone || '',
              email: p.notify_email !== false,
              push: p.notify_push !== false,
            });
          })
          .catch(() => {
            /* 读取失败保持上一份值 */
          });
      }
      if (isAdmin) {
        companyApi
          .settings()
          .then(({ data }) => {
            const biz = (data?.data ?? data)?.business;
            if (!alive || !biz) return;
            setBusiness({
              rent_reminder_days: Number(biz.rent_reminder_days ?? 7),
              lease_reminder_days: Number(biz.lease_reminder_days ?? 30),
              auto_dunning: biz.auto_dunning !== false,
            });
          })
          .catch(() => {
            /* 读取失败保持上一份值 */
          });
      }
      return () => {
        alive = false;
      };
    }, [user, isAdmin]),
  );

  // 后端无对应编辑接口的功能，点击统一提示「暂未开放」（不伪造假数据）
  const showNotAvailable = (name: string) => {
    const msg = t('profile.notOpenMsg', { name });
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert(t('profile.notOpenTitle'), msg);
    }
  };

  // 仅提示类弹窗（Web 下 Alert 是空实现，改用浏览器原生提示）
  const showInfo = (msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(msg);
      return;
    }
    Alert.alert(t('common.hint'), msg);
  };

  // 跳应用商店（去评分 / 立即更新共用）：iOS 无 App ID 时降级为明确提示
  const openStore = () => {
    const url =
      Platform.OS === 'ios'
        ? APP_STORE_ID
          ? `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}`
          : ''
        : PLAY_STORE_URL;
    if (!url) {
      showInfo(t('profile.rateUnavailable'));
      return;
    }
    Linking.openURL(url).catch(() => showInfo(t('profile.rateUnavailable')));
  };

  // 联系客服：先弹「营业时间 + 呼叫 / 取消」确认层，确认后真实拨号
  const confirmCall = () => {
    const raw = (appInfo.phone || '').trim();
    const tel = raw.replace(/[^\d+]/g, '');
    if (tel.replace(/\D/g, '').length === 0) {
      showInfo(t('profile.phoneUnset'));
      return;
    }
    const call = () =>
      Linking.openURL(`tel:${tel}`).catch(() => showInfo(t('profile.callFail')));
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('profile.serviceHours')}\n${raw}`)) call();
      return;
    }
    Alert.alert(t('profile.serviceHours'), raw, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.callNow'), onPress: call },
    ]);
  };

  // 检查更新：本地安装版本 vs 后端公开接口版本，语义化比对
  const handleCheckUpdate = () => {
    const local = Application.nativeApplicationVersion || '';
    const remote = appInfo.version || '';
    if (!remote) {
      showInfo(t('profile.updateUnavailable'));
      return;
    }
    if (local && cmpVersion(remote, local) <= 0) {
      showInfo(t('profile.upToDate', { v: `v${local}` }));
      return;
    }
    if (!local) {
      // 取不到本地版本（如 Web）：只如实回显后端版本，不假装检测结果
      showInfo(t('profile.upToDate', { v: `v${remote}` }));
      return;
    }
    if (Platform.OS === 'web') {
      if (window.confirm(t('profile.newVersionBody', { v: remote }))) openStore();
      return;
    }
    Alert.alert(t('profile.newVersionTitle'), t('profile.newVersionBody', { v: remote }), [
      { text: t('profile.updateLater'), style: 'cancel' },
      { text: t('profile.updateNow'), onPress: openStore },
    ]);
  };

  // 用户隐私规则：打开后端配置的官网隐私外链（不伪造条款正文；未配置时明确提示）
  const openPrivacy = () => {
    const base = (appInfo.website || '').trim().replace(/\/+$/, '');
    if (!base) {
      showInfo(t('profile.privacyUnset'));
      return;
    }
    const url = /^https?:\/\//i.test(base) ? `${base}/privacy` : `https://${base}/privacy`;
    WebBrowser.openBrowserAsync(url).catch(() => {
      Linking.openURL(url).catch(() => showInfo(t('profile.privacyUnset')));
    });
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
    // 对齐贝壳设置页的真实能力项
    if (item.key === 'permissions') {
      // 系统权限（定位 / 相机 / 通知）只能在系统设置里改；Web 无此能力，给明确提示
      if (Platform.OS === 'web') {
        Alert.alert(t('common.hint'), t('profile.permissionsHint'));
        return;
      }
      Linking.openSettings().catch(() => {
        Alert.alert(t('common.hint'), t('profile.permissionsHint'));
      });
      return;
    }
    if (item.key === 'clearCache') {
      // 只清页面数据缓存（cache: 前缀），不触碰登录态与用户偏好
      clearCache().then(() => Alert.alert(t('common.hint'), t('profile.cacheCleared')));
      return;
    }
    if (item.key === 'checkUpdate') {
      // 真实比对：本地安装版本 vs 后端公开接口版本（有新版给「立即更新」入口）
      handleCheckUpdate();
      return;
    }
    if (item.key === 'contactSupport') {
      // 对齐贝壳：先弹「营业时间 + 呼叫/取消」确认层，再真实拨号
      confirmCall();
      return;
    }
    if (item.key === 'rate') {
      // 去应用商店评分（iOS 未上架时明确提示，不跳无效链接）
      openStore();
      return;
    }
    if (item.key === 'privacyRules') {
      // 用户隐私规则：打开后端配置的官网隐私外链（不伪造条款正文）
      openPrivacy();
      return;
    }
    if (item.key === 'report') {
      // 复用在线客服会话：违规房源与不良信息在此提交
      openSupport();
      return;
    }
    showNotAvailable(item.label);
  };

  const currentLang = LANG_LABELS[lang];
  // 公司名走公开接口实时值；版本号取不到时留空串，调用处据此不渲染（不报假版本）
  const versionLabel = appInfo.version ? `v${appInfo.version}` : '';
  const companyLabel = appInfo.name || APP_COMPANY;
  // 个人通知偏好摘要（真实值：邮件/推送；原写死的「邮件 · 短信 · 推送」并无短信项）
  const notifySummary =
    [
      userPrefs.email !== false ? t('profile.notifyEmail') : '',
      userPrefs.push !== false ? t('profile.notifyPush') : '',
    ]
      .filter(Boolean)
      .join(' · ') || t('profile.notifyAllOff');

  // 管理端「我的」区块数据（对齐 admin-mobile-settings.html）
  const adminAccountItems: SettingItem[] = [
    { key: 'password', icon: 'lock-closed', label: t('profile.changePassword'), color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1) },
    {
      key: 'phone',
      icon: 'call',
      label: t('profile.bindPhone'),
      value: user?.phone ? maskPhone(user.phone) : undefined,
      color: colors.info,
      bg: colors.alpha(colors.infoRgb, 0.1),
    },
    {
      key: 'email',
      icon: 'mail',
      label: t('profile.bindEmail'),
      value: user?.email ? maskEmail(user.email) : undefined,
      color: colors.info,
      bg: colors.alpha(colors.infoRgb, 0.1),
    },
  ];
  const adminSystemItems: SettingItem[] = [
    { key: 'language', icon: 'globe', label: t('profile.language'), value: currentLang, openLang: true, color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1) },
    { key: 'timezone', icon: 'time', label: t('profile.timezone'), value: userPrefs.timezone || undefined, color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1) },
    {
      key: 'notification',
      icon: 'notifications',
      label: t('profile.notifySettings'),
      // 实际只有「邮件 / 推送」两项个人通知偏好（原写死的「邮件 · 短信 · 推送」并不存在短信）
      value: notifySummary,
      color: colors.error,
      bg: colors.alpha(colors.errorRgb, 0.1),
    },
  ];
  const adminBusinessItems: SettingItem[] = [
    { key: 'attendance', icon: 'time-outline', label: t('profile.attendanceManage'), color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1), route: 'AttendanceManage' },
    { key: 'commission', icon: 'settings', label: t('profile.commissionSettings'), color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1), route: 'CommissionRules' },
    { key: 'rent-reminder', icon: 'calendar', label: t('profile.rentReminderDays'), value: t('profile.daysAgo', { n: business?.rent_reminder_days ?? 7 }), color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1), route: 'AdminBusinessSettings' },
    { key: 'lease-reminder', icon: 'document-text', label: t('profile.leaseReminder'), value: t('profile.daysAgo', { n: business?.lease_reminder_days ?? 30 }), color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1), route: 'AdminBusinessSettings' },
    { key: 'auto-dunning', icon: 'refresh', label: t('profile.autoDunning'), value: business?.auto_dunning === false ? t('profile.statusOff') : t('profile.statusOn'), valueTone: business?.auto_dunning === false ? undefined : 'success', color: colors.success, bg: colors.alpha(colors.successRgb, 0.1), route: 'AdminBusinessSettings' },
  ];
  const adminAboutItems: SettingItem[] = [
    { key: 'version', icon: 'information-circle', label: t('profile.versionInfo'), value: versionLabel, color: colors.ink2, bg: colors.surface2 },
    { key: 'terms', icon: 'document-text', label: t('profile.terms'), color: colors.ink2, bg: colors.surface2 },
    { key: 'privacy', icon: 'shield-checkmark', label: t('profile.privacy'), color: colors.ink2, bg: colors.surface2 },
  ];

  const handleLogout = () => {
    const doLogout = () => logout();
    // react-native-web 下 Alert.alert 是空实现，需用浏览器原生 confirm
    if (Platform.OS === 'web') {
      if (window.confirm(t('profile.logoutConfirm'))) {
        doLogout();
      }
      return;
    }
    Alert.alert(t('profile.logoutTitle'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: doLogout },
    ]);
  };

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
      value: notifySummary,
      valueTone: userPrefs.email !== false || userPrefs.push !== false ? 'success' : undefined,
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
    // 联系客服：拨号确认弹层 → 真实拨号（电话取自公开接口 /company/info）
    {
      key: 'contactSupport',
      icon: 'headset-outline',
      label: t('profile.contactSupport'),
      color: colors.ink2,
      bg: colors.surface2,
    },
    // 对齐贝壳设置页：权限设置 / 清理缓存 / 检查更新 / 举报与投诉（均真实可用，非占位）
    {
      key: 'permissions',
      icon: 'shield-checkmark-outline',
      label: t('profile.permissions'),
      color: colors.ink2,
      bg: colors.surface2,
    },
    {
      key: 'clearCache',
      icon: 'trash-outline',
      label: t('profile.clearCache'),
      color: colors.ink2,
      bg: colors.surface2,
    },
    {
      key: 'checkUpdate',
      icon: 'cloud-download-outline',
      label: t('profile.checkUpdate'),
      color: colors.ink2,
      bg: colors.surface2,
    },
    {
      key: 'report',
      icon: 'flag-outline',
      label: t('profile.report'),
      color: colors.ink2,
      bg: colors.surface2,
    },
    // 去评分：跳应用商店（iOS 未上架时明确提示）
    {
      key: 'rate',
      icon: 'star-outline',
      label: t('profile.rate'),
      color: colors.ink2,
      bg: colors.surface2,
    },
    // 用户隐私规则：打开后端配置的官网隐私外链（不伪造条款正文）
    {
      key: 'privacyRules',
      icon: 'document-text-outline',
      label: t('profile.privacyRules'),
      color: colors.ink2,
      bg: colors.surface2,
    },
    {
      key: 'about',
      icon: 'information-circle',
      label: t('profile.about'),
      value: versionLabel ? `${companyLabel} ${versionLabel}` : companyLabel,
      color: colors.ink2,
      bg: colors.surface2,
      route: 'About',
    },
    // 版权信息：复用「关于我们」详情页（页脚即版权与注册号）
    {
      key: 'copyright',
      icon: 'ribbon-outline',
      label: t('profile.copyrightInfo'),
      color: colors.ink2,
      bg: colors.surface2,
      route: 'About',
    },
  ];

  // 当前角色的常用功能（员工端用）；C 端 (业主/租客) 走统一的 C_FUNC_VISIBLE 宫格
  const entries =
    user?.role === 'agent' || user?.role === 'employee' || user?.role === 'partner_admin'
      ? FUNC_BY_ROLE[user.role] ?? []
      : [];
  // C 端统一宫格：所有人显示全部入口（不按角色隐藏），登录即可进入任意入口
  const cFuncs = C_FUNC_GRID;

  // 统一设置行渲染（C 端「我的」为基准样式）：图标盒 + 文案 + 真实值 + 箭头。
  // 业主/租客、员工、管理员三种变体共用同一套行结构，避免各角色样式分叉。
  const renderSettingItem = (item: SettingItem, idx: number, total: number) => (
    <TouchableOpacity
      key={item.key}
      style={[styles.settingRow, idx < total - 1 && styles.settingRowBorder]}
      activeOpacity={0.8}
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
          style={[styles.settingValue, item.valueTone === 'success' && styles.settingValueSuccess]}
        >
          {item.value}
        </Text>
      ) : null}
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

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
        Alert.alert(t('common.hint'), t('profile.supportUnavailable'));
        return;
      }
      navigation.navigate('ChatDetail', {
        conversationId: conv.id,
        title: conv.title ?? t('profile.support'),
      });
    } catch {
      Alert.alert(t('common.hint'), t('profile.supportUnavailable'));
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
        Alert.alert(t('common.hint'), t('profile.avatarOk'));
      }
    } catch {
      Alert.alert(t('common.hint'), t('profile.avatarFail'));
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
                {user?.name ?? user?.full_name ?? t('profile.unknownUser')}
              </Text>
              <View style={styles.userMetaRow}>
                <View style={styles.roleTag}>
                  <Text style={styles.roleTagText}>{user ? t(`perm.role.${user.role}`) : t('profile.notLoggedIn')}</Text>
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
                <Text style={styles.editButtonText}>{t('profile.edit')}</Text>
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
                  // 业主/租客功能一致：登录后无条件进入对应页面，不再做能力门槛
                  navigation.navigate(entry.navigate);
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

      {/* 管理端「我的」设置区块（样式与 C 端「我的」统一：卡片标题 + 标准设置行） */}
      {isAdmin ? (
        <>
          {/* 账户设置 */}
          <Card title={t('profile.sectionAccount')}>
            {adminAccountItems.map((item, idx) =>
              renderSettingItem(item, idx, adminAccountItems.length),
            )}
          </Card>

          {/* 系统设置 */}
          <Card title={t('profile.sectionSystem')}>
            {adminSystemItems.map((item, idx) =>
              renderSettingItem(item, idx, adminSystemItems.length),
            )}
          </Card>

          {/* 业务设置 */}
          <Card title={t('profile.sectionBusiness')}>
            {adminBusinessItems.map((item, idx) =>
              renderSettingItem(item, idx, adminBusinessItems.length),
            )}
          </Card>

          {/* 系统管理：账号管理 + 角色权限（对齐 Web 侧边栏「系统」组） */}
          <Card title={t('acc.sectionSystem')}>
            {renderSettingItem(
              {
                key: 'accounts',
                icon: 'people',
                label: t('acc.title'),
                color: colors.primary,
                bg: colors.sidebarActive,
                route: 'AdminUsers',
              },
              0,
              2,
            )}
            {renderSettingItem(
              {
                key: 'permissions',
                icon: 'key',
                label: t('perm.entry'),
                color: colors.primary,
                bg: colors.sidebarActive,
                route: 'AdminPermissions',
              },
              1,
              5,
            )}
            {renderSettingItem(
              {
                key: 'departments',
                icon: 'git-branch',
                label: t('dept.title'),
                color: colors.primary,
                bg: colors.sidebarActive,
                route: 'AdminDepartments',
              },
              2,
              5,
            )}
            {renderSettingItem(
              {
                key: 'dataScopes',
                icon: 'globe',
                label: t('scope.title'),
                color: colors.primary,
                bg: colors.sidebarActive,
                route: 'AdminDataScopes',
              },
              3,
              5,
            )}
            {renderSettingItem(
              {
                key: 'options',
                icon: 'book',
                label: t('dict.title'),
                color: colors.primary,
                bg: colors.sidebarActive,
                route: 'AdminOptions',
              },
              4,
              5,
            )}
          </Card>

          {/* 合同管理（员工/管理端共用入口，行样式与 C 端一致） */}
          <Card title={t('profile.contractsTitle')}>
            <TouchableOpacity
              style={[styles.settingRow, styles.settingRowBorder]}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Contracts')}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconBox, { backgroundColor: colors.sidebarActive }]}>
                  <Ionicons name="document-text" size={16} color={colors.primary} />
                </View>
                <View style={styles.settingTextCol}>
                  <Text style={styles.settingLabelCol}>{t('profile.contracts')}</Text>
                  <Text style={styles.settingDesc}>{t('contract.entryManageDesc')}</Text>
                </View>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingRow}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('AdminLeases')}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconBox, { backgroundColor: colors.sidebarActive }]}>
                  <Ionicons name="document-text" size={16} color={colors.primary} />
                </View>
                <View style={styles.settingTextCol}>
                  <Text style={styles.settingLabelCol}>{t('profile.leasesManage')}</Text>
                  <Text style={styles.settingDesc}>{t('profile.contractsDesc')}</Text>
                </View>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          </Card>

          {/* 关于 */}
          <Card title={t('profile.sectionAbout')}>
            {adminAboutItems.map((item, idx) =>
              renderSettingItem(item, idx, adminAboutItems.length),
            )}
          </Card>
        </>
      ) : isStaff ? (
        <>
          {/* 常用功能（与 C 端统一：区块标题 + 统一宫格） */}
          <Text style={styles.sectionTitle}>{t('profile.commonFuncs')}</Text>
          <View style={styles.serviceGrid}>
            {entries.map((entry) => (
              <TouchableOpacity
                key={entry.key}
                style={styles.serviceCell}
                activeOpacity={0.8}
                onPress={() => navigation.navigate(entry.navigate)}
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

          {/* 账户设置（修改密码/绑定手机/绑定邮箱） */}
          <Card title={t('profile.sectionAccount')}>
            {adminAccountItems.map((item, idx) =>
              renderSettingItem(item, idx, adminAccountItems.length),
            )}
          </Card>

          {/* 系统设置（语言/时区/通知设置） */}
          <Card title={t('profile.sectionSystem')}>
            {adminSystemItems.map((item, idx) =>
              renderSettingItem(item, idx, adminSystemItems.length),
            )}
          </Card>

          {/* 关于（版本/用户协议/隐私政策） */}
          <Card title={t('profile.sectionAbout')}>
            {adminAboutItems.map((item, idx) =>
              renderSettingItem(item, idx, adminAboutItems.length),
            )}
          </Card>
        </>
      ) : isGuest ? null : (
        <>
          {/* 设置（租客对齐业主端：账号与安全/语言/通知/帮助/关于；增值服务在「我的服务」宫格，消息在底部 Tab，均不重复） */}
          <Card title={t('profile.settings')}>
            {ownerSettingItems.map((item, idx) =>
              renderSettingItem(item, idx, ownerSettingItems.length),
            )}
          </Card>
        </>
      )}

      {!isGuest && (
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>
      )}

      {isAdmin && <Text style={styles.footerText}>{`${companyLabel} ${t('profile.adminConsole')}`}{versionLabel ? ` · ${versionLabel}` : ''}</Text>}
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

  /* ===== 顶部浅色顶栏（仅右上角客服，对齐贝壳导航栏右上角客服入口） ===== */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
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

  /* ===== 设置区块（统一：卡片标题 + 设置行，C 端「我的」为基准样式） ===== */
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
  /* 两行设置项（文案 + 说明）：与单行设置项共用同一行结构与图标盒 */
  settingTextCol: { flex: 1, minWidth: 0 },
  settingLabelCol: { fontSize: 14, color: colors.text },
  settingDesc: { fontSize: 12, color: colors.ink3, marginTop: 2 },
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