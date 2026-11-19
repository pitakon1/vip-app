/**
 * 实名认证接口（证件上传 + 人工审核，不接人脸识别）。
 *
 * 小程序没有 FormData：`Taro.uploadFile` 一次只能带一个文件，所以反面材料先走
 * `POST /identity/staging` 预传拿到 staging 地址，再随 `POST /identity/submit`
 * 以 `back_stored` 引用提交。后端只接受带本人 user id 前缀的 staging 地址。
 */
import Taro from '@tarojs/taro'
import { currentToken, extractErrorMessage, request, unwrapUploadResult } from '@/lib/api'

declare const API_BASE: string

const baseURL = () => (typeof API_BASE !== 'undefined' ? API_BASE : '')

export interface IdentityStatus {
  status: 'none' | 'pending' | 'approved' | 'rejected'
  id?: string | null
  doc_type?: string | null
  real_name?: string | null
  id_number_masked?: string | null
  has_front?: boolean
  has_back?: boolean
  submitted_at?: string | null
  reviewed_at?: string | null
  rejection_reason?: string | null
  consent_granted_at?: string | null
  consent_policy_version?: string | null
  is_verified?: boolean
}

/** 单文件上传；非 2xx 时把后端 detail 压成一句话抛给页面。 */
async function uploadOnce(
  url: string,
  filePath: string,
  formData?: Record<string, string>
): Promise<any> {
  const res = await Taro.uploadFile({
    url: `${baseURL()}${url}`,
    filePath,
    name: 'file',
    formData,
    header: { Authorization: `Bearer ${currentToken()}` }
  })
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = unwrapUploadResult(res)
    throw new Error(extractErrorMessage(body, `上传失败（${res.statusCode}）`))
  }
  return unwrapUploadResult(res)
}

export const identityApi = {
  me: () => request<IdentityStatus>({ url: '/identity/me', method: 'GET' }),

  /** 预传单张证件图，返回 `{ stored: '/identity-files/stage_...' }` */
  staging: (filePath: string) =>
    uploadOnce('/identity/staging', filePath) as Promise<{ stored: string }>,

  /** 提交：正面随请求上传，反面可用 staging 地址引用。 */
  async submit(input: {
    docType: string
    realName: string
    idNumber?: string
    consent: boolean
    policyVersion?: string
    frontPath: string
    backStored?: string
  }): Promise<IdentityStatus> {
    const formData: Record<string, string> = {
      doc_type: input.docType,
      real_name: input.realName,
      consent: input.consent ? 'true' : 'false'
    }
    if (input.idNumber) formData.id_number = input.idNumber
    if (input.policyVersion) formData.policy_version = input.policyVersion
    if (input.backStored) formData.back_stored = input.backStored
    return uploadOnce('/identity/submit', input.frontPath, formData) as Promise<IdentityStatus>
  }
}
