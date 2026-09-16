import { useEffect, useState } from 'react'
import { Empty } from 'antd'
import api from '@/lib/api'

interface CompanyInfo {
  name: string
  version: string
  address: string
  phone: string
  email: string
  website?: string
  reg_no?: string
  social_media: {
    wechat?: string
    line?: string
    whatsapp?: string
    facebook?: string
    instagram?: string
    [k: string]: any
  }
}

const FALLBACK: CompanyInfo = {
  name: 'VIP 租赁管理系统',
  version: '1.0.0',
  address: '请配置公司地址',
  phone: '请配置公司电话',
  email: '请配置公司邮箱',
  social_media: { wechat: '', line: '', whatsapp: '' },
}

const Company = () => {
  const [info, setInfo] = useState<CompanyInfo>(FALLBACK)

  useEffect(() => {
    api
      .get('/company/info')
      .then((res) => setInfo(res.data || FALLBACK))
      .catch(() => setInfo(FALLBACK))
  }, [])

  // 企业资料字段（全部来自接口，无数据不渲染）
  const profileFields = [
    { label: '公司名称', value: info.name },
    { label: '注册编号', value: info.reg_no },
    { label: '公司地址', value: info.address },
    { label: '联系电话', value: info.phone },
    { label: '客服邮箱', value: info.email },
    { label: '官方网站', value: info.website },
  ].filter((f) => !!f.value)

  const socialFields = [
    { label: '微信', value: info.social_media?.wechat },
    { label: 'LINE', value: info.social_media?.line },
    { label: 'WhatsApp', value: info.social_media?.whatsapp },
    { label: 'Facebook', value: info.social_media?.facebook },
    { label: 'Instagram', value: info.social_media?.instagram },
  ].filter((s) => !!s.value)

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">公司信息</h2>
          <p className="rent-page-header__subtitle">企业资料与资质维护</p>
        </div>
        <div className="rent-page-header__actions"></div>
      </div>

      <div className="rent-grid rent-grid--2" style={{ alignItems: 'start' }}>
        {/* 企业资料 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">企业资料</h3>
            {info.version && <span className="rent-badge rent-badge--neutral">v{info.version}</span>}
          </div>
          <div className="rent-card__body">
            {profileFields.map((f) => (
              <div className="rent-form-group" key={f.label}>
                <label className="rent-form-label">{f.label}</label>
                <input className="rent-form-input" type="text" value={f.value} readOnly />
              </div>
            ))}
            {socialFields.length > 0 && (
              <div className="rent-form-group" style={{ marginBottom: 0 }}>
                <label className="rent-form-label">社交媒体</label>
                {socialFields.map((s) => (
                  <div className="rent-flex rent-gap-2" style={{ alignItems: 'center', marginBottom: 8 }} key={s.label}>
                    <span className="rent-badge rent-badge--info" style={{ minWidth: 84, justifyContent: 'center' }}>
                      {s.label}
                    </span>
                    <span className="rent-text-sm">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 资质文件 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">资质文件</h3>
          </div>
          <div className="rent-card__body">
            <div className="rent-table-wrap">
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>文件</th>
                    <th>类型</th>
                    <th>有效期</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={4}>
                      <div className="rent-empty">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无资质文件" />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Company