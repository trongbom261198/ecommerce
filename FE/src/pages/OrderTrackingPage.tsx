import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ArrowLeft, Wifi, WifiOff, Package } from 'lucide-react'
import { orderService } from '@/services/orderService'
import { useOrderTracking } from '@/hooks/useOrderTracking'
import MainLayout from '@/components/layout/MainLayout'
import { OrderStatusBadge } from '@/components/order/OrderStatusBadge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import type { OrderStatus } from '@/types/order'

// Fix Leaflet default icon in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const TRACKING_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'PENDING', label: 'Đặt hàng' },
  { status: 'CONFIRMED', label: 'Xác nhận' },
  { status: 'PROCESSING', label: 'Đang xử lý' },
  { status: 'PICKING', label: 'Đang lấy hàng' },
  { status: 'PACKED', label: 'Đã đóng gói' },
  { status: 'SHIPPED', label: 'Đang vận chuyển' },
  { status: 'DELIVERED', label: 'Đã giao' },
]

const STATUS_ORDER: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'PICKING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
]

function getStepIndex(status: OrderStatus): number {
  return STATUS_ORDER.indexOf(status)
}

// Default Vietnam center coordinates
const VIETNAM_CENTER: [number, number] = [16.0, 106.0]
const DEFAULT_WAREHOUSE: [number, number] = [21.0285, 105.8542] // Hanoi
const DEFAULT_DELIVERY: [number, number] = [10.7769, 106.7009] // HCMC

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderService.getOrderById(id!),
    enabled: !!id,
  })

  const { tracking, connected } = useOrderTracking(id ?? null)

  const order = data?.data
  const liveStatus = tracking?.status ?? order?.status
  const currentStepIdx = liveStatus ? getStepIndex(liveStatus) : -1

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </MainLayout>
    )
  }

  if (!order) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <p className="text-red-600 mb-4">Không tìm thấy thông tin đơn hàng.</p>
          <button
            onClick={() => navigate('/orders')}
            className="text-blue-600 hover:underline text-sm"
          >
            Quay lại
          </button>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back */}
        <button
          onClick={() => navigate(`/orders/${id}`)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại chi tiết đơn hàng
        </button>

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Theo dõi giao hàng</h1>
            <p className="text-gray-500 text-sm mt-1">Đơn hàng #{order.orderNumber}</p>
          </div>
          <div className="flex items-center gap-3">
            {liveStatus && <OrderStatusBadge status={liveStatus} />}
            <span
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
                connected
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-gray-50 text-gray-500 border border-gray-200'
              }`}
            >
              {connected ? (
                <><Wifi className="h-3.5 w-3.5" /> Đang kết nối</>
              ) : (
                <><WifiOff className="h-3.5 w-3.5" /> Đã ngắt kết nối</>
              )}
            </span>
          </div>
        </div>

        {/* Live status banner */}
        {tracking && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <p className="text-sm text-blue-700 font-medium">
              Cập nhật mới: trạng thái đơn hàng đã chuyển sang{' '}
              <strong>{tracking.status}</strong>
            </p>
          </div>
        )}

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Tracking timeline stepper */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Tiến trình giao hàng
            </h2>

            <div className="relative">
              {TRACKING_STEPS.map((step, idx) => {
                const isCompleted = idx <= currentStepIdx
                const isCurrent = idx === currentStepIdx
                const isLast = idx === TRACKING_STEPS.length - 1

                return (
                  <div key={step.status} className="flex items-start gap-4 relative">
                    {/* Connector line */}
                    {!isLast && (
                      <div
                        className={`absolute left-4 top-8 w-0.5 h-8 -translate-x-0.5 ${
                          idx < currentStepIdx ? 'bg-green-400' : 'bg-gray-200'
                        }`}
                      />
                    )}

                    {/* Dot */}
                    <div
                      className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center z-10 border-2 transition-all ${
                        isCurrent
                          ? 'border-green-500 bg-green-500 text-white scale-110'
                          : isCompleted
                          ? 'border-green-400 bg-green-400 text-white'
                          : 'border-gray-200 bg-gray-50 text-gray-400'
                      }`}
                    >
                      {isCompleted ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-xs font-bold">{idx + 1}</span>
                      )}
                    </div>

                    {/* Label */}
                    <div className="pb-8 pt-1">
                      <p
                        className={`text-sm font-medium ${
                          isCurrent
                            ? 'text-green-700'
                            : isCompleted
                            ? 'text-gray-800'
                            : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                        {isCurrent && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                            Hiện tại
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Tracking number */}
            {(tracking?.trackingNumber || tracking?.shipmentId) && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                {tracking.trackingNumber && (
                  <p className="text-gray-600">
                    <span className="font-medium">Mã vận đơn: </span>
                    {tracking.trackingNumber}
                  </p>
                )}
                {tracking.estimatedDelivery && (
                  <p className="text-gray-600 mt-1">
                    <span className="font-medium">Dự kiến giao: </span>
                    {tracking.estimatedDelivery}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: Map */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Bản đồ giao hàng</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Vị trí kho hàng và địa chỉ nhận hàng
              </p>
            </div>
            <div className="h-96 w-full">
              <MapContainer
                center={VIETNAM_CENTER}
                zoom={6}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={DEFAULT_WAREHOUSE}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold">Kho hàng</p>
                      <p className="text-gray-600">Hà Nội</p>
                    </div>
                  </Popup>
                </Marker>
                <Marker position={DEFAULT_DELIVERY}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold">Địa chỉ giao hàng</p>
                      <p className="text-gray-600">
                        {order.shippingAddress?.province ?? 'Thành phố Hồ Chí Minh'}
                      </p>
                    </div>
                  </Popup>
                </Marker>
                <Polyline
                  positions={[DEFAULT_WAREHOUSE, DEFAULT_DELIVERY]}
                  color="#3b82f6"
                  weight={3}
                  dashArray="8, 8"
                />
              </MapContainer>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
