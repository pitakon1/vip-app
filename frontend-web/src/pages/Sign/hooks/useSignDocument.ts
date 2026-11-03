import { useEffect, useState } from 'react'
import { contractsPublicApi } from '@/services/api'
import type { ContractDoc, FailType, Phase } from '../types'

/** 加载公开签署页数据：410 → 过期；其余 → 通用失败 */
export const useSignDocument = (token: string) => {
  const [phase, setPhase] = useState<Phase>('loading')
  const [doc, setDoc] = useState<ContractDoc | null>(null)
  const [fail, setFail] = useState<FailType>(null)

  useEffect(() => {
    let mounted = true
    contractsPublicApi
      .get(token)
      .then((res) => {
        if (!mounted) return
        setDoc(res.data)
        setPhase('ready')
      })
      .catch((err) => {
        if (!mounted) return
        if (err?.response?.status === 410) setFail('expired')
        else setFail('generic')
        setPhase('done')
      })
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return { phase, setPhase, doc, setDoc, fail, setFail }
}
