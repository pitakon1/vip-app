import { useTranslation } from 'react-i18next'
import { Empty } from 'antd'
import type { MyRule, RuleItem } from '../types'

interface MyRuleCardProps {
  myRule: MyRule | null
  items: RuleItem[]
}

/** 我的考勤规则（后端按「成员 → 部门 → 默认组 → 全局」解析出的生效规则）。 */
const MyRuleCard = ({ myRule, items }: MyRuleCardProps) => {
  const { t } = useTranslation()

  return (
    <div className="rent-card rent-mb-5">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('attendance.myRuleTitle')}</h3>
        <span className="rent-caption">
          {myRule?.group_id ? t('attendance.ruleGroup') : t('attendance.ruleFallback')}
        </span>
      </div>
      <div className="rent-card__body">
        {items.length === 0 ? (
          <div className="rent-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />
          </div>
        ) : (
          <div className="rent-grid rent-grid--3">
            {items.map((item) => (
              <div key={item.label} className="rent-field">
                <div className="rent-label">{item.label}</div>
                <div className="rent-text-bold">{item.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default MyRuleCard
