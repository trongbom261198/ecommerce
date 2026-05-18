import api from './api'
import type { ApiResponse, PageResponse } from '@/types/common'
import type { ReviewRequest, ReviewResponse, ReviewSummaryResponse } from '@/types/review'

export const reviewService = {
  getSummary: (productId: string) =>
    api
      .get<ApiResponse<ReviewSummaryResponse>>(`/products/${productId}/reviews/summary`)
      .then((r) => r.data),

  listReviews: (productId: string, page = 0, size = 10) =>
    api
      .get<ApiResponse<PageResponse<ReviewResponse>>>(`/products/${productId}/reviews`, {
        params: { page, size },
      })
      .then((r) => r.data),

  createReview: (productId: string, request: ReviewRequest) =>
    api
      .post<ApiResponse<ReviewResponse>>(`/products/${productId}/reviews`, request)
      .then((r) => r.data),

  updateReview: (productId: string, reviewId: string, request: ReviewRequest) =>
    api
      .put<ApiResponse<ReviewResponse>>(`/products/${productId}/reviews/${reviewId}`, request)
      .then((r) => r.data),

  deleteReview: (productId: string, reviewId: string) =>
    api
      .delete<void>(`/products/${productId}/reviews/${reviewId}`)
      .then((r) => r.data),
}
