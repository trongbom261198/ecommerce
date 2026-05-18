interface StarRatingProps {
  value: number
  max?: number
  size?: 'sm' | 'md'
  onChange?: (value: number) => void
}

const SIZE_CLASS = { sm: 'w-3.5 h-3.5', md: 'w-5 h-5' }

export default function StarRating({ value, max = 5, size = 'md', onChange }: StarRatingProps) {
  const isInteractive = !!onChange
  const starSize = SIZE_CLASS[size]

  return (
    <div className="flex items-center gap-0.5" role={isInteractive ? 'radiogroup' : undefined}>
      {Array.from({ length: max }, (_, i) => {
        const starValue = i + 1
        const filled = starValue <= Math.round(value)
        return (
          <button
            key={i}
            type="button"
            disabled={!isInteractive}
            onClick={() => onChange?.(starValue)}
            aria-label={isInteractive ? `${starValue} sao` : undefined}
            className={[
              starSize,
              'transition-transform',
              isInteractive
                ? 'cursor-pointer hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded'
                : 'cursor-default pointer-events-none',
            ].join(' ')}
          >
            <svg
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full"
              fill={filled ? '#FBBF24' : 'none'}
              stroke={filled ? '#FBBF24' : '#D1D5DB'}
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>
          </button>
        )
      })}
    </div>
  )
}
