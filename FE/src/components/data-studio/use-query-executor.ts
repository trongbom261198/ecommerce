import { useCallback, useState } from 'react'
import { message } from 'antd'
import { analyticsService, ExecuteResponse, QueryLanguage } from '@/services/analyticsService'

export function useQueryExecutor() {
  const [result, setResult] = useState<ExecuteResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const execute = useCallback(async (language: QueryLanguage, code: string) => {
    if (!code.trim()) return
    setLoading(true)
    try {
      const res = await analyticsService.execute({ language, code })
      setResult(res)
      if (res.error) message.error(`Lỗi thực thi: ${res.error}`)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      message.error(detail ?? 'Lỗi kết nối đến analytics service')
    } finally {
      setLoading(false)
    }
  }, [])

  return { result, loading, execute }
}
