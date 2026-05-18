import { useQuery } from '@tanstack/react-query'
import { suggestService, type SuggestionItem } from '@/services/suggest-service'

export function useSearchSuggestions(q: string): {
  suggestions: SuggestionItem[]
  isLoading: boolean
} {
  const { data, isLoading } = useQuery({
    queryKey: ['suggest', q],
    queryFn: () => suggestService.suggest(q),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
    placeholderData: [],
  })

  return { suggestions: data ?? [], isLoading }
}
