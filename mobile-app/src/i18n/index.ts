import { create } from 'zustand';
import { tokenStorage } from '../lib/storage';

export type AppLang = 'zh' | 'en' | 'th';

export const LANG_LABELS: Record<AppLang, string> = {
  zh: '简体中文',
  en: 'English',
  th: 'ไทย',
};

export const LANGS: AppLang[] = ['zh', 'en', 'th'];

const LANG_STORAGE_KEY = 'app_lang';

interface I18nState {
  lang: AppLang;
  setLang: (lang: AppLang) => void;
  t: (key: string) => string;
}

export const messages: Record<AppLang, Record<string, string>> = {
  zh: {
    'tab.home': '首页',
    'home.leaseInforce': '租约生效中',
    'home.myLease': '我的租约',
    'home.leaseExpiry': '到期',
    'tab.listings': '找房',
    'tab.messages': '消息',
    'tab.profile': '我的',
    'tab.income': '收益',
    'tab.services': '服务',
    'tab.documents': '文档',
    'home.searchPlaceholder': '搜索小区 / 地址找房',
    'home.findRent': '租房',
    'home.viewing': '预约看房',
    'home.mapFind': '地图找房',
    'home.apartment': '公寓',
    'home.office': '写字楼',
    'home.maintenance': '维修',
    'home.pay': '缴费',
    'home.contracts': '我的合同',
    'home.services': '增值服务',
    'home.featured': '精选房源',
    'home.empty': '暂无房源',
    'home.all': '全部',
    'home.noListings': '暂无房源',
    'login.title': 'VIP 租房',
    'login.email': '邮箱',
    'login.password': '密码',
    'login.submit': '登录',
    'profile.docs': '我的文档',
    'profile.contracts': '电子签合同',
    'profile.ai': 'AI 助手',
    'profile.map': '地图找房',
    'profile.attendance': '考勤打卡',
    'profile.attendanceReview': '考勤核对',
    'profile.backup': '数据备份',
    'profile.settings': '设置',
    'profile.language': '语言',
    'profile.testPanel': '测试调试面板',
    'profile.logout': '退出登录',
    'profile.myProperties': '我的房源',
    'profile.income': '收益中心',
    'profile.services': '增值服务',
    'profile.payments': '缴费中心',
    'profile.maintenance': '报修工单',
    'profile.viewings': '预约看房',
    'profile.manageProperties': '房源管理',
    'profile.crm': '客户跟进',
    'profile.performance': '我的业绩',
    'profile.employees': '员工管理',
    'status.vacant': '空置',
    'status.rented': '已出租',
    'status.reserved': '已预订',
    'status.maintenance': '维护中',
    'status.renewing': '正在续约',
    'rent.perMonth': '/月',
  },
  en: {
    'tab.home': 'Home',
    'home.leaseInforce': 'Lease active',
    'home.myLease': 'My Lease',
    'home.leaseExpiry': 'ends',
    'tab.listings': 'Find',
    'tab.messages': 'Messages',
    'tab.profile': 'Me',
    'tab.income': 'Income',
    'tab.services': 'Services',
    'tab.documents': 'Docs',
    'home.searchPlaceholder': 'Search by project / address',
    'home.findRent': 'Rent',
    'home.viewing': 'Book viewing',
    'home.mapFind': 'Map',
    'home.apartment': 'Apartment',
    'home.office': 'Office',
    'home.maintenance': 'Repair',
    'home.pay': 'Pay',
    'home.contracts': 'My contracts',
    'home.services': 'Services',
    'home.featured': 'Featured properties',
    'home.empty': 'No properties',
    'home.all': 'All',
    'home.noListings': 'No properties yet',
    'login.title': 'VIP Rental',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'profile.docs': 'My Documents',
    'profile.contracts': 'E-sign Contracts',
    'profile.ai': 'AI Assistant',
    'profile.map': 'Map Search',
    'profile.attendance': 'Attendance',
    'profile.attendanceReview': 'Attendance Review',
    'profile.backup': 'Data Backup',
    'profile.settings': 'Settings',
    'profile.language': 'Language',
    'profile.testPanel': 'Test Panel',
    'profile.logout': 'Log out',
    'profile.myProperties': 'My Properties',
    'profile.income': 'Income',
    'profile.services': 'Value-added Services',
    'profile.payments': 'Payments',
    'profile.maintenance': 'Maintenance',
    'profile.viewings': 'Viewings',
    'profile.manageProperties': 'Property Management',
    'profile.crm': 'Client Follow-up',
    'profile.performance': 'My Performance',
    'profile.employees': 'Employee Management',
    'status.vacant': 'Vacant',
    'status.rented': 'Rented',
    'status.reserved': 'Reserved',
    'status.maintenance': 'Maintenance',
    'status.renewing': 'Renewing',
    'rent.perMonth': '/mo',
  },
  th: {
    'tab.home': 'หน้าหลัก',
    'tab.listings': 'ค้นหา',
    'tab.messages': 'ข้อความ',
    'home.leaseInforce': 'สัญญาเช่า',
    'home.myLease': 'สัญญาของฉัน',
    'home.leaseExpiry': 'หมดอายุ',
    'tab.profile': 'ฉัน',
    'tab.income': 'รายได้',
    'tab.services': 'บริการ',
    'tab.documents': 'เอกสาร',
    'home.searchPlaceholder': 'ค้นหาโครงการ / ที่อยู่',
    'home.findRent': 'เช่า',
    'home.viewing': 'นัดชมห้อง',
    'home.mapFind': 'แผนที่',
    'home.apartment': 'อพาร์ตเมนต์',
    'home.office': 'ออฟฟิศ',
    'home.maintenance': 'ซ่อมแซม',
    'home.pay': 'ชำระเงิน',
    'home.contracts': 'สัญญาของฉัน',
    'home.services': 'บริการเพิ่มเติม',
    'home.featured': 'อสังหาคัดสรร',
    'home.empty': 'ไม่มีอสังหา',
    'home.all': 'ทั้งหมด',
    'home.noListings': 'ยังไม่มีอสังหา',
    'login.title': 'VIP เช่า',
    'login.email': 'อีเมล',
    'login.password': 'รหัสผ่าน',
    'login.submit': 'เข้าสู่ระบบ',
    'profile.docs': 'เอกสารของฉัน',
    'profile.contracts': 'เซ็นสัญญาอิเล็กทรอนิกส์',
    'profile.ai': 'AI ผู้ช่วย',
    'profile.map': 'ค้นหาด้วยแผนที่',
    'profile.attendance': 'ลงเวลา',
    'profile.attendanceReview': 'ตรวจสอบเวลา',
    'profile.backup': 'สำรองข้อมูล',
    'profile.settings': 'การตั้งค่า',
    'profile.language': 'ภาษา',
    'profile.testPanel': 'แผงทดสอบ',
    'profile.logout': 'ออกจากระบบ',
    'profile.myProperties': 'อสังหาของฉัน',
    'profile.income': 'รายได้',
    'profile.services': 'บริการเสริม',
    'profile.payments': 'ชำระเงิน',
    'profile.maintenance': 'แจ้งซ่อม',
    'profile.viewings': 'นัดดูห้อง',
    'profile.manageProperties': 'จัดการอสังหา',
    'profile.crm': 'ติดตามลูกค้า',
    'profile.performance': 'ผลงานของฉัน',
    'profile.employees': 'จัดการพนักงาน',
    'status.vacant': 'ว่าง',
    'status.rented': 'เช่าแล้ว',
    'status.reserved': 'จองแล้ว',
    'status.maintenance': 'ซ่อมบำรุง',
    'status.renewing': 'ต่อสัญญา',
    'rent.perMonth': '/เดือน',
  },
};

const loadLang = async (): Promise<AppLang> => {
  try {
    const saved = await tokenStorage.get();
    // lang 单独存储于 localStorage 的 app_lang
    if (typeof globalThis.localStorage !== 'undefined') {
      const v = globalThis.localStorage.getItem(LANG_STORAGE_KEY);
      if (v === 'en' || v === 'th' || v === 'zh') return v as AppLang;
    }
  } catch {
    /* ignore */
  }
  return 'zh';
};

export const useI18n = create<I18nState>((set, get) => ({
  lang: 'zh',
  setLang: (lang) => {
    set({ lang });
    try {
      if (typeof globalThis.localStorage !== 'undefined') {
        globalThis.localStorage.setItem(LANG_STORAGE_KEY, lang);
      }
    } catch {
      /* ignore */
    }
  },
  t: (key) => messages[get().lang][key] ?? messages.zh[key] ?? key,
}));

// 应用启动时读取存储的语言
export async function initI18n() {
  const lang = await loadLang();
  useI18n.setState({ lang });
}