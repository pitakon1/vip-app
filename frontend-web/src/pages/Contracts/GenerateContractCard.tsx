/**
 * 合同生成卡片：模板选择 + 预览 + 字段表单 + 语言 + 生成按钮。
 * 纯结构拆分自 pages/Contracts/index.tsx，类名、控件与生成行为保持不变。
 */
import { Segmented } from 'antd'
import { FileTextOutlined, HomeOutlined, TeamOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { templateKindFields } from './contractTypes'
import type { TemplateOption } from './contractTypes'

const templateIcons: Record<string, React.ReactNode> = {
  lease: <HomeOutlined />,
  purchase: <FileTextOutlined />,
  broker: <TeamOutlined />,
}

export default function GenerateContractCard({
  templates,
  kind,
  setKind,
  language,
  setLanguage,
  form,
  setForm,
  onGenerate,
}: {
  templates: TemplateOption[] | null
  kind: string
  setKind: (v: string) => void
  language: string
  setLanguage: (v: string) => void
  form: Record<string, string>
  setForm: (v: Record<string, string>) => void
  onGenerate: () => void
}) {
  const { t } = useTranslation()

  // 模板选择（选项来自后端列表，失败时回退内置三端）
  const tmplSource: TemplateOption[] =
    templates && templates.length
      ? templates
      : (['lease', 'purchase', 'broker'] as const).map((k) => ({ kind: k, title: k }))
  const tmplOptions = tmplSource.map((tp) => ({
    value: tp.kind,
    label: (
      <span>
        {templateIcons[tp.kind]}
        <span style={{ marginLeft: 6 }}>{t(`contract.tmpl.${tp.kind}`)}</span>
      </span>
    ),
  }))
  const tmplFields = templateKindFields[kind] || []
  // 当前选中模板的范本正文（后端用空字段渲染出的标准样张）
  const tmplPreviewHtml = tmplSource.find((tp) => tp.kind === kind)?.content_html || ''

  return (
    <div className="rent-card rent-mb-5">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('contracts.genTitle')}</h3>
        <span className="rent-text-sm rent-text-muted">{t('contracts.genHint')}</span>
      </div>
      <div className="rent-card__body">
        <div className="rent-field rent-mb-3">
          <label className="rent-label">{t('contract.formTemplate')}</label>
          <Segmented
            options={tmplOptions}
            value={kind}
            onChange={(v) => setKind(v as string)}
            block
          />
        </div>
        {tmplPreviewHtml && (
          <div className="rent-contract-preview rent-mb-3">
            <div className="rent-contract-preview__title">{t('contract.templatePreview')}</div>
            <div className="rent-contract-preview__box">
              <div
                className="rent-contract-html"
                style={{ lineHeight: 1.8, fontSize: 14, wordBreak: 'break-word' }}
                dangerouslySetInnerHTML={{ __html: String(tmplPreviewHtml) }}
              />
            </div>
          </div>
        )}
        <div className="rent-grid rent-grid--3 rent-mb-3">
          {tmplFields.map((f) => (
            <div className="rent-field" key={f.key}>
              <label className="rent-label">{t(f.label)}</label>
              <input
                className="rent-input"
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="rent-grid rent-grid--3 rent-mb-3">
          <div className="rent-field">
            <label className="rent-label">{t('contracts.fLanguage')}</label>
            <select className="rent-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="zh">{t('contracts.langZh')}</option>
              <option value="en">English</option>
              <option value="th">ไทย</option>
            </select>
          </div>
        </div>
        <div className="rent-flex" style={{ justifyContent: 'flex-end' }}>
          <button className="rent-btn rent-btn--primary" onClick={onGenerate}>
            {t('contracts.generate')}
          </button>
        </div>
      </div>
    </div>
  )
}
