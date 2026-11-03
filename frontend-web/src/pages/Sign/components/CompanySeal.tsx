/* 红色公司公章展示（模板生成前的样式预览；实际盖章由后端按 company_seal 落章） */
const CompanySeal = ({ name }: { name: string }) => (
  <svg width="140" height="140" viewBox="0 0 260 260" style={{ display: 'block', margin: '0 auto' }}>
    <circle cx="130" cy="130" r="118" fill="none" stroke="#c0392b" strokeWidth="6" />
    <circle cx="130" cy="130" r="96" fill="none" stroke="#c0392b" strokeWidth="2.5" />
    <text x="130" y="136" textAnchor="middle" fontSize="26" fontFamily="SimSun, serif" fill="#c0392b">
      {name || '签约方'}
    </text>
    <polygon points="120,150 126,144 132,150 138,144 130,156" fill="#c0392b" />
    <text x="130" y="196" textAnchor="middle" fontSize="16" fontFamily="SimSun, serif" fill="#c0392b">
      合同专用章
    </text>
  </svg>
)

export default CompanySeal
