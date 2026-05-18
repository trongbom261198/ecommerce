import { useQuery } from '@tanstack/react-query'
import { orderService } from '@/services/orderService'

export function useOrders(page = 0, size = 10) {
  return useQuery({
    queryKey: ['orders', page, size],
    queryFn: () => orderService.getOrders(page, size),
  })
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => orderService.getOrderById(id!),
    enabled: !!id,
  })
}
