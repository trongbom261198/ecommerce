interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-4',
}

export const LoadingSpinner = ({ size = 'md' }: LoadingSpinnerProps) => (
  <div
    className={`animate-spin rounded-full border-b-blue-600 border-gray-200 ${sizeMap[size]}`}
    style={{ borderBottomColor: '#2563eb' }}
  />
)

export const FullPageSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <LoadingSpinner size="lg" />
  </div>
)
