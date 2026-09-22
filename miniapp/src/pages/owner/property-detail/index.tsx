import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { request, currentToken, documentFileUrl } from '@/lib/api'
import { leasesApi, paymentsApi, documentsApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import { iconStyle, type IconKey } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import './index.scss'

// ============ 接口字段（后端 snake_case）============
interface OwnerProperty {
  id?: string
  code?: string
  room_number?: string
  display_name?: string
  project_name?: string
  address?: string
  property_type?: string
  monthly_rent?: number
  currency?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  status?: string
}

interface OwnerLease {
  id: string
  property_id?: string
  tenant_id?: string
  start_date?: string
  end_date?: string
  monthly_rent?: number
  currency?: string
  deposit_amount?: number
  deposit_status?: string
  status?: string
}

interface OwnerPayment {
  id: string
  amount?: number
  currency?: string
  payment_type?: string
  status?: string
  due_date?: string
  paid_at?: string
  created_at?: string
  description?: string
  property_id?: string
}

interface OwnerDocument {
  id: string
  type?: string
  title?: string
  file_url?: string
  file_size?: number
  mime_type?: string
  created_at?: string
  property_id?: string
}

/** 兼容两种返回形状：直接对象 / { data: 对象 } */
function toBody(res: any) {
  if (res && typeof res === 'object' && 'data' in res && res.data && typeof res.data === 'object') {
    return res.data
  }
  return res
}

function pickList(res: any): any[] {
  if (Array.isArray(res)) return res
  const d = res?.data ?? res ?? {}
  if (Array.isArray(d)) return d
  if (Array.isArray(d.items)) return d.items
  if (Array.isArray(d.list)) return d.list
  return []
}

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '—')

const toTime = (x?: string) => {
  if (!x) return 0
  const t = new Date(String(x).replace(' ', 'T')).getTime()
  return Number.isNaN(t) ? 0 : t
}

// 房源状态（对齐后端 PropertyStatus 枚举）
const PROPERTY_STATUS_TEXT: Record<string, string> = {
  rented: '在租',
  vacant: '空置',
  renewing: '续租中',
  maintenance: '维护中',
  reserved: '已预订'
}

// 租约状态（对齐后端 LeaseStatus 枚举）
const LEASE_STATUS_TEXT: Record<string, string> = {
  active: '在租',
  pending: '待生效',
  expired: '已到期',
  terminated: '已终止'
}

// 押金状态（对齐后端 deposit_status）
const DEPOSIT_STATUS_TEXT: Record<string, string> = {
  held: '托管中',
  refunded: '已退还',
  forfeited: '已扣除'
}

const TYPE_TEXT: Record<string, string> = {
  apartment: '公寓',
  house: '住宅',
  condo: '公寓',
  commercial: '商铺'
}

const propertyTitle = (p?: OwnerProperty | null) =>
  p?.display_name || p?.project_name || p?.room_number || p?.code || p?.address || '房源详情'

const propertyMeta = (p?: OwnerProperty | null) => {
  if (!p) return ''
  const room = p.bedrooms ? `${p.bedrooms}室${p.bathrooms || 0}厅` : ''
  const size = p.size_sqm ? `${p.size_sqm}㎡` : ''
  return [TYPE_TEXT[String(p.property_type || '')] || '', room, size].filter(Boolean).join(' · ')
}

// 账单状态元信息：颜色语义交由 SCSS 徽章类实现
const paymentStatusOf = (p: OwnerPayment): { text: string; cls: string; icon: IconKey } => {
  if (p.status === 'succeeded') return { text: '已到账', cls: 'success', icon: 'money' }
  if (p.status === 'pending') return { text: '待确认', cls: 'warning', icon: 'calendar' }
  if (p.status === 'processing') return { text: '处理中', cls: 'info', icon: 'calendar' }
  if (p.status === 'failed' || p.status === 'disputed') return { text: '异常', cls: 'error', icon: 'close' }
  return { text: '已关闭', cls: 'neutral', icon: 'close' }
}

// 文档类型（对齐后端 DocumentType 枚举）
const DOC_TYPE_META: Record<string, { label: string; cls: string; icon: IconKey }> = {
  contract: { label: '合同', cls: 'primary', icon: 'doc' },
  receipt: { label: '收据', cls: 'success', icon: 'clipboard' },
  tax_invoice: { label: '发票', cls: 'warning', icon: 'doc' },
  wht_certificate: { label: '扣税凭证', cls: 'info', icon: 'clipboard' },
  inspection_photo: { label: '证件', cls: 'info', icon: 'card' },
  other: { label: '报表', cls: 'neutral', icon: 'chart' }
}

