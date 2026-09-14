import { Dropdown, type MenuProps, Button, Space } from 'antd'
import { GlobalOutlined, CheckOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { SupportedLang } from '@/i18n'

const LANG_LABELS: { value: SupportedLang; label: string; short: string }[] = [
  { value: 'zh', label: '中文', short: '中' },
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'th', label: 'ไทย', short: 'ไทย' },
]

const LanguageSwitcher = ({ compact = false }: { compact?: boolean }) => {
  const { i18n } = useTranslation()
  const current = (['zh', 'en', 'th'].includes(i18n.language) ? i18n.language : 'zh') as SupportedLang

  const items: MenuProps['items'] = LANG_LABELS.map((l) => ({
    key: l.value,
    label: (
      <Space>
        <span>{l.label}</span>
        {current === l.value && <CheckOutlined style={{ color: 'var(--rent-primary)' }} />}
      </Space>
    ),
  }))

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    i18n.changeLanguage(key)
  }

  const currentLabel = LANG_LABELS.find((l) => l.value === current)

  return (
    <Dropdown menu={{ items, onClick: handleMenuClick }} placement="bottomRight" trigger={['click']}>
      <Button type="text" icon={<GlobalOutlined />} style={{ display: 'flex', alignItems: 'center' }}>
        <Space size={4}>
          <span>{compact ? currentLabel?.short : currentLabel?.label}</span>
        </Space>
      </Button>
    </Dropdown>
  )
}

export default LanguageSwitcher
