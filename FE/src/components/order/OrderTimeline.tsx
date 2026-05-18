import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import type { OrderEvent } from '@/types/order'

interface OrderTimelineProps {
  events: OrderEvent[]
  currentStatus: string
}

const eventTypeLabels: Record<string, string> = {
  ORDER_CREATED: 'Đơn hàng được tạo',
  ORDER_CONFIRMED: 'Đơn hàng được xác nhận',
  ORDER_PROCESSING: 'Đang xử lý đơn hàng',
  ORDER_PICKING: 'Đang lấy hàng',
  ORDER_PACKED: 'Đã đóng gói',
  ORDER_SHIPPED: 'Đang vận chuyển',
  ORDER_DELIVERED: 'Đã giao hàng',
  ORDER_CANCELLED: 'Đơn hàng bị hủy',
  ORDER_REFUNDED: 'Đã hoàn tiền',
  STATUS_CHANGED: 'Trạng thái thay đổi',
  PAYMENT_RECEIVED: 'Thanh toán thành công',
  PAYMENT_CONFIRMED: 'Thanh toán xác nhận',
  SHIPMENT_CREATED: 'Tạo vận đơn',
  SHIPMENT_UPDATED: 'Cập nhật vận đơn',
  // OrderEvent enum names used by state machine
  CANCEL: 'Đơn hàng bị hủy',
  WAREHOUSE_ASSIGNED: 'Đã phân kho',
  PICKING_STARTED: 'Bắt đầu lấy hàng',
  PACKING_DONE: 'Đã đóng gói',
  CARRIER_PICKED_UP: 'Đơn vị vận chuyển lấy hàng',
  DELIVERY_CONFIRMED: 'Đã giao hàng',
  REFUND_APPROVED: 'Đã hoàn tiền',
}

const eventDotColors: Record<string, string> = {
  ORDER_CREATED: 'bg-blue-500',
  ORDER_CONFIRMED: 'bg-blue-600',
  ORDER_PROCESSING: 'bg-indigo-500',
  ORDER_PICKING: 'bg-purple-500',
  ORDER_PACKED: 'bg-orange-500',
  ORDER_SHIPPED: 'bg-cyan-500',
  ORDER_DELIVERED: 'bg-green-500',
  ORDER_CANCELLED: 'bg-red-500',
  ORDER_REFUNDED: 'bg-gray-500',
  PAYMENT_RECEIVED: 'bg-green-400',
  PAYMENT_CONFIRMED: 'bg-green-500',
  SHIPMENT_CREATED: 'bg-cyan-400',
  SHIPMENT_UPDATED: 'bg-cyan-600',
  STATUS_CHANGED: 'bg-yellow-500',
  CANCEL: 'bg-red-500',
  WAREHOUSE_ASSIGNED: 'bg-indigo-400',
  PICKING_STARTED: 'bg-purple-500',
  PACKING_DONE: 'bg-orange-500',
  CARRIER_PICKED_UP: 'bg-cyan-500',
  DELIVERY_CONFIRMED: 'bg-green-500',
  REFUND_APPROVED: 'bg-gray-500',
}

const formatDate = (iso: string) => {
  try {
    return format(parseISO(iso), 'dd/MM/yyyy HH:mm', { locale: vi })
  } catch {
    return iso
  }
}

export const OrderTimeline = ({ events }: OrderTimelineProps) => {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        Chưa có lịch sử cập nhật
      </div>
    )
  }

  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <ol className="relative border-l border-gray-200 ml-3">
      {sorted.map((event, idx) => {
        const dotColor = eventDotColors[event.eventType] ?? 'bg-gray-400'
        const label = eventTypeLabels[event.eventType] ?? event.eventType
        return (
          <li key={idx} className="mb-8 ml-6">
            <span
              className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${dotColor}`}
            />
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-gray-800">{label}</span>
            </div>
            <time className="block text-xs text-gray-500 mb-1">
              {formatDate(event.createdAt)}
            </time>
            {event.fromStatus && event.toStatus && (
              <p className="text-xs text-gray-500">
                {event.fromStatus} → {event.toStatus}
              </p>
            )}
            {event.description && (
              <p className="text-sm text-gray-600 mt-1">{event.description}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
