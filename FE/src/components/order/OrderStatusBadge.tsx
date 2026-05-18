import type { OrderStatus } from '@/types/order'

interface OrderStatusBadgeProps {
  status: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Chờ xác nhận', className: 'bg-yellow-100 text-yellow-800' },
  CONFIRMED: { label: 'Đã xác nhận', className: 'bg-blue-100 text-blue-800' },
  PROCESSING: { label: 'Đang xử lý', className: 'bg-indigo-100 text-indigo-800' },
  PICKING: { label: 'Đang lấy hàng', className: 'bg-purple-100 text-purple-800' },
  PACKED: { label: 'Đã đóng gói', className: 'bg-orange-100 text-orange-800' },
  SHIPPED: { label: 'Đang giao hàng', className: 'bg-cyan-100 text-cyan-800' },
  DELIVERED: { label: 'Đã giao', className: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Đã hủy', className: 'bg-red-100 text-red-800' },
  REFUNDED: { label: 'Đã hoàn tiền', className: 'bg-gray-100 text-gray-800' },
}

export const OrderStatusBadge = ({ status }: OrderStatusBadgeProps) => {
  const config = statusConfig[status] ?? { label: status, className: 'bg-gray-100 text-gray-800' }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}

export { statusConfig }
export type { OrderStatus }
