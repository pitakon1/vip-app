/** 电子合同屏幕私有类型（仅本屏使用，不对外共享）。 */

/** 列表项：后端 /contracts 返回的精简合同字段。 */
export interface ContractItem {
  id: string;
  title?: string;
  kind?: string;
  source?: string;
  status?: string;
  language?: string;
  created_at?: string;
}

/** 合同模板（后端 /contracts/templates，失败时回退内置三模板）。 */
export interface ContractTemplate {
  kind: string;
  title: string;
  content_html?: string;
}

/** 追加签署方表单。 */
export interface PartyForm {
  name: string;
  email: string;
  role: string;
}

/** 签署区表单（坐标/尺寸均为页面百分比 0-100）。 */
export interface SignFieldForm {
  party_id: string;
  type: string;
  page: string;
  x: string;
  y: string;
}

/** 生成合同表单：按字段名收集输入值。 */
export type GenerateForm = Record<string, string>;
