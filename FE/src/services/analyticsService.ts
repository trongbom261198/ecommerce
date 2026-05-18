import api from './api'

export type QueryLanguage = 'sql' | 'python' | 'r'

export interface ExecuteRequest {
  language: QueryLanguage
  code: string
  timeout?: number
}

export interface ExecuteResponse {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  executionMs: number
  truncated: boolean
  error: string | null
}

export interface Dataset {
  id?: string
  name?: string
  minioKey: string
  rowCount?: number
  sizeBytes?: number
  description?: string
  sourceType?: string
  updatedAt?: string
}

export interface HistoryItem {
  id: string
  language: QueryLanguage
  code: string
  rowCount: number
  execMs: number
  status: 'success' | 'error'
  createdAt: string
}

export const analyticsService = {
  execute: (req: ExecuteRequest): Promise<ExecuteResponse> =>
    api.post<ExecuteResponse>('/analytics/execute', req).then((r) => r.data),

  listDatasets: (): Promise<Dataset[]> =>
    api.get<{ datasets: Dataset[] }>('/analytics/datasets').then((r) => r.data.datasets),

  getHistory: (): Promise<HistoryItem[]> =>
    api.get<{ content: HistoryItem[] }>('/analytics/history').then((r) => r.data.content),

  deleteHistory: (id: string): Promise<void> =>
    api.delete(`/analytics/history/${id}`).then(() => undefined),

  triggerPipeline: (): Promise<{ message: string }> =>
    api.post<{ message: string }>('/analytics/admin/pipeline/run').then((r) => r.data),
}
