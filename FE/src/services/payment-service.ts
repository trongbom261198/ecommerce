import api from './api'
import type { ApiResponse } from '@/types/common'

interface CreatePaymentResponse {
  paymentUrl: string
  vnpTxnRef: string
}

export const paymentService = {
  createVNPay: (orderId: string) =>
    api
      .post<ApiResponse<CreatePaymentResponse>>('/payments/vnpay/create', { orderId })
      .then((r) => r.data),
}
