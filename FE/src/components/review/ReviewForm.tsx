import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import StarRating from './StarRating'
import { reviewService } from '@/services/review-service'

interface ReviewFormProps {
  productId: string
  reviewId?: string
  initialRating?: number
  initialComment?: string
  onCancel?: () => void
  onSuccess?: () => void
}

export default function ReviewForm({
  productId,
  reviewId,
  initialRating = 0,
  initialComment = '',
  onCancel,
  onSuccess,
}: ReviewFormProps) {
  const queryClient = useQueryClient()
  const [rating, setRating] = useState(initialRating)
  const [comment, setComment] = useState(initialComment)
  const [error, setError] = useState('')
  const isEditMode = !!reviewId

  const mutation = useMutation({
    mutationFn: () =>
      isEditMode
        ? reviewService.updateReview(productId, reviewId!, { rating, comment: comment.trim() || undefined })
        : reviewService.createReview(productId, { rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', productId] })
      queryClient.invalidateQueries({ queryKey: ['review-summary', productId] })
      if (!isEditMode) {
        setRating(0)
        setComment('')
      }
      setError('')
      onSuccess?.()
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gửi đánh giá thất bại, vui lòng thử lại.'
      setError(msg)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) {
      setError('Vui lòng chọn số sao.')
      return
    }
    setError('')
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
      <h4 className="text-sm font-semibold text-gray-800">
        {isEditMode ? 'Chỉnh sửa đánh giá' : 'Viết đánh giá của bạn'}
      </h4>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Đánh giá:</span>
        <StarRating value={rating} size="md" onChange={setRating} />
        {rating > 0 && (
          <span className="text-xs text-gray-400">
            {['', 'Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Rất tốt'][rating]}
          </span>
        )}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm... (tuỳ chọn)"
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-gray-400"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{comment.length}/2000</span>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? 'Đang gửi...' : isEditMode ? 'Cập nhật' : 'Gửi đánh giá'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
          >
            Huỷ
          </button>
        )}
      </div>
    </form>
  )
}
