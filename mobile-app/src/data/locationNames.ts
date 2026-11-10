/**
 * 城市 / 国家 / 地铁线的三语名称覆盖层。
 *
 * 背景：`locationArea.ts` / `locationMetro.ts` 的 `cityLabel`、`country`、`name`
 * 同时承担「展示名」和「身份值」两种职责——后端参数（region / city）、
 * 组件间的筛选比对（如 PropertiesScreen 用 `cityLabel === region.city`）都依赖中文原值。
 *
 * 因此这里不改原数据字段，而是按稳定 key（cityKey / 中文国家名 / 地铁线 key）
 * 提供 en / th 译名：展示走本模块，请求与比对继续用原中文值，两者分开。
 * 中文名直接沿用原字段，避免双份维护产生漂移。
 */
import type { AppLang } from '@/i18n';
import type { CityGroup } from '@/data/locationArea';

type Localized = { en: string; th: string };

/** 城市译名（key = cityKey；中文名沿用 cityLabel） */
const CITY_NAMES: Record<string, Localized> = {
  bangkok: { en: 'Bangkok', th: 'กรุงเทพฯ' },
  phuket: { en: 'Phuket', th: 'ภูเก็ต' },
  kohSamui: { en: 'Koh Samui', th: 'เกาะสมุย' },
  krabi: { en: 'Krabi', th: 'กระบี่' },
  chiangMai: { en: 'Chiang Mai', th: 'เชียงใหม่' },
  pattaya: { en: 'Pattaya', th: 'พัทยา' },
  huaHin: { en: 'Hua Hin', th: 'หัวหิน' },
  hoChiMinh: { en: 'Ho Chi Minh City', th: 'นครโฮจิมินห์' },
  hanoi: { en: 'Hanoi', th: 'ฮานอย' },
  daNang: { en: 'Da Nang', th: 'ดานัง' },
  nhaTrang: { en: 'Nha Trang', th: 'ญาจาง' },
  phuQuoc: { en: 'Phu Quoc', th: 'ฟูก๊วก' },
  kualaLumpur: { en: 'Kuala Lumpur', th: 'กัวลาลัมเปอร์' },
  penang: { en: 'Penang', th: 'ปีนัง' },
  johorBahru: { en: 'Johor Bahru', th: 'ยะโฮร์บาห์รู' },
  melaka: { en: 'Malacca', th: 'มะละกา' },
  kotaKinabalu: { en: 'Kota Kinabalu', th: 'โกตากีนาบาลู' },
  kuching: { en: 'Kuching', th: 'กูชิง' },
  singapore: { en: 'Singapore', th: 'สิงคโปร์' },
  jakarta: { en: 'Jakarta', th: 'จาการ์ตา' },
  bali: { en: 'Bali', th: 'บาหลี' },
  surabaya: { en: 'Surabaya', th: 'สุราบายา' },
  bandung: { en: 'Bandung', th: 'บันดุง' },
  lombok: { en: 'Lombok', th: 'ลอมบอก' },
  metroManila: { en: 'Metro Manila', th: 'เมโทรมะนิลา' },
  cebu: { en: 'Cebu', th: 'เซบู' },
  davao: { en: 'Davao', th: 'ดาเวา' },
  clark: { en: 'Clark · Angeles', th: 'คลาร์ก · แองเจเลส' },
  baguio: { en: 'Baguio', th: 'บาเกียว' },
  phnomPenh: { en: 'Phnom Penh', th: 'พนมเปญ' },
  siemReap: { en: 'Siem Reap', th: 'เสียมราฐ' },
  sihanoukville: { en: 'Sihanoukville', th: 'พระสีหนุ' },
  vientiane: { en: 'Vientiane', th: 'เวียงจันทน์' },
  yangon: { en: 'Yangon', th: 'ย่างกุ้ง' },
};

