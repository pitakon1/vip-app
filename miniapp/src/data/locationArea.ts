// =========================================================
// 共享区域数据（东南亚全部投资国家与城市）——供 Web / App / 小程序 三端统一引用
// 结构：国家 → 城市 → 城区；城区 label 为英文地理名（三语通用），
// kws 为关键词，命中房源 address/title/city/district/area 任一即算匹配。
// 需在 多个端 保持此文件一致；新增城区在此单点维护。
// =========================================================

export interface DistrictNode {
  key: string
  label: string
  kws: string[]
}

export interface CityGroup {
  cityKey: string
  cityLabel: string
  country: string
  children: DistrictNode[]
}

export const AREA_GROUPS: CityGroup[] = [
  // ==================== 泰国 Thailand ====================
  {
    cityKey: 'bangkok',
    cityLabel: '曼谷',
    country: '泰国',
    children: [
      { key: 'sukhumvit', label: 'Sukhumvit', kws: ['sukhumvit', 'sukhumvit soi'] },
      { key: 'asoke-pp', label: 'Asoke · Phrom Phong', kws: ['asoke', 'asok', 'phrom phong', 'phrompong', 'sukhumvit 21', 'sukhumvit 24'] },
      { key: 'thonglo-ekkamai', label: 'Thong Lo · Ekkamai', kws: ['thong lo', 'thonglo', 'thonglor', 'sukhumvit 55', 'ekkamai', 'sukhumvit 63'] },
      { key: 'nana-chitlom', label: 'Nana · Chit Lom', kws: ['nana', 'sukhumvit 4', 'chit lom', 'chitlom', 'ploen chit', 'centralworld'] },
      { key: 'silom-sathorn', label: 'Silom · Sathorn', kws: ['silom', 'sathorn', 'sala daeng', 'si lom', 'patpong'] },
      { key: 'riverside', label: 'Riverside · Bang Rak', kws: ['riverside', 'bang rak', 'charoenkrung', 'si phraya'] },
      { key: 'ari-phahon', label: 'Ari · Phahon Yothin', kws: ['ari', 'phahon yothin', 'phahonyothin'] },
      { key: 'victory-phayathai', label: 'Ratchathewi · Phaya Thai', kws: ['ratchathewi', 'phaya thai', 'victory monument'] },
      { key: 'chatuchak', label: 'Chatuchak · Mo Chit', kws: ['chatuchak', 'mo chit', 'jj market'] },
      { key: 'ladprao', label: 'Ladprao', kws: ['ladprao', 'lat phrao'] },
      { key: 'ratchada-huai', label: 'Ratchada · Huai Khwang', kws: ['ratchada', 'ratchadaphisek', 'huai khwang', 'sutthisan'] },
      { key: 'rama9', label: 'Rama 9 · Ratchada', kws: ['rama 9', 'rama ix', 'phra ram 9', 'ratchada'] },
      { key: 'onnut-bangna', label: 'On Nut · Bang Na', kws: ['on nut', 'bang na', 'bangna', 'phra khanong', 'udom suk', 'bearing', 'samrong'] },
      { key: 'bangkapi-huamak', label: 'Bang Kapi · Hua Mak', kws: ['bang kapi', 'bangkapi', 'hua mak', 'ramkhamhaeng', 'ramintra'] },
      { key: 'makasan-petchaburi', label: 'Makkasan · Phetchaburi', kws: ['makasan', 'phetchaburi', 'pechaburi', 'asoke', 'asok'] },
      { key: 'thonburi', label: 'Thonburi', kws: ['thonburi', 'khlong san', 'bangkok yai', 'wongwian yai', 'taling chan'] },
      { key: 'rangsit-pathum', label: 'Rangsit · Pathum Thani', kws: ['rangsit', 'pathum thani', 'future park'] },
      { key: 'nonthaburi', label: 'Nonthaburi', kws: ['nonthaburi', 'pak kret', 'muang thong thani', 'tiwanon', 'ngam wong wan'] },
      { key: 'bangplee-samutprakarn', label: 'Bang Plee · Samut Prakan', kws: ['bang plee', 'samut prakan', 'suvarnabhumi', 'bang na-trad'] }
    ]
  },
  {
    cityKey: 'phuket',
    cityLabel: '普吉',
    country: '泰国',
    children: [
      { key: 'patong', label: 'Patong · Kathu', kws: ['patong', 'kathu'] },
      { key: 'kata-karon', label: 'Kata · Karon', kws: ['kata', 'karon'] },
      { key: 'rawai', label: 'Rawai', kws: ['rawai'] },
      { key: 'chalong', label: 'Chalong', kws: ['chalong'] },
      { key: 'laguna', label: 'Laguna · Cherngtalay', kws: ['laguna', 'cherngtalay', 'bang tao'] },
      { key: 'kamala-surin', label: 'Kamala · Surin', kws: ['kamala', 'surin', 'bang tao'] },
      { key: 'panwa', label: 'Cape Panwa · Wichit', kws: ['panwa', 'cape panwa', 'wichit'] },
      { key: 'phuket-town', label: 'Phuket Town', kws: ['phuket town', 'phuket city', 'phuket old town', 'sam kong'] },
      { key: 'laiyang-layan', label: 'Lai Yang · Layan', kws: ['lai yang', 'layan'] },
      { key: 'mai-khao', label: 'Mai Khao · Nai Yang', kws: ['mai khao', 'nai yang', 'north phuket'] }
    ]
  },
  {
    cityKey: 'kohSamui',
    cityLabel: '苏梅岛',
    country: '泰国',
    children: [
      { key: 'chaweng', label: 'Chaweng', kws: ['chaweng'] },
      { key: 'lamai', label: 'Lamai', kws: ['lamai'] },
      { key: 'bophut', label: 'Bophut · Fisherman', kws: ['bophut', 'bo phut', 'fisherman', "fisherman's village"] },
      { key: 'choengmon', label: 'Choeng Mon', kws: ['choeng mon', 'choengmon', 'bang rak'] },
      { key: 'maenam', label: 'Maenam', kws: ['maenam'] },
      { key: 'bangpor', label: 'Bang Por · Taling Ngam', kws: ['bang por', 'taling ngam'] }
    ]
  },
  {
    cityKey: 'krabi',
    cityLabel: '甲米',
    country: '泰国',
    children: [
      { key: 'ao-nang', label: 'Ao Nang', kws: ['ao nang', 'aonang'] },
      { key: 'klong-muang', label: 'Klong Muang', kws: ['klong muang'] },
      { key: 'tup-kaek', label: 'Tubkaek · Khlong Prasong', kws: ['tubkaek', 'tup kaek', 'khlong prasong'] },
      { key: 'railey', label: 'Railay', kws: ['railay', 'railey'] },
      { key: 'krabi-town', label: 'Krabi Town', kws: ['krabi town', 'krabi'] }
    ]
  },
  {
    cityKey: 'chiangMai',
    cityLabel: '清迈',
    country: '泰国',
    children: [
      { key: 'nimman', label: 'Nimman', kws: ['nimman', 'suthep'] },
      { key: 'old-city', label: 'Old City · Tha Phae', kws: ['old city', 'tha phae', 'thaphae', 'phra singh', 'wat chedi luang'] },
      { key: 'huay-kaew', label: 'Huay Kaew', kws: ['huay kaew'] },
      { key: 'night-bazaar', label: 'Night Bazaar · Chang Khlan', kws: ['night bazaar', 'chang khlan', 'changklan', 'loi kroh'] },
      { key: 'ping-riverside', label: 'Ping Riverside · Wat Ket', kws: ['ping river', 'riverside', 'wat ket', 'charoenrat'] },
      { key: 'san-sai', label: 'San Sai', kws: ['san sai'] },
      { key: 'hang-dong', label: 'Hang Dong', kws: ['hang dong', 'ban waan'] },
      { key: 'nam-phrae', label: 'Nam Phrae · Doi Saket', kws: ['nam phrae', 'doi saket', 'san kamphaeng', 'sankampaeng'] }
    ]
  },
  {
    cityKey: 'pattaya',
    cityLabel: '芭提雅',
    country: '泰国',
    children: [
      { key: 'pattaya-central', label: 'Central Pattaya', kws: ['pattaya central', 'central pattaya', 'pattaya'] },
      { key: 'jomtien', label: 'Jomtien', kws: ['jomtien'] },
      { key: 'pratumnak', label: 'Pratumnak Hill', kws: ['pratumnak', 'cosy beach'] },
      { key: 'north-pattaya', label: 'North Pattaya · Na Kluea', kws: ['north pattaya', 'na kluea', 'naklua'] },
      { key: 'wong-amat', label: 'Wong Amat', kws: ['wong amat', 'wongamat', 'sriracha'] },
      { key: 'soi-buakhao', label: 'Soi Buakhao', kws: ['soi buakhao', 'buakhao'] },
      { key: 'phra-tamnak', label: 'Phra Tamnak', kws: ['phra tamnak', 'khao phra tamnak'] },
      { key: 'bang-saray', label: 'Bang Saray · Baan Ampur', kws: ['bang saray', 'baan ampur', 'sattahip'] }
    ]
  },
  {
    cityKey: 'huaHin',
    cityLabel: '华欣',
    country: '泰国',
    children: [
      { key: 'huahin-beach', label: 'Hua Hin', kws: ['hua hin', 'huahin'] },
      { key: 'cha-am', label: 'Cha Am', kws: ['cha am', 'chaam'] },
      { key: 'khao-takiab', label: 'Khao Takiab', kws: ['khao takiab', 'takiab'] },
      { key: 'pranburi', label: 'Pranburi', kws: ['pranburi', 'pak nam pran'] },
      { key: 'takiab-soi', label: 'Soi 88 · Takiab', kws: ['soi 88', 'soi 112'] }
    ]
  },
  // ==================== 越南 Vietnam ====================
  {
    cityKey: 'hoChiMinh',
    cityLabel: '胡志明市',
    country: '越南',
    children: [
      { key: 'd1', label: 'District 1 · Ben Thanh', kws: ['district 1', 'quan 1', 'ben thanh', 'dong khoi', 'nguyen hue', 'le loi', 'da kao'] },
      { key: 'd2', label: 'District 2 · Thu Thiem', kws: ['district 2', 'quan 2', 'thu thiem', 'thao dien', 'phu my hung'] },
      { key: 'd3', label: 'District 3', kws: ['district 3', 'quan 3', 'vo van tan'] },
      { key: 'd4', label: 'District 4', kws: ['district 4', 'quan 4', 'ben thuy'] },
      { key: 'd5', label: 'District 5 · Chinatown', kws: ['district 5', 'quan 5', 'cho lon', 'cholon'] },
      { key: 'd6', label: 'District 6', kws: ['district 6', 'quan 6'] },
      { key: 'd7', label: 'District 7 · Phu My Hung', kws: ['district 7', 'quan 7', 'phu my hung', 'phu my', 'tan hung'] },
      { key: 'd8', label: 'District 8', kws: ['district 8', 'quan 8'] },
      { key: 'd9', label: 'District 9', kws: ['district 9', 'quan 9', 'phuoc long'] },
      { key: 'd10', label: 'District 10', kws: ['district 10', 'quan 10'] },
      { key: 'd11', label: 'District 11', kws: ['district 11', 'quan 11'] },
      { key: 'd12', label: 'District 12', kws: ['district 12', 'quan 12'] },
      { key: 'binh-thanh', label: 'Binh Thanh', kws: ['binh thanh', 'vinhomes central park'] },
      { key: 'phu-nhuan', label: 'Phu Nhuan', kws: ['phu nhuan', 'gunny'] },
      { key: 'tan-binh', label: 'Tan Binh · Tan Son Nhat', kws: ['tan binh', 'tan son nhat', 'cong hoa'] },
      { key: 'tan-phu', label: 'Tan Phu', kws: ['tan phu'] },
      { key: 'go-vap', label: 'Go Vap', kws: ['go vap', 'pham van dong'] },
      { key: 'thu-duc', label: 'Thu Duc · High-Tech Park', kws: ['thu duc', 'thu duc city', 'high tech park', 'khu cong nghe cao'] },
      { key: 'nha-be', label: 'Nha Be', kws: ['nha be', 'hiep phuoc'] },
      { key: 'binh-tan', label: 'Binh Tan', kws: ['binh tan', 'an lac'] },
      { key: 'hoc-mon', label: 'Hoc Mon', kws: ['hoc mon'] },
      { key: 'cu-chi', label: 'Cu Chi', kws: ['cu chi'] }
    ]
  },
  {
    cityKey: 'hanoi',
    cityLabel: '河内',
    country: '越南',
    children: [
      { key: 'hoan-kiem', label: 'Hoan Kiem · Old Quarter', kws: ['hoan kiem', 'old quarter', 'ho guom', '36 old', 'tran hung dao'] },
      { key: 'ba-dinh', label: 'Ba Dinh', kws: ['ba dinh', 'lieu giai', 'kim ma'] },
      { key: 'tay-ho', label: 'Tay Ho · West Lake', kws: ['tay ho', 'west lake', 'quang ba', 'xuan dieu'] },
      { key: 'dong-da', label: 'Dong Da', kws: ['dong da', 'cau giay - dong da', 'lang ha'] },
      { key: 'hai-ba-trung', label: 'Hai Ba Trung', kws: ['hai ba trung', 'vinh tuyen', 'bach khoa'] },
      { key: 'cau-giay', label: 'Cau Giay', kws: ['cau giay', 'nhon', 'trung hoa nhan chinh'] },
      { key: 'thanh-xuan', label: 'Thanh Xuan', kws: ['thanh xuan', 'royal city', 'lotus'] },
      { key: 'nam-tu-liem', label: 'Nam Tu Liem', kws: ['nam tu liem', 'golden city', 'me tri', 'mydinh'] },
      { key: 'bac-tu-liem', label: 'Bac Tu Liem', kws: ['bac tu liem', 'nhon', 'cot'] },
      { key: 'long-bien', label: 'Long Bien', kws: ['long bien', 'vinhomes rybica'] },
      { key: 'hoang-mai', label: 'Hoang Mai', kws: ['hoang mai', 'linh dam'] },
      { key: 'ha-dong', label: 'Ha Dong', kws: ['ha dong', 'cat linh', 'van khe'] },
      { key: 'gia-lam', label: 'Gia Lam', kws: ['gia lam', 'duong xa'] },
      { key: 'dong-anh', label: 'Dong Anh', kws: ['dong anh', 'vinhomes ocean park'] }
    ]
  },
  {
    cityKey: 'daNang',
    cityLabel: '岘港',
    country: '越南',
    children: [
      { key: 'hai-chau', label: 'Hai Chau', kws: ['hai chau', 'han river', 'bach dang'] },
      { key: 'son-tra', label: 'Son Tra · My Khe', kws: ['son tra', 'my khe', 'phantrang', 'vo nguyen giap'] },
      { key: 'ngu-hanh-son', label: 'Ngu Hanh Son · Non Nuoc', kws: ['ngu hanh son', 'non nuoc', 'my an', 'dragon bridge south'] },
      { key: 'cam-le', label: 'Cam Le', kws: ['cam le', 'khe my'] },
      { key: 'lien-chieu', label: 'Lien Chieu', kws: ['lien chieu'] },
      { key: 'thuan-phuoc', label: 'Thuan Phuoc', kws: ['thuan phuoc'] },
      { key: 'hoa-vang', label: 'Hoa Vang · Hoiana', kws: ['hoa vang', 'hoiana', 'nam hoi an'] },
      { key: 'da-nang-beach', label: 'Da Nang Beach · Bac My An', kws: ['da nang beach', 'bac my an', 'non nuoc beach'] }
    ]
  },
  {
    cityKey: 'nhaTrang',
    cityLabel: '芽庄',
    country: '越南',
    children: [
      { key: 'nhatrang-central', label: 'Nha Trang Centre', kws: ['nha trang', 'tran phu', 'city centre'] },
      { key: 'cam-ranh', label: 'Cam Ranh · Bai Dai', kws: ['cam ranh', 'bai dai', 'long beach'] },
      { key: 'vinperfect', label: 'Vinpearl · Vinwonders', kws: ['vinpearl', 'vinpearl resort'] },
      { key: 'vin-home', label: 'Vincom · Vinhome', kws: ['vincom', 'vinhome'] }
    ]
  },
  {
    cityKey: 'phuQuoc',
    cityLabel: '富国岛',
    country: '越南',
    children: [
      { key: 'duong-dong', label: 'Duong Dong', kws: ['duong dong', 'night market'] },
      { key: 'truong-beach', label: 'Truong Beach · Long Beach', kws: ['truong beach', 'long beach'] },
      { key: 'ong-lang', label: 'Ong Lang', kws: ['ong lang', 'bai ong lang'] },
      { key: 'hon-thom', label: 'Hon Thom · Sunset Town', kws: ['hon thom', 'sunset town', 'south island'] }
    ]
  },
  // ==================== 马来西亚 Malaysia ====================
  {
    cityKey: 'kualaLumpur',
    cityLabel: '吉隆坡',
    country: '马来西亚',
    children: [
      { key: 'klcc', label: 'KLCC · City Centre', kws: ['klcc', 'kl city centre', 'twin tower', 'ampang park', 'suria klcc'] },
      { key: 'bukit-bintang', label: 'Bukit Bintang · Pavilion', kws: ['bukit bintang', 'pavilion', 'jalan alor', 'changkat', 'trx'] },
      { key: 'bangsar', label: 'Bangsar', kws: ['bangsar', 'bangsar south', 'south bangsar'] },
      { key: 'mont-kiara', label: 'Mont Kiara', kws: ['mont kiara', 'solaris mont kiara'] },
      { key: 'sri-hartamas', label: 'Sri Hartamas · Solaris', kws: ['sri hartamas', 'solaris'] },
      { key: 'cheras', label: 'Cheras', kws: ['cheras', 'taman connaught', 'pandan indah'] },
      { key: 'petaling-jaya', label: 'Petaling Jaya · Damansara', kws: ['petaling jaya', 'damansara', 'kelana jaya', 'pj', 'ss2', 'damansara utama'] },
      { key: 'subang-jaya', label: 'Subang Jaya · USJ', kws: ['subang jaya', 'usj', 'subang permai'] },
      { key: 'ampang', label: 'Ampang · U-Thant', kws: ['ampang', 'u-thant', 'embang'] },
      { key: 'sri-petaling', label: 'Sri Petaling · Bukit Jalil', kws: ['sri petaling', 'bukit jalil', 'salak south'] },
      { key: 'titiwangsa', label: 'Titiwangsa · Chow Kit', kws: ['titiwangsa', 'chow kit', 'medan tuanku'] },
      { key: 'kl-sentral', label: 'KL Sentral · Brickfields', kws: ['kl sentral', 'brickfields'] },
      { key: 'setapak', label: 'Setapak · Wangsa Maju', kws: ['setapak', 'wangsa maju', 'genting klang'] },
      { key: 'kepong', label: 'Kepong · Bandar Menjalara', kws: ['kepong', 'bandar menjalara', 'metropolitan'] },
      { key: 'desa-parkcity', label: 'Desa ParkCity', kws: ['desa parkcity', 'parkcity', 'the waterfront'] },
      { key: 'sentul', label: 'Sentul · Batu', kws: ['sentul', 'batu caves'] },
      { key: 'sunway', label: 'Sunway · Bandar Sunway', kws: ['sunway', 'bandar sunway', 'sunway velocity'] },
      { key: 'cyberjaya', label: 'Cyberjaya · Putrajaya', kws: ['cyberjaya', 'putrajaya', 'presint'] }
    ]
  },
  {
    cityKey: 'penang',
    cityLabel: '槟城',
    country: '马来西亚',
    children: [
      { key: 'george-town', label: 'George Town', kws: ['george town', 'georgetown'] },
      { key: 'tanjung-tokong', label: 'Tanjung Tokong', kws: ['tanjung tokong'] },
      { key: 'batu-ferringhi', label: 'Batu Ferringhi', kws: ['batu ferringhi'] },
      { key: 'tanjung-bungah', label: 'Tanjung Bungah', kws: ['tanjung bungah'] },
      { key: 'gurney', label: 'Gurney Drive', kws: ['gurney', 'gurney plaza'] },
      { key: 'pulau-tikus', label: 'Pulau Tikus', kws: ['pulau tikus', 'new lane'] },
      { key: 'straits-quay', label: 'Straits Quay', kws: ['straits quay', 'seri tanjung pinang'] },
      { key: 'gelugor', label: 'Gelugor · Universiti', kws: ['gelugor', 'universiti sains', 'singapore', 'batu ubah'] },
      { key: 'bayan-baru', label: 'Bayan Baru · Queensbay', kws: ['bayan baru', 'queensbay'] },
      { key: 'bayan-lepas', label: 'Bayan Lepas', kws: ['bayan lepas', 'penang airport'] },
      { key: 'relau', label: 'Relau', kws: ['relau'] },
      { key: 'balik-pulau', label: 'Balik Pulau', kws: ['balik pulau', 'pulau betong', 'teluk kumbar'] },
      { key: 'seberang-perai', label: 'Seberang Perai · Butterworth', kws: ['butterworth', 'seberang perai', 'bukit tengah', 'raja uda'] }
    ]
  },
  {
    cityKey: 'johorBahru',
    cityLabel: '新山',
    country: '马来西亚',
    children: [
      { key: 'jb-city', label: 'Johor Bahru City', kws: ['johor bahru', 'jb city', 'city square'] },
      { key: 'danga-bay', label: 'Danga Bay', kws: ['danga bay'] },
      { key: 'iskandar-puteri', label: 'Iskandar Puteri', kws: ['iskandar puteri', 'medini', 'puteri cove'] },
      { key: 'puteri-harbour', label: 'Puteri Harbour', kws: ['puteri harbour', 'medini'] },
      { key: 'skudai', label: 'Skudai', kws: ['skudai', 'taman universiti'] },
      { key: 'tebrau', label: 'Tebrau · Mount Austin', kws: ['tebrau', 'mount austin', 'setia tropika'] },
      { key: 'senai', label: 'Senai · Kulai', kws: ['senai', 'kulai', 'senai airport'] },
      { key: 'pasir-gudang', label: 'Pasir Gudang', kws: ['pasir gudang'] },
      { key: 'gelang-patah', label: 'Gelang Patah · Forest City', kws: ['gelang patah', 'forest city'] },
      { key: 'desaru', label: 'Desaru', kws: ['desaru', 'desaru coast'] },
      { key: 'kota-tinggi', label: 'Kota Tinggi', kws: ['kota tinggi'] }
    ]
  },
  {
    cityKey: 'melaka',
    cityLabel: '马六甲',
    country: '马来西亚',
    children: [
      { key: 'melaka-raya', label: 'Melaka Raya', kws: ['melaka raya'] },
      { key: 'bandar-hilir', label: 'Bandar Hilir · Jonker', kws: ['bandar hilir', 'jonker', 'jonker walk'] },
      { key: 'ayer-keroh', label: 'Ayer Keroh', kws: ['ayer keroh'] },
      { key: 'kota-laksamana', label: 'Kota Laksamana', kws: ['kota laksamana'] },
      { key: 'klebang', label: 'Klebang', kws: ['klebang'] }
    ]
  },
  {
    cityKey: 'kotaKinabalu',
    cityLabel: '亚庇',
    country: '马来西亚',
    children: [
      { key: 'kk-central', label: 'Kota Kinabalu City', kws: ['kota kinabalu', 'kk city', 'sutera harbour'] },
      { key: 'kk-tanjung-arua', label: 'Tanjung Aru · Tanjung Lipat', kws: ['tanjung aru', 'tanjung lipat'] },
      { key: 'kk-likas', label: 'Likas · Jeluton', kws: ['likas', 'jelutong'] },
      { key: 'kk-inknado', label: 'Inanam · Menggatal', kws: ['inanam', 'menggatal', 'sepanggar'] },
      { key: 'kk-penampang', label: 'Penampang · Donggongon', kws: ['penampang', 'donggongon', 'beverly'] },
      { key: 'kk-putatan', label: 'Putatan', kws: ['putatan', 'likas bay'] }
    ]
  },
  {
    cityKey: 'kuching',
    cityLabel: '古晋',
    country: '马来西亚',
    children: [
      { key: 'kuching-city', label: 'Kuching City', kws: ['kuching', 'city centre', 'waterfront'] },
      { key: 'kuching-north', label: 'North Kuching · Tabuan', kws: ['tabuan', 'tabuan jaya', 'demak'] },
      { key: 'kuching-samarahan', label: 'Samarahan · Serian', kws: ['samarahan', 'kota samarahan'] },
      { key: 'kuching-matang', label: 'Matang · Petra Jaya', kws: ['matang', 'petra jaya', 'batu kawa'] }
    ]
  },
  // ==================== 新加坡 Singapore ====================
  {
    cityKey: 'singapore',
    cityLabel: '新加坡',
    country: '新加坡',
    children: [
      { key: 'downtown', label: 'Downtown · Marina Bay', kws: ['marina bay', 'downtown', 'raffles place', 'marina one', 'marina bay sands'] },
      { key: 'orchard', label: 'Orchard', kws: ['orchard', 'takashimaya', 'ion', '313 somerset', 'orchard road'] },
      { key: 'river-valley', label: 'River Valley · Clarke Quay', kws: ['river valley', 'clarke quay', 'robertson quay', 'kyms yam'] },
      { key: 'bugis', label: 'Bugis · Rochor', kws: ['bugis', 'rochor', 'arab street', 'haji lane'] },
      { key: 'chinatown', label: 'Chinatown · Tanjong Pagar', kws: ['chinatown', 'tanjong pagar', 'telok ayer', 'ann siang', 'keong saik'] },
      { key: 'little-india', label: 'Little India · Farrer Park', kws: ['little india', 'farrer park', 'tekka', 'serangoon road', 'jalan besar'] },
      { key: 'novena', label: 'Novena · Newton · Balestier', kws: ['novena', 'newton', 'balestier', 'whampoa', 'toa payoh'] },
      { key: 'holland', label: 'Holland Village · Buona Vista', kws: ['holland village', 'buona vista', 'one-north', 'port sydney', 'dover'] },
      { key: 'tiong-bahru', label: 'Tiong Bahru · Redhill', kws: ['tiong bahru', 'redhill', 'alexandra', 'kimseng'] },
      { key: 'queenstown', label: 'Queenstown · Commonwealth', kws: ['queenstown', 'commonwealth', 'alexandra', 'ghim moh'] },
      { key: 'clementi', label: 'Clementi', kws: ['clementi', 'west coast', 'doswell', 'pasir panjang'] },
      { key: 'jurong-east', label: 'Jurong East', kws: ['jurong east', 'jurong', 'boon lay', 'jurong point'] },
      { key: 'jurong-west', label: 'Jurong West · Lakeside', kws: ['jurong west', 'lakeside', 'chinese garden'] },
      { key: 'bishan', label: 'Bishan · Ang Mo Kio', kws: ['bishan', 'ang mo kio', 'marymount', 'sin ming'] },
      { key: 'woodlands', label: 'Woodlands', kws: ['woodlands', 'woodlands waterfront'] },
      { key: 'yishun', label: 'Yishun · Khatib', kws: ['yishun', 'khatib', 'sembawang'] },
      { key: 'sembawang', label: 'Sembawang · Canberra', kws: ['sembawang', 'canberra', 'adjack'] },
      { key: 'bedok', label: 'Bedok · Tanah Merah', kws: ['bedok', 'tanah merah', 'kembangan', 'changi business park'] },
      { key: 'tampines', label: 'Tampines', kws: ['tampines', 'our tampines hub'] },
      { key: 'punggol', label: 'Punggol', kws: ['punggol', 'waterway point', 'sengkang'] },
      { key: 'sengkang', label: 'Sengkang · Hougang', kws: ['sengkang', 'hougang', 'compass one', 'kaki bukit'] },
      { key: 'katong', label: 'Katong · Joo Chiat · East Coast', kws: ['katong', 'joo chiat', 'east coast', 'marine parade', 'parkway'] },
      { key: 'sentosa', label: 'Sentosa · HarbourFront', kws: ['sentosa', 'harbourfront', 'vivo city'] },
      { key: 'bukit-timah', label: 'Bukit Timah · Sixth Avenue', kws: ['bukit timah', 'sixth avenue', 'king albert park', 'clamore'] },
      { key: 'bukit-batok', label: 'Bukit Batok · Bukit Gombak', kws: ['bukit batok', 'bukit gombak'] },
      { key: 'changi', label: 'Changi · Expo', kws: ['changi', 'expo', 'changi village', 'tanah merah'] },
      { key: 'pasir-ris', label: 'Pasir Ris · Tampines', kws: ['pasir ris', 'white sands'] }
    ]
  },
  // ==================== 印度尼西亚 Indonesia ====================
  {
    cityKey: 'jakarta',
    cityLabel: '雅加达',
    country: '印尼',
    children: [
      { key: 'sudirman', label: 'Sudirman · SCBD', kws: ['sudirman', 'scbd', 'jenderal sudirman', 'mega kuningan'] },
      { key: 'thamrin', label: 'Thamrin · Bundaran HI', kws: ['thamrin', 'm.h. thamrin', 'bundaran hi', 'plaza indonesia'] },
      { key: 'kuningan', label: 'Kuningan · Rasuna', kws: ['kuningan', 'rasuna', 'rasuna said', 'mega kuningan'] },
      { key: 'setiabudi', label: 'Setiabudi', kws: ['setiabudi', 'gal bintang'] },
      { key: 'menteng', label: 'Menteng', kws: ['menteng', 'cikini', 'setia budi one'] },
      { key: 'kebayoran-baru', label: 'Kebayoran Baru · Senayan', kws: ['kebayoran baru', 'senayan', 'senopati', 'blok m'] },
      { key: 'pondok-indah', label: 'Pondok Indah', kws: ['pondok indah', 'patal senayan'] },
      { key: 'cilandak', label: 'Cilandak · Fatmawati', kws: ['cilandak', 'fatmawati', 'kemang'] },
      { key: 'kemang', label: 'Kemang · Mampang', kws: ['kemang', 'mampang', 'bangka'] },
      { key: 'kelapa-gading', label: 'Kelapa Gading', kws: ['kelapa gading', 'kg'] },
      { key: 'pluit', label: 'Pluit · Muara Karang', kws: ['pluit', 'muara karang'] },
      { key: 'pik', label: 'Pantai Indah Kapuk', kws: ['pantai indah kapuk', 'pik', 'pik 2'] },
      { key: 'gading-serpong', label: 'Gading Serpong · BSD', kws: ['gading serpong', 'bsd', 'bsd city', 'serpong'] },
      { key: 'alam-sutera', label: 'Alam Sutera', kws: ['alam sutera', 'serpong'] },
      { key: 'mangga-besar', label: 'Mangga Besar · Kota', kws: ['mangga besar', 'kota tua', 'glodok', 'hayam wuruk'] },
      { key: 'tanah-abang', label: 'Tanah Abang', kws: ['tanah abang', 'petamburan'] },
      { key: 'bekasi', label: 'Bekasi · Lippo Cikarang', kws: ['bekasi', 'lippo cikarang', 'metro town'] }
    ]
  },
  {
    cityKey: 'bali',
    cityLabel: '巴厘岛',
    country: '印尼',
    children: [
      { key: 'canggu', label: 'Canggu · Berawa', kws: ['canggu', 'berawa', 'pererenan', 'batu bolong'] },
      { key: 'seminyak', label: 'Seminyak', kws: ['seminyak', 'petitenget', 'double six', 'kerobokan'] },
      { key: 'kuta', label: 'Kuta · Legian', kws: ['kuta', 'legian', 'tuban'] },
      { key: 'ubud', label: 'Ubud', kws: ['ubud', 'payangan'] },
      { key: 'sanur', label: 'Sanur', kws: ['sanur', 'semawang'] },
      { key: 'nusa-dua', label: 'Nusa Dua · BTDC', kws: ['nusa dua', 'btdc'] },
      { key: 'jimbaran', label: 'Jimbaran', kws: ['jimbaran', 'kedonganan'] },
      { key: 'uluwatu', label: 'Uluwatu · Pecatu', kws: ['uluwatu', 'pecatu', 'padang padang', 'bingin', 'nunggalan'] },
      { key: 'kerobokan', label: 'Kerobokan', kws: ['kerobokan', 'oberoi'] },
      { key: 'denpasar', label: 'Denpasar', kws: ['denpasar', 'renon', 'sunset road'] },
      { key: 'canngal-tibubeneng', label: 'Tibubeneng · Seseh', kws: ['tibubeneng', 'seseh', 'canggu selatan'] },
      { key: 'amarapura', label: 'Amarapura · Soka', kws: ['amarapura', 'soka', 'mediwangi'] }
    ]
  },
  {
    cityKey: 'surabaya',
    cityLabel: '泗水',
    country: '印尼',
    children: [
      { key: 'sby-central', label: 'Surabaya Central', kws: ['surabaya', 'central business'] },
      { key: 'sby-east', label: 'East Surabaya · Mulyorejo', kws: ['mulyorejo', 'menur', 'sukolilo'] },
      { key: 'sby-west', label: 'West Surabaya · Dukuh Pakan', kws: ['dukuh pakan', 'cito', 'wiwitan', 'tambak'] },
      { key: 'sby-north', label: 'North Surabaya · Kenjeran', kws: ['kenjeran', 'tunjungan', 'ubaya', 'pabean'] },
      { key: 'sby-south', label: 'South Surabaya · Rungkut', kws: ['rungkut', 'sidoarjo', 'siwalankerto'] }
    ]
  },
  {
    cityKey: 'bandung',
    cityLabel: '万隆',
    country: '印尼',
    children: [
      { key: 'bdg-central', label: 'Bandung Central · Dago', kws: ['bandung', 'dago', 'cikapundung', 'braga'] },
      { key: 'bdg-north', label: 'North Bandung · Setiabudi', kws: ['setiabudi bandung', 'dago atas'] },
      { key: 'bdg-east', label: 'East Bandung · Cibiru', kws: ['cibiru', 'gedebage', 'kiara condong'] },
      { key: 'bdg-south', label: 'South Bandung · Buah Batu', kws: ['buah batu', 'katapang', 'dayeuhkolot'] }
    ]
  },
  {
    cityKey: 'lombok',
    cityLabel: '龙目岛',
    country: '印尼',
    children: [
      { key: 'lombok-senggigi', label: 'Senggigi', kws: ['senggigi', 'batu layar'] },
      { key: 'lombok-kuta', label: 'Kuta Lombok · Mandalika', kws: ['kuta lombok', 'mandalika', 'mbeqquek'] },
      { key: 'lombok-mataran', label: 'Mataram', kws: ['mataram'] },
      { key: 'lombok-tanjung', label: 'Tanjung · Bangsal', kws: ['tanjung lombok', 'bangsal', 'gili'] }
    ]
  },
  // ==================== 菲律宾 Philippines ====================
  {
    cityKey: 'metroManila',
    cityLabel: '马尼拉大都会',
    country: '菲律宾',
    children: [
      { key: 'makati', label: 'Makati CBD · Legaspi', kws: ['makati', 'legaspi', 'ayala', 'bel air', 'salcedo', 'century city'] },
      { key: 'bgc', label: 'Bonifacio Global City', kws: ['bonifacio global city', 'bgc', 'uptown', 'fort bonifacio', 'tagig', 'mckinley'] },
      { key: 'ortigas', label: 'Ortigas Center · Pasig', kws: ['ortigas', 'meralco', 'pasig', 'emerald', 'university belt'] },
      { key: 'quezon-city', label: 'Quezon City · Cubao', kws: ['quezon city', 'cubao', 'commonwealth', 'north edsa', 'libis', 'kapitolyo', 'triangle', 'bagong lipunan'] },
      { key: 'mandaluyong', label: 'Mandaluyong · Poblacion', kws: ['mandaluyong', 'poblacion', 'edsa', 'boni'] },
      { key: 'pasay', label: 'Pasay · MOA', kws: ['pasay', 'mall of asia', 'newport', 'reclamation'] },
      { key: 'paranaque', label: 'Paranaque · BF Homes', kws: ['paranaque', 'bf homes', 'don galo'] },
      { key: 'manila', label: 'Manila · Binondo · Ermita', kws: ['binondo', 'ermita', 'malate', 'manila', 'intramuros'] },
      { key: 'alabang', label: 'Alabang · Muntinlupa', kws: ['alabang', 'muntinlupa', 'filinvest', 'madrigal'] },
      { key: 'san-juan', label: 'San Juan · Greenhills', kws: ['san juan', 'greenhills'] },
      { key: 'marikina', label: 'Marikina', kws: ['marikina', 'riverbanks', 'sta lucia'] },
      { key: 'cavite', label: 'Cavite · Imus · Dasmariñas', kws: ['cavite', 'imus', 'dasmariñas', 'general trias'] },
      { key: 'laguna', label: 'Laguna · Nuvali', kws: ['laguna', 'nuvali', 'sta rosa', 'calamba', 'biñan'] },
      { key: 'bulacan', label: 'Bulacan · Marilao', kws: ['bulacan', 'marilao', 'meycauayan', 'dfc'] },
      { key: 'valenzuela', label: 'Valenzuela', kws: ['valenzuela'] }
    ]
  },
  {
    cityKey: 'cebu',
    cityLabel: '宿务',
    country: '菲律宾',
    children: [
      { key: 'cebu-city', label: 'Cebu City · Downtown', kws: ['cebu city', 'downtown cebu', 'cebu business park'] },
      { key: 'mactan', label: 'Mactan · Lapu-Lapu', kws: ['mactan', 'lapu-lapu', 'maribago'] },
      { key: 'mandaue', label: 'Mandaue', kws: ['mandaue', 'banilad', 'jpark'] },
      { key: 'it-park', label: 'IT Park · Banilad', kws: ['it park', 'banilad', 'lahug'] },
      { key: 'talamban', label: 'Talamban · Mabolo', kws: ['talamban', 'mabolo', 'ayala'] },
      { key: 'talisay', label: 'Talisay · Minglanilla', kws: ['talisay', 'minglanilla'] },
      { key: 'moalboal', label: 'Moalboal · Badian', kws: ['moalboal', 'badian', 'samboan'] }
    ]
  },
  {
    cityKey: 'davao',
    cityLabel: '达沃',
    country: '菲律宾',
    children: [
      { key: 'davao-city', label: 'Davao City · Downtown', kws: ['davao city', 'davao', 'city center', 'matina'] },
      { key: 'bajada', label: 'Bajada', kws: ['bajada'] },
      { key: 'matina', label: 'Matina', kws: ['matina', 'matina crossing'] },
      { key: 'lanang', label: 'Lanang', kws: ['lanang', 'damosa'] },
      { key: 'toril', label: 'Toril · Mintal', kws: ['toril', 'mintal', 'talomo'] }
    ]
  },
  {
    cityKey: 'clark',
    cityLabel: '克拉克 · 安赫莱斯',
    country: '菲律宾',
    children: [
      { key: 'clark-freeport', label: 'Clark Freeport Zone', kws: ['clark', 'clark freeport', 'clark airport'] },
      { key: 'angeles', label: 'Angeles City', kws: ['angeles', 'balibago'] },
      { key: 'mabalacat', label: 'Mabalacat · Dau', kws: ['mabalacat', 'dau'] },
      { key: 'san-fernando', label: 'San Fernando · Pampanga', kws: ['san fernando pampanga', 'monarch', 'mexico'] }
    ]
  },
  {
    cityKey: 'baguio',
    cityLabel: '碧瑶',
    country: '菲律宾',
    children: [
      { key: 'baguio-central', label: 'Baguio City', kws: ['baguio', 'session road', 'burnham'] },
      { key: 'baguio-south', label: 'South Baguio · Camp John Hay', kws: ['camp john hay', 'country club'] }
    ]
  },
  // ==================== 柬埔寨 Cambodia ====================
  {
    cityKey: 'phnomPenh',
    cityLabel: '金边',
    country: '柬埔寨',
    children: [
      { key: 'bkk1', label: 'BKK1', kws: ['bkk1', 'boeung keng kang', 'bkk district', 'samdach sang'] },
      { key: 'daun-penh', label: 'Riverside · Daun Penh', kws: ['riverside', 'daun penh', 'wat phnom', 'street 240', 'riverside cambodia'] },
      { key: 'chamkarmon', label: 'Chamkarmon', kws: ['chamkarmon', 'toul tom pong', 'tonle bassac'] },
      { key: 'toul-kork', label: 'Toul Kork', kws: ['toul kork', 'tuol kork', 'toul svay prey'] },
      { key: 'sen-sok', label: 'Sen Sok', kws: ['sen sok', 'phnom penh thmey', 'sangkat phnom penh thmey'] },
      { key: 'chroy-changvar', label: 'Chroy Changvar · Koh Pich', kws: ['chroy changvar', 'koh pich', 'diamond island'] },
      { key: 'dangkor', label: 'Dangkor', kws: ['dangkor', 'koh pich city'] },
      { key: 'mean-chey', label: 'Mean Chey · Chbar Ampov', kws: ['mean chey', 'stung mean chey', 'chbar ampov'] },
      { key: 'khan-pou-sen', label: 'Pou Sen Chey · Boeung Tumpun', kws: ['pou sen chey', 'boeung tumpun', 'russian market'] }
    ]
  },
  {
    cityKey: 'siemReap',
    cityLabel: '暹粒',
    country: '柬埔寨',
    children: [
      { key: 'siem-reap', label: 'Siem Reap · City Centre', kws: ['siem reap', 'pub street', 'old market', 'wat bo'] },
      { key: 'taphul', label: 'Taphul · Angkor', kws: ['taphul', 'angkor'] },
      { key: 'mondul', label: 'Mondul', kws: ['mondul', 'sangkat mondul'] },
      { key: 'svay-dangkum', label: 'Svay Dangkum', kws: ['svay dangkum'] }
    ]
  },
  {
    cityKey: 'sihanoukville',
    cityLabel: '西哈努克港',
    country: '柬埔寨',
    children: [
      { key: 'sihoukville-otres', label: 'Otres Beach', kws: ['otres', 'otres beach'] },
      { key: 'sihoukville-occ', label: 'Ochheuteal · Occheuteal', kws: ['ochheuteal', 'serendipity', 'occ'] },
      { key: 'sihoukville-sokha', label: 'Sokha · Independence', kws: ['sokha', 'independence beach'] },
      { key: 'sihoukville-tourism', label: 'Grand Tourism · Win Tais', kws: ['grand tourism', 'win tais', 'west body'] },
      { key: 'ka-oh-chres', label: 'Kaoh Chres · Ream', kws: ['kaoh chres', 'ream', 'tip dovin'] }
    ]
  },
  // ==================== 老挝 Laos ====================
  {
    cityKey: 'vientiane',
    cityLabel: '万象',
    country: '老挝',
    children: [
      { key: 'vte-center', label: 'Vientiane Centre', kws: ['vientiane', 'city centre', 'fonton'] },
      { key: 'vte-sisattanak', label: 'Sisattanak', kws: ['sisattanak', 'wat xieng'] },
      { key: 'vte-chanthabouly', label: 'Chanthabouly', kws: ['chanthabouly'] },
      { key: 'vte-chaixang', label: 'Chaixang · Tha Dee', kws: ['chaixang', 'tha dee'] },
      { key: 'vte-hadxaifong', label: 'Hadxaifong', kws: ['hadxaifong'] }
    ]
  },
  // ==================== 缅甸 Myanmar ====================
  {
    cityKey: 'yangon',
    cityLabel: '仰光',
    country: '缅甸',
    children: [
      { key: 'yangon-downtown', label: 'Yangon Downtown', kws: ['yangon', 'downtown yangon', 'botahtaung'] },
      { key: 'yangon-bahan', label: 'Bahan · Inya', kws: ['bahan', 'inya', 'kandawgyi', 'pandawgow', 'myaynigone'] },
      { key: 'yangon-mayangon', label: 'Mayangon · Tarmwe', kws: ['mayangon', 'tarmwe', 'mingaladon'] },
      { key: 'yangon-south', label: 'South Dagon · Thingangyun', kws: ['thidagon', 'thingangyun', 'south dagon'] },
      { key: 'yangon-sanchaung', label: 'Sanchaung · Kamayut', kws: ['sanchaung', 'kamayut', 'kabar aye'] }
    ]
  }
]