const docMetaOf = (t?: string) =>
  DOC_TYPE_META[t || ''] || { label: '其他', cls: 'neutral', icon: 'doc' as IconKey }

// openDocument 无法从「无扩展名的临时路径」推断格式，需显式给出 fileType
type OpenableFileType = 'doc' | 'docx' | 'xls' | 'xlsx' | 'ppt' | 'pptx' | 'pdf'

const OPENABLE_TYPES: readonly string[] = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf']

const fileTypeOf = (doc: OwnerDocument): OpenableFileType | undefined => {
  const ext = String(doc.title || '').split('.').pop()?.toLowerCase() || ''
  if (OPENABLE_TYPES.includes(ext)) return ext as OpenableFileType
  const mime = String(doc.mime_type || '')
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('word')) return 'docx'
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'xlsx'
  return undefined
}

export default function OwnerPropertyDetailPage() {
  const router = useRouter()
  const propertyId = router.params?.id || ''
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)

  interface DetailPayload {
    property: OwnerProperty
    leases: OwnerLease[]
    payments: OwnerPayment[]
    documents: OwnerDocument[]
  }

  const { data: detail, loading, error, refresh } = useSwrCache<DetailPayload>({
    key: `owner:prop-detail:${propertyId}`,
    fetcher: async (): Promise<DetailPayload> => {
      if (!propertyId) throw new Error('missing property id')
      const [propRes, leaseRes, payRes, docRes] = await Promise.all([
        request<any>({ url: `/properties/${propertyId}`, method: 'GET' }),
        leasesApi.list({ property_id: propertyId }).catch(() => null),
        paymentsApi.mine().catch(() => null),
        documentsApi.list({ property_id: propertyId }).catch(() => null)
      ])
      return {
        property: toBody(propRes) as OwnerProperty,
        leases: pickList(leaseRes) as OwnerLease[],
        payments: pickList(payRes) as OwnerPayment[],
        documents: pickList(docRes) as OwnerDocument[]
      }
    },
  })
  const property = detail?.property ?? null
  const leases = detail?.leases ?? []
  const payments = detail?.payments ?? []
  const documents = detail?.documents ?? []

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    refresh()
  })

  // 当前租约：优先取生效中的，否则取最近一条
  const activeLease =
    leases.find((l) => l.status === 'active') ??
    leases.slice().sort((a, b) => toTime(b.start_date) - toTime(a.start_date))[0] ??
    null

  // 本房源账单
  const propertyPayments = payments
    .filter((p) => String(p.property_id || '') === String(propertyId))
    .sort((a, b) => toTime(b.paid_at || b.due_date || b.created_at) - toTime(a.paid_at || a.due_date || a.created_at))

  // 租期进度：由真实起止日期推算
  const leaseStart = toTime(activeLease?.start_date)
  const leaseEnd = toTime(activeLease?.end_date)
  const termPct =
    leaseStart && leaseEnd > leaseStart
      ? Math.min(100, Math.max(0, Math.round(((Date.now() - leaseStart) / (leaseEnd - leaseStart)) * 100)))
      : 0
  const remainDays = leaseEnd ? Math.max(Math.round((leaseEnd - Date.now()) / 86400000), 0) : 0

  // 本月收益：优先用本房源本月租金账单，缺失时回退到租约月租
  const monthKey = new Date().toISOString().slice(0, 7)
  const monthRentBills = propertyPayments.filter(
    (p) =>
      String(p.payment_type || '') === 'rent' &&
      String(p.due_date || p.created_at || '').slice(0, 7) === monthKey
  )
  const monthReceivable =
    monthRentBills.length > 0
      ? monthRentBills.reduce((sum, p) => sum + Number(p.amount || 0), 0)
      : Number(activeLease?.monthly_rent || property?.monthly_rent || 0)
  const monthReceived = monthRentBills
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const receivedPct = monthReceivable > 0 ? Math.round((monthReceived / monthReceivable) * 100) : 0

  const currency = property?.currency || activeLease?.currency || 'THB'
  const pStatus = String(property?.status || 'vacant')
  const historyPayments = propertyPayments.slice(0, 8)

  // 本房源相关文档（按创建时间倒序）
  const propertyDocs = documents
    .filter((d) => String(d.property_id || '') === String(propertyId))
    .sort((a, b) => toTime(b.created_at) - toTime(a.created_at))

  /**
   * 取件并打开文档：uploads/documents 已不对静态服务开放，先 downloadFile
   * （可带 Authorization 头）落到本地临时文件，再交给 previewImage / openDocument。
   * showMenu 开启时系统菜单提供保存/转发入口，即小程序侧的「下载」。
   */
  const openDoc = async (doc: OwnerDocument) => {
    if (!doc.id) {
      Taro.showToast({ title: '暂无文件', icon: 'none' })
      return
    }
    Taro.showLoading({ title: '加载中', mask: true })
    let localPath = ''
    try {
      const token = currentToken()
      const res = await Taro.downloadFile({
        url: documentFileUrl(doc.id, 'download'),
        header: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (res.statusCode !== 200 || !res.tempFilePath) {
        throw new Error(`HTTP ${res.statusCode}`)
      }
      localPath = res.tempFilePath
    } catch (e) {
      console.error('[OwnerPropertyDetail] 取件失败', e)
      Taro.hideLoading()
      Taro.showToast({ title: '文件加载失败', icon: 'none' })
      return
    }
    Taro.hideLoading()

    if (String(doc.mime_type || '').startsWith('image/')) {
      Taro.previewImage({ urls: [localPath] })
      return
    }
    const fileType = fileTypeOf(doc)
    if (!fileType) {
      Taro.showToast({ title: '该类型暂不支持在小程序内打开', icon: 'none' })
      return
    }
    try {
      await Taro.openDocument({ filePath: localPath, fileType, showMenu: true })
    } catch (e) {
      console.error('[OwnerPropertyDetail] 打开失败', e)
      Taro.showToast({ title: '文件打开失败', icon: 'none' })
    }
  }

  return (
    <View className='owner-property-detail-page'>
      <View className='page-container'>
        {loading && !property && (
          <View className='empty-state'>
            <Text>加载中...</Text>
          </View>
        )}

        {!loading && error && !property && (
          <View className='empty-state'>
            <Text>房源加载失败，请稍后重试</Text>
            <View className='retry-btn' onClick={() => refresh(true)} hoverClass='retry-btn--hover'>
              <Text>重新加载</Text>
            </View>
          </View>
        )}

        {!!property && (
          <View>
            {/* 房源信息卡 */}
            <View className='info-card'>
              <View className='info-card__head'>
                <View className='info-card__tile icon-svg' style={iconStyle('home', 48)} />
                <View className='info-card__body'>
                  <View className='info-card__title-row'>
                    <Text className='info-card__name'>{propertyTitle(property)}</Text>
                    <Text className={`info-card__badge info-card__badge--${pStatus}`}>
                      {PROPERTY_STATUS_TEXT[pStatus] || pStatus}
                    </Text>
                  </View>
                  <Text className='info-card__addr'>{property.address || '地址待补充'}</Text>
                </View>
              </View>
              <View className='info-card__foot'>
                <View>
                  <Text className='info-card__label'>月租金</Text>
                  <Text className='info-card__rent'>{money(property.monthly_rent, currency)}</Text>
                </View>
                <Text className='info-card__meta'>{propertyMeta(property) || '—'}</Text>
              </View>
            </View>

            {/* 在租状态 */}
            <View className='section-title'>
              <Text>在租状态</Text>
            </View>
            <View className='card'>
              {!activeLease ? (
                <View className='empty-state'>
                  <Text>暂无租约记录</Text>
                </View>
              ) : (
                <View>
                  <View className='metric-row'>
                    <View className='metric'>
                      <Text className='metric__label'>当前租客</Text>
                      {/* 后端 Lease 仅存 tenant_id，无租客姓名，此处如实留空 */}
                      <Text className='metric__value'>—</Text>
                    </View>
                    <View className='metric'>
                      <Text className='metric__label'>租约到期日</Text>
                      <Text className='metric__value'>{fmtDate(activeLease.end_date)}</Text>
                    </View>
                    <View className='metric'>
                      <Text className='metric__label'>押金</Text>
                      <Text className='metric__value'>{money(activeLease.deposit_amount, currency)}</Text>
                    </View>
                  </View>
                  <View className='progress'>
                    <View className='progress__bar' style={{ width: `${termPct}%` }} />
                  </View>
                  <View className='status-bar'>
                    <Text className='status-bar__label'>
                      租期进度 · {LEASE_STATUS_TEXT[String(activeLease.status || '')] || '—'}
                      {activeLease.deposit_status
                        ? ` · 押金${DEPOSIT_STATUS_TEXT[String(activeLease.deposit_status)] || activeLease.deposit_status}`
                        : ''}
                    </Text>
                    <Text className={`status-bar__value ${remainDays <= 60 ? 'status-bar__value--warning' : ''}`}>
                      剩余 {remainDays} 天
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* 本月收益 */}
            <View className='section-title'>
              <Text>本月收益</Text>
            </View>
            <View className='card'>
              <View className='metric-row metric-row--two'>
                <View className='metric metric--box'>
                  <Text className='metric__label'>本月应收</Text>
                  <Text className='metric__value metric__value--lg'>{money(monthReceivable, currency)}</Text>
                </View>
                <View className='metric metric--box metric--box-success'>
                  <Text className='metric__label'>已收</Text>
                  <Text className='metric__value metric__value--lg metric__value--success'>
                    {money(monthReceived, currency)}
                  </Text>
                  <Text className={`badge badge--${monthReceived > 0 ? 'success' : 'warning'}`}>
                    {monthReceived > 0 ? '已到账' : '待收'}
                  </Text>
                </View>
              </View>
              <View className='progress'>
                <View className='progress__bar' style={{ width: `${receivedPct}%` }} />
              </View>
              <View className='status-bar'>
                <Text className='status-bar__label'>本月收款进度</Text>
                <Text className='status-bar__value status-bar__value--success'>已收 {receivedPct}%</Text>
              </View>
            </View>

            {/* 历史流水 */}
            <View className='section-title'>
              <Text>历史流水</Text>
              <Text className='section-hint'>{propertyPayments.length} 笔</Text>
            </View>
            <View className='card card--list'>
              {historyPayments.length === 0 ? (
                <View className='empty-state'>
                  <Text>暂无流水记录</Text>
                </View>
              ) : (
                historyPayments.map((p) => {
                  const st = paymentStatusOf(p)
                  return (
                    <View key={p.id} className='flow-row'>
                      <View className={`flow-row__badge flow-row__badge--${st.cls}`}>
                        <View className='icon-svg' style={iconStyle(st.icon, 36)} />
                      </View>
                      <View className='flow-row__body'>
                        <Text className='flow-row__title'>
                          {p.description || (p.payment_type === 'rent' ? '租金' : '账单')}
                        </Text>
                        <Text className='flow-row__desc'>{fmtDate(p.paid_at || p.due_date || p.created_at)}</Text>
                      </View>
                      <View className='flow-row__right'>
                        <Text className={`flow-row__amount flow-row__amount--${st.cls}`}>
                          {p.status === 'succeeded' ? '+' : ''}
                          {money(p.amount, p.currency || currency)}
                        </Text>
                        <Text className={`flow-row__tag flow-row__tag--${st.cls}`}>{st.text}</Text>
                      </View>
                    </View>
                  )
                })
              )}
            </View>

            {/* 相关文档 */}
            <View className='section-title'>
              <Text>相关文档</Text>
              <Text className='section-hint'>{propertyDocs.length} 份</Text>
            </View>
            <View className='card card--list'>
              {propertyDocs.length === 0 ? (
                <View className='empty-state'>
                  <Text>暂无相关文档</Text>
                </View>
              ) : (
                propertyDocs.map((doc) => {
                  const meta = docMetaOf(doc.type)
                  return (
                    <View
                      key={doc.id}
                      className='doc-row'
                      hoverClass='doc-row--hover'
                      onClick={() => openDoc(doc)}
                    >
                      <View className={`doc-row__badge doc-row__badge--${meta.cls}`}>
                        <View className='icon-svg' style={iconStyle(meta.icon, 36)} />
                      </View>
                      <View className='doc-row__body'>
                        <Text className='doc-row__title'>{doc.title || '未命名文档'}</Text>
                        <View className='doc-row__meta'>
                          <Text className={`doc-row__tag doc-row__tag--${meta.cls}`}>{meta.label}</Text>
                          <Text>{fmtDate(doc.created_at)}</Text>
                        </View>
                      </View>
                      <Text className='doc-row__arrow'>›</Text>
                    </View>
                  )
                })
              )}
            </View>
          </View>
        )}
      </View>

      <BottomNav role='owner' active='dashboard' />
    </View>
  )
}