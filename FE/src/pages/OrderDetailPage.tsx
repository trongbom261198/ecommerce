import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import { ArrowLeft, XCircle, Truck, MapPin, CreditCard } from 'lucide-react'
import { orderService } from '@/services/orderService'
import MainLayout from '@/components/layout/MainLayout'
import { OrderStatusBadge } from '@/components/order/OrderStatusBadge'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import { getImageUrl } from '@/utils/image'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)

const formatDate = (iso: string) => {
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'lúc' HH:mm", { locale: vi })
  } catch {
    return iso
  }
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [cancelModalOpen, setCancelModalOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderService.getOrderById(id!),
    enabled: !!id,
  })

  const cancelMutation = useMutation({
    mutationFn: () => orderService.cancelOrder(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      setCancelModalOpen(false)
    },
  })

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </MainLayout>
    )
  }

  if (isError || !data?.data) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <p className="text-red-600 mb-4">Không thể tải thông tin đơn hàng.</p>
          <button
            onClick={() => navigate('/orders')}
            className="text-blue-600 hover:underline text-sm"
          >
            Quay lại danh sách đơn hàng
          </button>
        </div>
      </MainLayout>
    )
  }

  const order = data.data
  const canCancel = order.status === 'PENDING' || order.status === 'CONFIRMED'
  const canTrack = order.status === 'SHIPPED'

  const addr = order.shippingAddress

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back */}
        <button
          onClick={() => navigate('/orders')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại đơn hàng
        </button>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Đơn hàng</p>
              <h1 className="text-xl font-bold text-gray-900">#{order.orderNumber}</h1>
              <p className="text-sm text-gray-500 mt-1">{formatDate(order.createdAt)}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <OrderStatusBadge status={order.status} />
              {canTrack && (
                <button
                  onClick={() => navigate(`/orders/${order.id}/tracking`)}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Truck className="h-4 w-4" />
                  Theo dõi giao hàng
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => setCancelModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:border-red-300 transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                  Hủy đơn
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Order items */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                Sản phẩm ({order.items.length})
              </h2>
              <div className="divide-y divide-gray-50">
                {order.items.map((item) => (
                  <div key={item.id} className="py-3 flex items-center gap-4">
                    <div className="h-16 w-16 rounded-lg flex-shrink-0 overflow-hidden bg-gray-100">
                      {item.images?.[0] ? (
                        <img
                          src={getImageUrl(item.images[0])}
                          alt={item.productName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.productName}
                      </p>
                      {item.variantName && (
                        <p className="text-xs text-gray-500">{item.variantName}</p>
                      )}
                      <p className="text-xs text-gray-400">SKU: {item.skuCode}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500">
                        {formatCurrency(item.unitPrice)} × {item.quantity}
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(item.subtotal)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-5">
                Lịch sử đơn hàng
              </h2>
              <OrderTimeline
                events={order.events ?? []}
                currentStatus={order.status}
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Order summary */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Tóm tắt đơn hàng</h2>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Tạm tính</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Phí vận chuyển</span>
                  <span>{formatCurrency(order.shippingFee)}</span>
                </div>
                {order.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Giảm giá</span>
                    <span>-{formatCurrency(order.discountAmount)}</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-2.5 flex justify-between font-bold text-gray-900">
                  <span>Tổng cộng</span>
                  <span className="text-blue-600">{formatCurrency(order.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Shipping address */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900">Địa chỉ giao hàng</h2>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                {addr.recipientName && (
                  <p className="font-medium text-gray-800">{addr.recipientName}</p>
                )}
                {addr.phone && <p>{addr.phone}</p>}
                {addr.streetAddress && <p>{addr.streetAddress}</p>}
                <p>
                  {[addr.ward, addr.province].filter(Boolean).join(', ')}
                </p>
                {addr.country && <p>{addr.country}</p>}
              </div>
            </div>

            {/* Payment */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900">Thanh toán</h2>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <p>
                  <span className="text-gray-500">Phương thức: </span>
                  {order.paymentMethod}
                </p>
                <p>
                  <span className="text-gray-500">Trạng thái: </span>
                  <span
                    className={
                      order.paymentStatus === 'PAID'
                        ? 'text-green-600 font-medium'
                        : 'text-yellow-600 font-medium'
                    }
                  >
                    {order.paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Chờ thanh toán'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel modal */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Hủy đơn hàng"
        footer={
          <>
            <button
              onClick={() => setCancelModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Không, giữ đơn
            </button>
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {cancelMutation.isPending && <LoadingSpinner size="sm" />}
              Xác nhận hủy
            </button>
          </>
        }
      >
        <p className="text-gray-600 text-sm">
          Bạn có chắc chắn muốn hủy đơn hàng <strong>#{order.orderNumber}</strong> không?
          Hành động này không thể hoàn tác.
        </p>
        {cancelMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            Hủy đơn hàng thất bại. Vui lòng thử lại.
          </p>
        )}
      </Modal>
    </MainLayout>
  )
}
