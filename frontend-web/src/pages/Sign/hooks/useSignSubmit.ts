﻿﻿﻿import { useRef, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { contractsApi, contractsPublicApi } from '@/services/api'
import { apiErrorBody, apiErrorResponse } from '@/lib/api'
import { errorText } from '@/lib/errorText'
import { round2 } from '../utils'
import type { ContractDoc, Phase, Placed } from '../types'

/** 签署提交 / 实名认证 / 拒签 的完整写操作链路 */
export const useSignSubmit = ({
  token,
  doc,
  placed,
  authToken,
  setPhase,
  setFail,
  onNameVerified,
}: {
  token: string
  doc: ContractDoc | null
  placed: Placed[]
  authToken: string | null
  setPhase: (p: Phase) => void
  setFail: (f: 'expired' | 'signed' | 'generic' | null) => void
  onNameVerified: (name: string) => void
}) => {
  const { t } = useTranslation()

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    signed?: boolean
    contract_status?: string
    // 后端随签署响应下发的 24h 只读下载凭证（令牌签署后即失效）
    download?: { url?: string; file_name?: string; expires_at?: string } | null
  } | null>(null)

  // 实名认证（403 REAL_NAME_REQUIRED 时触发，完成后自动重签）
  const [realOpen, setRealOpen] = useState(false)
  const [realStep, setRealStep] = useState<'send' | 'verify'>('send')
  const [contact, setContact] = useState('')
  const [code, setCode] = useState('')
  const [realName, setRealName] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  // 本地联调回显的明文验证码（后端仅 DEBUG + OTP_DEV_CODE_ECHO 时下发，生产恒为 null）
  const [devCode, setDevCode] = useState('')
  const pendingRetryRef = useRef<(() => void) | null>(null)
  // 实名通过后的身份信息。重试回调是在 403 之前创建的闭包，直接读 `signerPhone` /
  // `doc.party.name` 只会拿到认证前的旧值，会把刚认证的真实姓名又覆盖回占位名。
  // 因此认证成功后先把最新姓名/手机号写进 ref，重试时以 ref 为准。
  const verifiedIdentityRef = useRef<{ name: string; phone?: string } | null>(null)
  // 实名认证通过后记下的手机号（匿名签署提交时作为 phone 一并上报）
  const [signerPhone, setSignerPhone] = useState('')

  // 拒签
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declined, setDeclined] = useState(false)

  // ===== 底部【签署】：一次性原子提交全部落框 =====
  const submitPlaced = async () => {
    if (!doc?.contract_id || !doc?.party?.id) return
    if (placed.length === 0) {
      message.warning(t('contracts.signNothingPlaced'))
      return
    }
    setSubmitting(true)
    try {
      const items = placed.map((p) => ({
        page: p.page,
        x: round2(p.x),
        y: round2(p.y),
        w: round2(p.w),
        h: round2(p.h),
        method: p.method,
        ...(p.signatureSvg ? { signature_svg: p.signatureSvg } : {}),
        // date 类不传图，由后端按当天日期渲染；其余类型必须带成品图
        ...(p.imageDataUrl ? { image_data_url: p.imageDataUrl } : {}),
      }))
      // 场景分流：优先走站内 sign-batch，把签名归属到登录账号。但本页是**免登录**签署页：
      // 持链者未必是该签署方本人，浏览器里也可能残留过期令牌。这两种情况下站内端点会
      // 返回 401（令牌失效）或 403「Not a party of this contract」（登录的不是本人），
      // 而 token 端点不依赖登录态。此前没有兜底，外部签署人只会看到一句
      // "Invalid authentication credentials"、整个签署流程走不通。
      // 实名后的重试要读取认证结果（ref 中是最新值），不能再用 doc 的旧快照
      const identity = verifiedIdentityRef.current
      const phone = identity?.phone || signerPhone
      const publicPayload = {
        name: identity?.name || (doc.party.name || '').trim(),
        ...(phone ? { phone } : {}),
        items,
      }
      let res: any
      if (authToken) {
        try {
          res = await contractsApi.signBatch(doc.contract_id, {
            partyId: doc.party.id,
            items,
          })
        } catch (inner) {
          const st = apiErrorResponse(inner)?.status
          const dt = apiErrorBody(inner)?.detail ?? apiErrorResponse(inner)?.data?.detail
          // 实名缺口必须上抛给下方统一处理（弹实名弹窗），不能被兜底吞掉
          if (st === 403 && dt === 'REAL_NAME_REQUIRED') throw inner
          if (st === 401 || st === 403) {
            res = await contractsPublicApi.signByToken(token, publicPayload)
          } else {
            throw inner
          }
        }
      } else {
        res = await contractsPublicApi.signByToken(token, publicPayload)
      }
      const data = res?.data || {}
      setResult({ signed: true, contract_status: data.contract_status, download: data.download })
      setPhase('done')
    } catch (err) {
      const status = apiErrorResponse(err)?.status
      const detail = apiErrorBody(err)?.detail ?? apiErrorResponse(err)?.data?.detail
      if (status === 403 && detail === 'REAL_NAME_REQUIRED') {
        pendingRetryRef.current = () => {
          void submitPlaced()
        }
        setRealStep('send')
        setRealOpen(true)
        message.warning(t('contracts.realNameRequired'))
      } else if (status === 410) setFail('expired')
      else if (status === 409) setFail('signed')
      else message.error(errorText(err, t('contracts.errGenericSubmit')))
    } finally {
      setSubmitting(false)
    }
  }

  // 发送实名验证码
  const sendCode = async () => {
    if (!contact.trim()) {
      message.warning(t('contracts.blankContact'))
      return
    }
    setSendLoading(true)
    try {
      const res: any = await contractsPublicApi.sendCode(token, contact.trim())
      setDevCode(res?.data?.dev_code || '')
      message.success(t('contracts.codeSent'))
      setRealStep('verify')
    } catch (err) {
      message.error(errorText(err, t('contracts.errCode')))
    } finally {
      setSendLoading(false)
    }
  }

  // 校验身份证 + 验证码，完成实名后重签
  const verifyIdentity = async () => {
    if (!realName.trim() || !idNumber.trim() || !code.trim()) {
      message.warning(t('contracts.realNameFillAll'))
      return
    }
    setSendLoading(true)
    try {
      const verifiedName = realName.trim()
      const verifiedContact = contact.trim()
      await contractsPublicApi.verifyIdentity(token, {
        name: verifiedName,
        id_number: idNumber.trim(),
        contact: verifiedContact,
        code: code.trim(),
      })
      message.success(t('contracts.realNameDone'))
      setRealOpen(false)
      // 联系方式是手机号（非邮箱）时，匿名提交一并作为 phone 上报
      const verifiedPhone = verifiedContact && !verifiedContact.includes('@') ? verifiedContact : undefined
      // 先写入 ref：pendingRetryRef 里保存的仍是认证前创建的闭包，
      // 只有 ref 能保证重试请求拿到刚认证的姓名/手机号（否则真实姓名会被占位名覆盖）
      verifiedIdentityRef.current = { name: verifiedName, phone: verifiedPhone }
      // 实名通过后会写回 party.name（真实姓名），本地同步更新供界面展示
      onNameVerified(verifiedName)
      if (verifiedPhone) setSignerPhone(verifiedPhone)
      setRealName('')
      setIdNumber('')
      setCode('')
      setContact('')
      const retry = pendingRetryRef.current
      pendingRetryRef.current = null
      retry?.()
    } catch (err) {
      message.error(errorText(err, t('contracts.realNameFail')))
    } finally {
      setSendLoading(false)
    }
  }

  // 拒签
  // 理由与后端口径一致：后端允许空理由（reason or None），不强制必填
  const confirmDecline = async () => {
    try {
      await contractsPublicApi.decline(token, declineReason.trim())
      setDeclineOpen(false)
      setDeclined(true)
    } catch (err) {
      message.error(errorText(err, t('contracts.declineFail')))
    }
  }

  return {
    submitting,
    result,
    realOpen,
    setRealOpen,
    realStep,
    contact,
    setContact,
    code,
    setCode,
    realName,
    setRealName,
    idNumber,
    setIdNumber,
    sendLoading,
    devCode,
    declineOpen,
    setDeclineOpen,
    declineReason,
    setDeclineReason,
    declined,
    submitPlaced,
    sendCode,
    verifyIdentity,
    confirmDecline,
  }
}
