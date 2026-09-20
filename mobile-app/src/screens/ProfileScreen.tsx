import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  Platform,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/stores/auth';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import colors from '@/theme/colors';
import {
  authApi,
  leasesApi,
  ownerApi,
  ownersApi,
  propertyDealApi,
  saleListingApi,
} from '@/services/api';
import { useI18n, LANG_LABELS, LANGS, type AppLang } from '@/i18n';
import { fmtMoney as fmtRent } from '@/utils/format';
import type { UserRole } from '@/types';

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
}

// 各角色「我的」常用功能（按角色差异化；路由必须已在 RootNavigator 注册）
const FUNC_BY_ROLE: Record<UserRole, FuncEntry[]> = {
  // 业主：物业文档 / 营销中心（服务在底部 Tab，不重复；付款为租客逻辑，业主不留入口）
  owner: [
    { key: 'documents', labelKey: 'profile.documents', icon: 'document-text', navigate: 'OwnerDocuments' },
    { key: 'marketing', labelKey: 'profile.marketing', icon: 'megaphone', navigate: 'OwnerMarketing' },
  ],
  // 租客：付费/文档/增值服务（对齐租客端原型「常用功能」三项）
  tenant: [
    { key: 'payments', labelKey: 'profile.payments', icon: 'card', navigate: 'Payments' },
    { key: 'documents', labelKey: 'profile.docs', icon: 'folder-open', navigate: 'Documents' },
    { key: 'services', labelKey: 'profile.services', icon: 'sparkles', navigate: 'TenantServices' },
  ],
  // 经纪/员工：销售工作台（客户/业绩已是 Tab，不再重复；通讯录收进「我的」）
  agent: [
    { key: 'contacts', labelKey: 'profile.contacts', icon: 'people', navigate: 'Contacts' },
    { key: 'attendance', labelKey: 'profile.attendance', icon: 'location', navigate: 'Attendance' },
    { key: 'properties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'EmployeeProperties' },
  ],
  employee: [
    { key: 'contacts', labelKey: 'profile.contacts', icon: 'people', navigate: 'Contacts' },
    { key: 'attendance', labelKey: 'profile.attendance', icon: 'location', navigate: 'Attendance' },
    { key: 'properties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'EmployeeProperties' },
  ],
  // 管理员：对齐管理端设置原型（员工管理入口；不含考勤与聊天）
  admin: [
    { key: 'employees', labelKey: 'profile.employees', icon: 'people', navigate: 'AdminUsers' },
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

const DAY_MS = 86400000;
const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-');

// 租客「我的服务」宫格（仅保留已注册路由的入口；消息/客服已在底部 Tab，避免重复入口）
const TENANT_SERVICE_GRID: FuncEntry[] = [
  { key: 'payments', labelKey: 'profile.payments', icon: 'card', navigate: 'Payments' },
  { key: 'maintenance', labelKey: 'profile.maintenance', icon: 'construct', navigate: 'TenantMaintenance' },
  { key: 'services', labelKey: 'profile.services', icon: 'sparkles', navigate: 'TenantServices' },
  { key: 'documents', labelKey: 'profile.docs', icon: 'folder-open', navigate: 'Documents' },
];

// 购房订单状态（PropertyDealStatus）
const DEAL_STATUS: Record<string, { text: string; color: string; bg: string }> = {
  drafted: { text: '洽谈中', color: colors.ink2, bg: colors.surface2 },
  escrow_pending: { text: '定金托管中', color: colors.warning, bg: colors.warningLight },
  signed: { text: '已签约', color: colors.primary, bg: colors.sidebarActive },
  transferring: { text: '过户中', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1) },
  completed: { text: '已完成', color: colors.success, bg: colors.successLight },
  failed: { text: '交易失败', color: colors.error, bg: colors.errorLight },
  cancelled: { text: '已取消', color: colors.ink3, bg: colors.surface2 },
};

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const setUser = useAuthStore((state) => state.setUser);
  const [langVisible, setLangVisible] = useState(false);
  // 租客「我的资产」入口弹层：我的租约 / 我的购房订单（数据仍来自真实接口，收拢后点击弹出简洁摘要）
  const [leaseModalVisible, setLeaseModalVisible] = useState(false);
  const [ordersModalVisible, setOrdersModalVisible] = useState(false);
  const [activeLease, setActiveLease] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  // 业主：名下房源 / 本月实收（真实接口，失败静默降级）
  const [ownerProps, setOwnerProps] = useState<any[]>([]);
  const [ownerAnnual, setOwnerAnnual] = useState<any>(null);
  const [ownerPropsOk, setOwnerPropsOk] = useState(false);
  const { lang, setLang, t } = useI18n();
  const navigation = useNavigation<any>();

  const isTenant = user?.role === 'tenant';
  const isAdmin = user?.role === 'admin';
  const isOwner = user?.role === 'owner';
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
      setLangVisible(true);
      return;
    }
    // 「我的」账户/设置自助接入对应后端接口
    if (item.key === 'password') {
      setPwdVisible(true);
      return;
    }
    if (item.key === 'phone' || item.key === 'email' || item.key === 'account') {
      openEdit();
      return;
    }
    if (item.key === 'timezone' || item.key === 'notification' || item.key === 'notify') {
      openPrefs();
      return;
    }
    showNotAvailable(item.label);
  };

  // ===== 编辑资料 =====
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = () => {
    setEditName(user?.full_name ?? '');
    setEditPhone(user?.phone ?? '');
    setEditEmail(user?.email ?? '');
    setEditVisible(true);
  };

  const saveEdit = async () => {
    if (!editName.trim()) {
      showNotAvailable('请填写姓名');
      return;
    }
    setEditSaving(true);
    try {
      const payload: Record<string, string> = { full_name: editName.trim() };
      if (editPhone !== (user?.phone ?? '')) payload.phone = editPhone.trim();
      if (editEmail !== (user?.email ?? '')) payload.email = editEmail.trim();
      const { data } = await authApi.updateMe(payload);
      setUser({ ...user, ...(data ?? {}) } as any);
      setEditVisible(false);
      showToast('已保存');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      showNotAvailable(typeof detail === 'string' ? detail : '保存失败');
    } finally {
      setEditSaving(false);
    }
  };

  // ===== 修改密码 =====
  const [pwdVisible, setPwdVisible] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const savePassword = async () => {
    if (!oldPwd || !newPwd) {
      showNotAvailable('请填写完整');
      return;
    }
    if (newPwd.length < 6) {
      showNotAvailable('新密码至少 6 位');
      return;
    }
    if (newPwd !== confirmPwd) {
      showNotAvailable('两次输入的新密码不一致');
      return;
    }
    setPwdSaving(true);
    try {
      await authApi.changePassword({ old_password: oldPwd, new_password: newPwd });
      setPwdVisible(false);
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
      // 改密后所有旧令牌失效，建议重新登录
      logout();
      showToast('密码已修改，请重新登录');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      showNotAvailable(typeof detail === 'string' ? detail : '修改失败');
    } finally {
      setPwdSaving(false);
    }
  };

  // ===== 时区 / 通知设置 =====
  const [prefVisible, setPrefVisible] = useState(false);
  const [prefTimezone, setPrefTimezone] = useState('Asia/Bangkok');
  const [prefEmail, setPrefEmail] = useState(true);
  const [prefPush, setPrefPush] = useState(true);
  const [prefSaving, setPrefSaving] = useState(false);

  const openPrefs = async () => {
    setPrefVisible(true);
    try {
      const { data } = await authApi.preferences();
      const p = data ?? {};
      setPrefTimezone(p.timezone || 'Asia/Bangkok');
      setPrefEmail(p.notify_email !== false);
      setPrefPush(p.notify_push !== false);
    } catch {
      /* 读取失败用默认值 */
    }
  };

  const savePrefs = async () => {
    setPrefSaving(true);
    try {
      await authApi.updatePreferences({
        timezone: prefTimezone.trim() || undefined,
        notify_email: prefEmail,
        notify_push: prefPush,
      });
      setPrefVisible(false);
      showToast('已保存');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      showNotAvailable(typeof detail === 'string' ? detail : '保存失败');
    } finally {
      setPrefSaving(false);
    }
  };

  const showToast = (msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert(msg);
    }
  };

  // 常用功能点击：业主「我的房源」进入需带房源 id（OwnerPropertyDetail 依赖 params.id）
  // 名下无房源时降级到业主首页（该页有房源卡片列表），避免落到「房源不存在」空态
  const handleFuncPress = (entry: FuncEntry) => {
    if (entry.navigate === 'OwnerPropertyDetail') {
      const firstId = ownerProps[0]?.id;
      if (!firstId) {
        navigation.navigate('OwnerHome');
        return;
      }
      navigation.navigate('OwnerPropertyDetail', { id: String(firstId) });
      return;
    }
    navigation.navigate(entry.navigate);
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
    { key: 'theme', icon: 'color-palette', label: '主题', value: '浅色', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1) },
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

  // 租客：拉取当前生效租约（用户卡与「我的租约」区块共用同一份真实数据）
  useEffect(() => {
    if (!isTenant) return;
    let alive = true;
    leasesApi
      .mine()
      .then((res: any) => {
        const payload = res?.data;
        const list = Array.isArray(payload) ? payload : payload?.items ?? [];
        const active = (list as any[]).find((l: any) => l?.status === 'active') ?? null;
        if (alive) setActiveLease(active);
      })
      .catch(() => {
        /* 无租约数据不阻塞个人中心 */
      });
    return () => {
      alive = false;
    };
  }, [isTenant]);

  // 租客：我的购房订单（后端 /property-deals 对非管理角色仅返回本人订单）
  useEffect(() => {
    if (!isTenant) return;
    let alive = true;
    Promise.allSettled([
      propertyDealApi.list({ page: 1, page_size: 5 }),
      saleListingApi.list({ page: 1, page_size: 50 }),
    ]).then(([dRes, lRes]) => {
      if (!alive) return;
      const titles: Record<string, string> = {};
      if (lRes.status === 'fulfilled') {
        const d: any = lRes.value?.data;
        const rows = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
        (rows as any[]).forEach((r) => {
          if (r?.id) titles[String(r.id)] = r.title ?? '';
        });
      }
      if (dRes.status === 'fulfilled') {
        const d: any = dRes.value?.data;
        const rows = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
        setDeals(
          (rows as any[]).map((r) => ({
            ...r,
            listing_title: titles[String(r.sale_listing_id ?? '')],
          })),
        );
      } else {
        setDeals([]);
      }
    });
    return () => {
      alive = false;
    };
  }, [isTenant]);

  // 业主：名下房源 / 年度收益汇总（取当月实收）/ 本人账单（待缴口径）
  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    const year = new Date().getFullYear();
    Promise.allSettled([
      ownerApi.properties(),
      ownersApi.annualSummary(year),
    ]).then(([pRes, aRes]) => {
      if (!alive) return;
      const pick = (res: PromiseSettledResult<any>): any[] | null => {
        if (res.status !== 'fulfilled') return null;
        const data = res.value?.data;
        const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
        return Array.isArray(items) ? items : null;
      };
      const props = pick(pRes);
      if (props) {
        setOwnerProps(props);
        setOwnerPropsOk(true);
      }
      if (aRes.status === 'fulfilled') {
        setOwnerAnnual((aRes.value?.data as any) ?? null);
      }
    });
    return () => {
      alive = false;
    };
  }, [isOwner]);

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

  /* ===== 业主用户卡三项指标（真实接口；取不到显示 -） ===== */
  const ownerPropCount = ownerPropsOk ? ownerProps.length : null;
  const ownerRentedCount = ownerPropsOk
    ? ownerProps.filter((p) =>
        ['rented', 'active'].includes(String(p?.status || '').toLowerCase()),
      ).length
    : null;

  // 本月实收：年度汇总里匹配当月的 bucket，无匹配时取最近一个月桶
  const ownerMonthReceived = (() => {
    const buckets: any[] = Array.isArray(ownerAnnual?.by_month) ? ownerAnnual.by_month : [];
    if (!buckets.length) return null;
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const bucket =
      buckets.find((b) => {
        const m = String(b?.month ?? '');
        return (
          m === `${now.getFullYear()}-${mm}` ||
          m === mm ||
          Number(b?.month) === now.getMonth() + 1
        );
      }) ?? buckets[buckets.length - 1];
    return Number(bucket?.received ?? 0);
  })();
  const ownerCurrency =
    ownerAnnual?.currency || ownerProps[0]?.currency || 'THB';

  const numText = (v: number | null, unitKey: string) =>
    v === null ? '-' : `${v} ${t(unitKey)}`;

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

  // 当前角色的常用功能；未登录/未知角色给通用兜底
  const entries = user ? FUNC_BY_ROLE[user.role] ?? FUNC_BY_ROLE.tenant : FUNC_BY_ROLE.tenant;

  // 租约进度（已过天数 / 总天数）
  const startTs = activeLease?.start_date ? new Date(activeLease.start_date).getTime() : 0;
  const endTs = activeLease?.end_date ? new Date(activeLease.end_date).getTime() : 0;
  const totalDays = startTs && endTs > startTs ? Math.round((endTs - startTs) / DAY_MS) : 0;
  const passedDays = startTs
    ? Math.max(0, Math.min(Math.round((Date.now() - startTs) / DAY_MS), totalDays || 0))
    : 0;
  const remainDays = endTs ? Math.max(0, Math.round((endTs - Date.now()) / DAY_MS)) : 0;
  const leaseProgress = totalDays > 0 ? Math.max(0, Math.min(passedDays / totalDays, 1)) : 0;
  const leaseName = activeLease
    ? activeLease.property_name || activeLease.room_number || t('home.myLease')
    : '';

  // 租客「我的资产」入口摘要：租约显示剩余天数 / 生效中 / 暂无；购房订单显示单数
  const leaseSummary = activeLease
    ? remainDays > 0
      ? `${t('profile.remainPrefix')} ${remainDays}${t('profile.dayUnit')}`
      : t('home.leaseInforce')
    : t('profile.noLease');
  const ordersSummary = deals.length
    ? `${deals.length} ${t('profile.ordersUnit')}`
    : t('profile.noOrders');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 用户卡（管理端对齐 admin-mobile-settings.html：公司名 + 编辑资料按钮） */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name ?? user?.full_name ?? '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.name ?? user?.full_name ?? '未知用户'}</Text>
          <View style={styles.userMetaRow}>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>{user ? roleLabels[user.role] : '未登录'}</Text>
            </View>
            {isTenant ? (
              // 租客：头像下展示掩码手机号（无手机号降级邮箱），居住信息由下方租约卡承载
              <Text style={styles.userMeta} numberOfLines={1}>
                {user?.phone ? maskPhone(user.phone) : user?.email ?? '-'}
              </Text>
            ) : (
              <Text style={styles.companyText}>{APP_COMPANY}</Text>
            )}
          </View>
        </View>
        {isStaff && (
          <TouchableOpacity
            style={styles.editButton}
            activeOpacity={0.8}
            onPress={openEdit}
          >
            <Ionicons name="create-outline" size={13} color={colors.ink2} />
            <Text style={styles.editButtonText}>编辑资料</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 用户卡补充：名下房源 / 在租 / 本月实收（仅业主，数据来自真实接口） */}
      {isOwner && (
        <View style={styles.ownerStatsStrip}>
          <View style={styles.ownerStatCol}>
            <Text style={styles.ownerStatLabel}>{t('profile.ownerUnits')}</Text>
            <Text style={styles.ownerStatValue}>{numText(ownerPropCount, 'profile.unitCount')}</Text>
          </View>
          <View style={styles.ownerStatCol}>
            <Text style={styles.ownerStatLabel}>{t('profile.ownerRented')}</Text>
            <Text style={styles.ownerStatValue}>{numText(ownerRentedCount, 'profile.unitCount')}</Text>
          </View>
          <View style={[styles.ownerStatCol, styles.ownerStatColRight]}>
            <Text style={styles.ownerStatLabel}>{t('profile.ownerReceived')}</Text>
            <Text style={styles.ownerStatValue}>
              {ownerMonthReceived === null
                ? '-'
                : fmtRent(ownerMonthReceived, ownerCurrency)}
            </Text>
          </View>
        </View>
      )}

      {/* 用户卡补充：当前租约（仅租客且存在生效租约时） */}
      {isTenant && activeLease && (
        <View style={styles.leaseStrip}>
          <Text style={styles.leaseStripLabel}>{t('home.myLease')}</Text>
          <Text style={styles.leaseStripValue} numberOfLines={1}>{leaseName}</Text>
          <View style={styles.leaseStripBadge}>
            <View style={styles.leaseStripDot} />
            <Text style={styles.leaseStripBadgeText}>{t('home.leaseInforce')}</Text>
          </View>
        </View>
      )}

      {/* 我的资产（仅租客：租约 / 购房订单收成入口，点击弹出简洁摘要，不再铺大卡） */}
      {isTenant && (
        <>
          <Text style={styles.sectionTitle}>{t('profile.myAssets')}</Text>
          <Card style={styles.settingListCard}>
            <TouchableOpacity
              style={[styles.settingRow, styles.settingRowBorder]}
              activeOpacity={0.8}
              onPress={() => setLeaseModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('home.myLease')}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconBox, { backgroundColor: colors.sidebarActive }]}>
                  <Ionicons name="document-text" size={16} color={colors.primary} />
                </View>
                <Text style={styles.settingLabel}>{t('home.myLease')}</Text>
              </View>
              <Text style={styles.settingValue} numberOfLines={1}>{leaseSummary}</Text>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingRow}
              activeOpacity={0.8}
              onPress={() => setOrdersModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('profile.myDeals')}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconBox, { backgroundColor: colors.sidebarActive }]}>
                  <Ionicons name="pricetag" size={16} color={colors.primary} />
                </View>
                <Text style={styles.settingLabel}>{t('profile.myDeals')}</Text>
              </View>
              <Text style={styles.settingValue} numberOfLines={1}>{ordersSummary}</Text>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          </Card>
        </>
      )}

      {/* 我的服务宫格（仅租客，对齐原型） */}
      {isTenant && (
        <>
          <Text style={styles.sectionTitle}>{t('profile.myServices')}</Text>
          <View style={styles.serviceGrid}>
            {TENANT_SERVICE_GRID.map((entry) => (
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
      ) : isOwner ? (
        <>
          {/* 常用功能（业主对齐 owner-mobile-settings.html 五项） */}
          <Card title="常用功能">
            {entries.map((entry, idx) => (
              <TouchableOpacity
                key={entry.key}
                style={[styles.settingRow, idx < entries.length - 1 && styles.settingRowBorder]}
                onPress={() => handleFuncPress(entry)}
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

          {/* 设置（业主对齐原型五项；无接口项点击提示暂未开放） */}
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
      ) : (
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

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>

      {isAdmin && <Text style={styles.footerText}>{`${APP_COMPANY} 管理后台 · ${APP_VERSION}`}</Text>}

      <Modal
        visible={langVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLangVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>选择语言</Text>
            {LANGS.map((id: AppLang) => (
              <TouchableOpacity
                key={id}
                style={styles.langRow}
                onPress={() => {
                  setLang(id);
                  setLangVisible(false);
                }}
              >
                <Text style={styles.langText}>{LANG_LABELS[id]}</Text>
                {lang === id ? <Text style={styles.check}>✓</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* 编辑资料弹层 */}
      <Modal
        visible={editVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>编辑资料</Text>
            <Text style={styles.fieldLabel}>姓名</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="请输入姓名"
              placeholderTextColor={colors.ink3}
            />
            <Text style={styles.fieldLabel}>手机号</Text>
            <TextInput
              style={styles.input}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="请输入手机号"
              placeholderTextColor={colors.ink3}
              keyboardType="phone-pad"
            />
            <Text style={styles.fieldLabel}>邮箱</Text>
            <TextInput
              style={styles.input}
              value={editEmail}
              onChangeText={setEditEmail}
              placeholder="请输入邮箱"
              placeholderTextColor={colors.ink3}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setEditVisible(false)}
              >
                <Text style={styles.sheetCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetConfirm}
                disabled={editSaving}
                onPress={saveEdit}
              >
                <Text style={styles.sheetConfirmText}>{editSaving ? '保存中...' : '保存'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 修改密码弹层 */}
      <Modal
        visible={pwdVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPwdVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>修改密码</Text>
            <Text style={styles.fieldLabel}>当前密码</Text>
            <TextInput
              style={styles.input}
              value={oldPwd}
              onChangeText={setOldPwd}
              placeholder="请输入当前密码"
              placeholderTextColor={colors.ink3}
              secureTextEntry
            />
            <Text style={styles.fieldLabel}>新密码</Text>
            <TextInput
              style={styles.input}
              value={newPwd}
              onChangeText={setNewPwd}
              placeholder="至少 6 位"
              placeholderTextColor={colors.ink3}
              secureTextEntry
            />
            <Text style={styles.fieldLabel}>确认新密码</Text>
            <TextInput
              style={styles.input}
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              placeholder="再次输入新密码"
              placeholderTextColor={colors.ink3}
              secureTextEntry
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setPwdVisible(false)}
              >
                <Text style={styles.sheetCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetConfirm}
                disabled={pwdSaving}
                onPress={savePassword}
              >
                <Text style={styles.sheetConfirmText}>{pwdSaving ? '提交中...' : '确认修改'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 时区 / 通知设置弹层 */}
      <Modal
        visible={prefVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPrefVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>通知设置</Text>
            <Text style={styles.fieldLabel}>时区</Text>
            <TextInput
              style={styles.input}
              value={prefTimezone}
              onChangeText={setPrefTimezone}
              placeholder="如 Asia/Bangkok"
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.prefRow}
              onPress={() => setPrefEmail(!prefEmail)}
            >
              <Text style={styles.prefLabel}>邮件通知</Text>
              <Text style={prefEmail ? styles.check : styles.prefOff}>{prefEmail ? '✓ 开启' : '关闭'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.prefRow}
              onPress={() => setPrefPush(!prefPush)}
            >
              <Text style={styles.prefLabel}>推送通知</Text>
              <Text style={prefPush ? styles.check : styles.prefOff}>{prefPush ? '✓ 开启' : '关闭'}</Text>
            </TouchableOpacity>
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setPrefVisible(false)}
              >
                <Text style={styles.sheetCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetConfirm}
                disabled={prefSaving}
                onPress={savePrefs}
              >
                <Text style={styles.sheetConfirmText}>{prefSaving ? '保存中...' : '保存'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 租客：我的租约摘要弹层（由「我的资产」入口弹出） */}
      <Modal
        visible={leaseModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLeaseModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('home.myLease')}</Text>
            {activeLease ? (
              <View style={styles.leaseCard}>
                <View style={styles.leaseHead}>
                  <Text style={styles.leaseTitle} numberOfLines={1}>{leaseName}</Text>
                  <View style={styles.leaseBadge}>
                    <View style={styles.leaseDot} />
                    <Text style={styles.leaseBadgeText}>{t('home.leaseInforce')}</Text>
                  </View>
                </View>
                <Text style={styles.leaseMeta}>
                  月租金 {fmtRent(activeLease.monthly_rent, activeLease.currency)}
                  {totalDays > 0 ? ` · 已过 ${passedDays} ${t('profile.dayUnit')} / 共 ${totalDays} ${t('profile.dayUnit')}` : ''}
                </Text>
                <View style={styles.leaseTrack}>
                  <View style={[styles.leaseBar, { flex: Math.max(leaseProgress, 0.02) }]} />
                  <View style={{ flex: Math.max(1 - leaseProgress, 0) }} />
                </View>
                <View style={styles.leaseFoot}>
                  <Text style={styles.leaseFootText}>
                    {fmtDate(activeLease.start_date)} 至 {fmtDate(activeLease.end_date)}
                  </Text>
                  {remainDays > 0 ? (
                    <Text style={styles.leaseRemain}>
                      {t('profile.remainPrefix')} {remainDays}{t('profile.dayUnit')}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <EmptyState icon="document-text-outline" title={t('profile.noLease')} sub="签约后在这里查看租期进度与租金" />
            )}
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setLeaseModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t('profile.close')}
              >
                <Text style={styles.sheetCancelText}>{t('profile.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 租客：我的购房订单摘要弹层（由「我的资产」入口弹出） */}
      <Modal
        visible={ordersModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOrdersModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('profile.myDeals')}</Text>
            {deals.length ? (
              <View style={styles.leaseCard}>
                {deals.map((d, idx) => {
                  const meta = DEAL_STATUS[String(d.status ?? '')] ?? DEAL_STATUS.drafted;
                  return (
                    <View
                      key={d.id}
                      style={[styles.dealRow, idx < deals.length - 1 && styles.dealRowBorder]}
                    >
                      <View style={styles.dealLeft}>
                        <Text style={styles.dealTitle} numberOfLines={1}>
                          {d.listing_title || `购房订单 ${String(d.id ?? '').slice(0, 8)}`}
                        </Text>
                        <Text style={styles.dealMeta} numberOfLines={1}>
                          {d.sale_price
                            ? `${fmtRent(d.sale_price, d.currency)} · `
                            : ''}
                          {fmtDate(d.created_at)}
                        </Text>
                      </View>
                      <View style={[styles.dealBadge, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.dealBadgeText, { color: meta.color }]}>{meta.text}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <EmptyState
                icon="pricetag-outline"
                title={t('profile.noOrders')}
                sub="提交看房约谈或认购后在这里跟进进度"
              />
            )}
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setOrdersModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t('profile.close')}
              >
                <Text style={styles.sheetCancelText}>{t('profile.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  /* ===== 用户卡 ===== */
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
  },
  avatarText: {
    color: colors.primaryForeground,
    fontSize: 24,
    fontWeight: '700',
  },
  userInfo: {
    marginLeft: 14,
    flex: 1,
    minWidth: 0,
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
  companyText: {
    fontSize: 13,
    color: colors.ink3,
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

  /* ===== 业主：用户卡三项指标（名下有房源 / 其中在租 / 本月实收） ===== */
  ownerStatsStrip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  ownerStatCol: { minWidth: 0, marginRight: 16 },
  ownerStatColRight: { marginLeft: 'auto', marginRight: 0, alignItems: 'flex-end' },
  ownerStatLabel: { fontSize: 11, color: colors.ink3, marginBottom: 2 },
  ownerStatValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },

  /* ===== 当前租约（用户卡补充） ===== */
  leaseStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  leaseStripLabel: { fontSize: 13, color: colors.ink3 },
  leaseStripValue: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink },
  leaseStripBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leaseStripDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  leaseStripBadgeText: { fontSize: 12, fontWeight: '600', color: colors.success },

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
  leaseCard: {
    marginHorizontal: 12,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  leaseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  leaseTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  leaseBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leaseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  leaseBadgeText: { fontSize: 12, fontWeight: '600', color: colors.success },
  leaseMeta: { fontSize: 13, color: colors.ink2, marginTop: 8 },
  leaseTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: 10,
  },
  leaseBar: { height: 6, borderRadius: colors.radius.full, backgroundColor: colors.primary },
  leaseFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  leaseFootText: { fontSize: 12, color: colors.ink3 },
  leaseRemain: { fontSize: 12, fontWeight: '700', color: colors.primary },

  /* ===== 我的购房订单 ===== */
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
  },
  dealRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dealLeft: { flex: 1, minWidth: 0 },
  dealTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  dealMeta: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  dealBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  dealBadgeText: { fontSize: 11, fontWeight: '600' },

  /* ===== 我的服务宫格 ===== */
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
  overlay: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.4),
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: 20,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  langText: {
    fontSize: 15,
    color: colors.text,
  },
  check: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '600',
  },

  /* ===== 「我的」自助设置弹层 ===== */
  fieldLabel: {
    fontSize: 13,
    color: colors.ink2,
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  sheetCancel: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
  },
  sheetCancelText: {
    fontSize: 15,
    color: colors.ink2,
  },
  sheetConfirm: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
  },
  sheetConfirmText: {
    fontSize: 15,
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  prefLabel: {
    fontSize: 15,
    color: colors.text,
  },
  prefOff: {
    fontSize: 14,
    color: colors.ink3,
  },
});