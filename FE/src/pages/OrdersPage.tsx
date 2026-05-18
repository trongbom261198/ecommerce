import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import { orderService } from '@/services/orderService'
import type { OrderStatus } from '@/types/order'
import MainLayout from '@/components/layout/MainLayout'
import { OrderStatusBadge } from '@/components/order/OrderStatusBadge'
import { Pagination } from '@/components/ui/Pagination'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ShoppingBag, Eye } from 'lucide-react'

const STATUS_TABS: { label: string; value: OrderStatus | 'ALL' }[] = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Chờ xác nhận', value: 'PENDING' },
  { label: 'Đã xác nhận', value: 'CONFIRMED' },
  { label: 'Đang xử lý', value: 'PROCESSING' },
  { label: 'Đang lấy hàng', value: 'PICKING' },
  { label: 'Đã đóng gói', value: 'PACKED' },
  { label: 'Đang giao', value: 'SHIPPED' },
  { label: 'Đã giao', value: 'DELIVERED' },
  { label: 'Đã hủy', value: 'CANCELLED' },
]

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)

const formatDate = (iso: string) => {
  try {
    return format(parseISO(iso), 'dd/MM/yyyy HH:mm', { locale: vi })
  } catch {
    return iso
  }
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['orders', page, 10, statusFilter],
    queryFn: () => orderService.getOrders(page, 10),
  })

  const orders = data?.data?.content ?? []
  const totalPages = data?.data?.totalPages ?? 0
  const totalElements = data?.data?.totalElements ?? 0

  const filtered =
    statusFilter === 'ALL' ? orders : orders.filter((o) => o.status === statusFilter)

  const handleStatusChange = (status: OrderStatus | 'ALL') => {
    setStatusFilter(status)
    setPage(0)
  }

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Đơn hàng của tôi</h1>
          {totalElements > 0 && (
            <p className="text-gray-500 text-sm mt-1">{totalElements} đơn hàng</p>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                statusFilter === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : isError ? (
          <div className="text-center py-16 text-red-600">
            Không thể tải danh sách đơn hàng. Vui lòng thử lại.
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="h-12 w-12 text-gray-300" />}
            title="Chưa có đơn hàng nào"
            description="Bạn chưa có đơn hàng nào. Hãy mua sắm ngay!"
            action={{ label: 'Mua sắm ngay', onClick: () => navigate('/products') }}
          />
        ) : (
          <>
            {/* Orders list */}
            <div className="space-y-3">
              {filtered.map((order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5 cursor-pointer"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">
                          #{order.orderNumber}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDate(order.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-right">
                        <p className="text-sm text-gray-500">
                          {order.itemCount} sản phẩm
                        </p>
                        <p className="font-bold text-gray-900">
                          {formatCurrency(order.totalAmount)}
                        </p>
                      </div>
                      <OrderStatusBadge status={order.status} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/orders/${order.id}`)
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-blue-50 hover:text-blue-600 text-gray-600 rounded-lg text-sm font-medium transition-colors border border-gray-200 hover:border-blue-200"
                      >
                        <Eye className="h-4 w-4" />
                        Xem chi tiết
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </MainLayout>
  )
}
