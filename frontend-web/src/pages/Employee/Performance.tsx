import { Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import './performance.css'
import { PerformanceHeader } from './performance/components/PerformanceHeader'
import { KpiCards } from './performance/components/KpiCards'
import { TrendChartCard } from './performance/components/TrendChartCard'
import { MonthOverviewCard } from './performance/components/MonthOverviewCard'
import { DealDetailCard } from './performance/components/DealDetailCard'
import { BreakdownCard } from './performance/components/BreakdownCard'
import { MonthlyRecordsCard } from './performance/components/MonthlyRecordsCard'
import { AgentsTab } from './performance/components/AgentsTab'
import { PartnersTab } from './performance/components/PartnersTab'
import { useEmployeePerformance } from './performance/hooks/useEmployeePerformance'

const Performance = () => {
  const { t } = useTranslation()
  const p = useEmployeePerformance()

  return (
    <div className="rent-main">
      <PerformanceHeader onExport={p.handleExport} onSubmit={p.handleSubmitReport} />

      <Tabs
        defaultActiveKey="my"
        items={[
          {
            key: 'my',
            label: t('employeePerformance.tabMy'),
            children: (
              <>
                <KpiCards summary={p.summary} />

                <TrendChartCard monthly={p.monthly} data={p.trendChartData} options={p.trendChartOptions} />

                <MonthOverviewCard
                  monthTabs={p.monthTabs}
                  activeMonthIdx={p.activeMonthIdx}
                  onMonthChange={p.setMonth}
                  barData={p.barData}
                  summary={p.summary}
                />

                <div className="rent-grid rent-grid--2 rent-mb-5">
                  <DealDetailCard rows={p.rows} loading={p.loading} />
                  <BreakdownCard summary={p.summary} />
                </div>

                <MonthlyRecordsCard records={p.monthlyRecords} />
              </>
            ),
          },
          {
            key: 'agents',
            label: t('employeePerformance.tabAgents'),
            children: (
              <AgentsTab
                agents={p.sortedAgents}
                loading={p.agentsLoading}
                sort={p.agentSort}
                order={p.agentOrder}
                onSort={p.sortBy}
              />
            ),
          },
          {
            key: 'partners',
            label: t('employeePerformance.tabPartners'),
            children: <PartnersTab partners={p.partners} loading={p.partnersLoading} />,
          },
        ]}
      />
    </div>
  )
}

export default Performance
