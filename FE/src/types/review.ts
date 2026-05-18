export interface ReviewResponse {
  id: string
  productId: string
  userId: string
  userName: string
  rating: number
  comment: string | null
  createdAt: string
  updatedAt: string
}

export interface ReviewSummaryResponse {
  averageRating: number
  totalReviews: number
  distribution: Record<number, number>
  canReview: boolean
}

export interface ReviewRequest {
  rating: number
  comment?: string
}
