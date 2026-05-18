import api from './api'

export interface SuggestionItem {
  id: string
  name: string
  thumbnail: string | null
  price: number
}

export const suggestService = {
  suggest: (q: string, limit = 8): Promise<SuggestionItem[]> =>
    api
      .get<{ data: SuggestionItem[] }>('/products/suggest', { params: { q, limit } })
      .then((r) => r.data.data ?? []),
}
