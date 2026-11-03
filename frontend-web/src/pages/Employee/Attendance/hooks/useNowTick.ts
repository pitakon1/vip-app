import { useEffect, useState } from 'react'
import dayjs from 'dayjs'

/** 秒级走时的当前时间（页面时钟用）。 */
export const useNowTick = () => {
  const [now, setNow] = useState(() => dayjs())

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 1000)
    return () => clearInterval(timer)
  }, [])

  return now
}