/** 国家译名（key = 数据里的中文国家名，原值即请求/分组口径） */
const COUNTRY_NAMES: Record<string, Localized> = {
  泰国: { en: 'Thailand', th: 'ประเทศไทย' },
  越南: { en: 'Vietnam', th: 'เวียดนาม' },
  马来西亚: { en: 'Malaysia', th: 'มาเลเซีย' },
  新加坡: { en: 'Singapore', th: 'สิงคโปร์' },
  印尼: { en: 'Indonesia', th: 'อินโดนีเซีย' },
  菲律宾: { en: 'Philippines', th: 'ฟิลิปปินส์' },
  柬埔寨: { en: 'Cambodia', th: 'กัมพูชา' },
  老挝: { en: 'Laos', th: 'ลาว' },
  缅甸: { en: 'Myanmar', th: 'เมียนมา' },
};

/** 地铁线译名（key = 地铁线 key；中文名沿用原 name） */
const LINE_NAMES: Record<string, Localized> = {
  'bts-skm': { en: 'BTS · Sukhumvit Line', th: 'บีทีเอส · สายสุขุมวิท' },
  'bts-sl': { en: 'BTS · Silom Line', th: 'บีทีเอส · สายสีลม' },
  'mrt-blue': { en: 'MRT · Blue Line', th: 'เอ็มอาร์ที · สายสีน้ำเงิน' },
  'mrt-purple': { en: 'MRT · Purple Line', th: 'เอ็มอาร์ที · สายสีม่วง' },
  'mrt-yellow': { en: 'MRT · Yellow Line', th: 'เอ็มอาร์ที · สายสีเหลือง' },
  'mrt-pink': { en: 'MRT · Pink Line', th: 'เอ็มอาร์ที · สายสีชมพู' },
  'srt-red': { en: 'SRT Red Line (Commuter)', th: 'รถไฟชานเมือง สายสีแดง' },
  arl: { en: 'Airport Rail Link', th: 'แอร์พอร์ตเรลลิงก์' },
  'bkk-gold': { en: 'Gold Line · Monorail', th: 'สายสีทอง · โมโนเรล' },
  'kl-lrt-kelana': { en: 'LRT · Kelana Jaya Line', th: 'แอลอาร์ที · สายกลานาจายา' },
  'kl-lrt-ampang': { en: 'LRT · Ampang / Sri Petaling Line', th: 'แอลอาร์ที · สายอัมปัง-ศรีเพตาลิง' },
  'kl-mrt-kajang': { en: 'MRT · Kajang Line', th: 'เอ็มอาร์ที · สายกาจัง' },
  'kl-mrt-putrajaya': { en: 'MRT · Putrajaya Line', th: 'เอ็มอาร์ที · สายปุตราจายา' },
  'kl-monorail': { en: 'KL Monorail', th: 'เคแอล โมโนเรล' },
  'kl-klia': { en: 'KLIA Ekspres', th: 'เคแอลไอเอ เอ็กซ์เพรส' },
  'kl-komuter': { en: 'KTM Komuter', th: 'เคทีเอ็ม คอมมิวเตอร์' },
  'sg-ew': { en: 'MRT · East-West Line (EW)', th: 'เอ็มอาร์ที · สายตะวันออก-ตะวันตก (EW)' },
  'sg-ns': { en: 'MRT · North-South Line (NS)', th: 'เอ็มอาร์ที · สายเหนือ-ใต้ (NS)' },
  'sg-ne': { en: 'MRT · North East Line (NE)', th: 'เอ็มอาร์ที · สายตะวันออกเฉียงเหนือ (NE)' },
  'sg-cc': { en: 'MRT · Circle Line (CC)', th: 'เอ็มอาร์ที · สายวงกลม (CC)' },
  'sg-dt': { en: 'MRT · Downtown Line (DT)', th: 'เอ็มอาร์ที · สายดาวน์ทาวน์ (DT)' },
  'sg-te': { en: 'MRT · Thomson-East Coast Line (TE)', th: 'เอ็มอาร์ที · สายทอมสัน-อีสต์โคสต์ (TE)' },
  'sg-lrt-bp': { en: 'LRT · Bukit Panjang', th: 'แอลอาร์ที · บูกิตปันจัง' },
  'sg-lrt-sk': { en: 'LRT · Sengkang', th: 'แอลอาร์ที · เซ็งกัง' },
  'sg-lrt-pg': { en: 'LRT · Punggol', th: 'แอลอาร์ที · ปุงกล' },
  'jkt-mrt-ns': { en: 'MRT · North-South Line', th: 'เอ็มอาร์ที · สายเหนือ-ใต้' },
  'jkt-lrt': { en: 'LRT · Jakarta LRT', th: 'แอลอาร์ที · จาการ์ตา' },
  'jkt-krl': { en: 'KRL Commuter Line', th: 'เคอาร์แอล คอมมิวเตอร์' },
  'jkt-skytrain': { en: 'Airport Skytrain · Soekarno-Hatta', th: 'สกายเทรน · ซูการ์โน-ฮัตตา' },
  'mnl-lrt1': { en: 'LRT-1 · Light Rail', th: 'แอลอาร์ที-1 · ไลต์เรล' },
  'mnl-lrt2': { en: 'LRT-2 · Purple Line', th: 'แอลอาร์ที-2 · สายสีม่วง' },
  'mnl-mrt3': { en: 'MRT-3 · Loop Line', th: 'เอ็มอาร์ที-3 · สายวงแหวน' },
  'mnl-pnr': { en: 'PNR · Commuter Rail', th: 'พีเอ็นอาร์ · รถไฟชานเมือง' },
  'hanoi-2a': { en: 'Metro Line 2A · Cat Linh–Ha Dong', th: 'เมโทรสาย 2A · กั๊ตลินห์-ห่าดง' },
  'hanoi-3': { en: 'Metro Line 3 · Nhon–Hanoi Station', th: 'เมโทรสาย 3 · ญอน-สถานีฮานอย' },
  'hcm-1': { en: 'Metro Line 1 · Ben Thanh–Suoi Tien', th: 'เมโทรสาย 1 · เบ๊นถั่น-ซ้วยเตี่ยน' },
};

