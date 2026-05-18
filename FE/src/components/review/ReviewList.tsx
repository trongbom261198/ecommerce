import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import StarRating from './StarRating'
import { reviewService } from '@/services/review-service'
import type { ReviewResponse } from '@/types/review'
import dayjs from 'dayjs'
import 'dayjs/locale/vi'

dayjs.locale('vi')

const AVATAR_GRADIENTS = [
  'from-blue-400 to-violet-500',
  'from-green-400 to-teal-500',
  'from-orange-400 to-rose-500',
  'from-pink-400 to-fuchsia-500',
  'from-yellow-400 to-orange-500',
  'from-indigo-400 to-blue-500',
]

function avatarGradient(name: string) {
  const code = name.charCodeAt(0) || 0
  return AVATAR_GRADIENTS[code % AVATAR_GRADIENTS.length]
}

interface ReviewListProps {
  productId: string
  currentUserId?: string
  currentUserRole?: string
  onEdit?: (review: ReviewResponse) => void
}

export default function ReviewList({ productId, currentUserId, currentUserRole, onEdit }: ReviewListProps) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', productId, page],
    queryFn: () => reviewService.listReviews(productId, page, PAGE_SIZE),
    staleTime: 30_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (reviewId: string) => reviewService.deleteReview(productId, reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', productId] })
      queryClient.invalidateQueries({ queryKey: ['review-summary', productId] })
    },
  })

  const reviews = data?.data?.content ?? []
  const totalPages = data?.data?.totalPages ?? 0
  const totalElements = data?.data?.totalElements ?? 0

  function handleDelete(reviewId: string) {
    if (!confirm('Bạn có chắc muốn xoá đánh giá này?')) return
    deleteMutation.mutate(reviewId)
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse flex gap-3 p-3">
            <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-1/4" />
              <div className="h-3 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-200 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (totalElements === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        Chưa có đánh giá nào. Hãy là người đầu tiên!
      </p>
    )
  }

  const isAdmin = currentUserRole === 'ADMIN'

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">{totalElements} đánh giá</p>

      {reviews.map((review) => {
        const initial = review.userName.charAt(0).toUpperCase()
        const gradient = avatarGradient(review.userName)
        const isOwner = currentUserId && review.userId === currentUserId
        const canManage = isOwner || isAdmin

        return (
          <div key={review.id} className="flex gap-3 border-b border-gray-100 pb-4 last:border-0">
            <div
              className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-bold shrink-0`}
            >
              {initial}
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{review.userName}</span>
                  {isOwner && (
                    <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">Bạn</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {dayjs(review.createdAt).format('DD/MM/YYYY')}
                  </span>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      {isOwner && onEdit && (
                        <button
                          onClick={() => onEdit(review)}
                          className="p-1 text-gray-400 hover:text-blue-500 transition-colors rounded"
                          title="Sửa đánh giá"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(review.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded disabled:opacity-40"
                        title="Xoá đánh giá"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <StarRating value={review.rating} size="sm" />
              {review.comment && (
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                  {review.comment}
                </p>
              )}
            </div>
          </div>
        )
      })}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Trước
          </button>
          <span className="text-xs text-gray-500">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Sau
          </button>
        </div>
      )}
    </div>
  )
}
