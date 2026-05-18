import StarRating from './StarRating'
import type { ReviewSummaryResponse } from '@/types/review'

interface ReviewSummaryProps {
  summary: ReviewSummaryResponse
  onWriteReview?: () => void
}

export default function ReviewSummary({ summary, onWriteReview }: ReviewSummaryProps) {
  const { averageRating, totalReviews, distribution, canReview } = summary

  return (
    <div className="flex flex-col sm:flex-row gap-6 p-4 bg-gray-50 rounded-xl">
      {/* Left: avg score */}
      <div className="flex flex-col items-center justify-center min-w-[100px] gap-1">
        <span className="text-5xl font-extrabold text-gray-900 leading-none">
          {averageRating.toFixed(1)}
        </span>
        <StarRating value={averageRating} size="sm" />
        <span className="text-xs text-gray-500">{totalReviews} đánh giá</span>
        {canReview && onWriteReview && (
          <button
            onClick={onWriteReview}
            className="mt-3 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
          >
            Viết đánh giá
          </button>
        )}
      </div>

      {/* Right: distribution bars */}
      <div className="flex flex-col gap-1.5 flex-1">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution[star] ?? 0
          const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0
          return (
            <div key={star} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4 text-right">{star}</span>
              <svg viewBox="0 0 12 12" className="w-3 h-3 fill-yellow-400 shrink-0">
                <path d="M6 0l1.545 3.09L11 3.64l-2.5 2.43.59 3.43L6 7.77l-3.09 1.73.59-3.43L1 3.64l3.455-.55z" />
              </svg>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-400 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 w-8 text-right">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