/** 城市展示名：中文直接沿用原值，英/泰取译名，缺失时回退中文 */
export const cityDisplayName = (
  cityKey: string | undefined | null,
  zhLabel: string,
  lang: AppLang,
): string => {
  if (lang === 'zh' || !cityKey) return zhLabel;
  return CITY_NAMES[cityKey]?.[lang] ?? zhLabel;
};

/** 国家展示名：入参为数据里的中文国家原值 */
export const countryDisplayName = (countryZh: string, lang: AppLang): string => {
  if (lang === 'zh' || !countryZh) return countryZh;
  return COUNTRY_NAMES[countryZh]?.[lang] ?? countryZh;
};

/** 地铁线展示名（不含城市前缀） */
export const metroLineDisplayName = (lineKey: string, zhName: string, lang: AppLang): string => {
  if (lang === 'zh') return zhName;
  return LINE_NAMES[lineKey]?.[lang] ?? zhName;
};

/** 地铁线完整展示名：城市 · 线路（兼容静态数据与后端返回的线路对象） */
export const metroLineFullName = (
  line: { key: string; name: string; cityKey?: string; cityLabel?: string },
  lang: AppLang,
): string =>
  `${cityDisplayName(line.cityKey, line.cityLabel ?? '', lang)} · ${metroLineDisplayName(line.key, line.name, lang)}`;

/**
 * 城市搜索别名串（小写）：中文原值 + 英/泰译名 + 国家三语。
 * 保证中文用户输入中文、英文/泰文用户输入各自语言都能命中。
 */
export const citySearchText = (group: CityGroup): string => {
  const city = CITY_NAMES[group.cityKey];
  const country = COUNTRY_NAMES[group.country];
  return [
    group.cityLabel,
    city?.en,
    city?.th,
    group.country,
    country?.en,
    country?.th,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};
