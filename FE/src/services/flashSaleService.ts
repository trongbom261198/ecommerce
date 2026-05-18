import api from './api'
import type { FlashSale } from '@/types/flash-sale'
import type { ApiResponse } from '@/types/common'

export const flashSaleService = {
  getActiveSales: () =>
    api.get<ApiResponse<FlashSale[]>>('/flash-sales').then((r) => r.data),

  getSaleById: (id: string) =>
    api.get<ApiResponse<FlashSale>>(`/flash-sales/${id}`).then((r) => r.data),
}
