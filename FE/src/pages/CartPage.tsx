import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft, Zap } from 'lucide-react'
import MainLayout from '@/components/layout/MainLayout'
import { orderService } from '@/services/orderService'
import { flashSaleService } from '@/services/flashSaleService'
import { useAuthStore } from '@/store/authStore'
import { useCartStore } from '@/store/cartStore'
import { getImageUrl } from '@/utils/image'
import { useEffect, useMemo } from 'react'

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
})

const FREE_SHIPPING_THRESHOLD = 500_000

export default function CartPage() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setItemCount = useCartStore((s) => s.setItemCount)
  const queryClient = useQueryClient()

  const {
    data: cartResponse,
    isLoading,
  } = useQuery({
    queryKey: ['cart'],
    queryFn: orderService.getCart,
    enabled: isAuthenticated,
  })

  const { data: flashSalesData } = useQuery({
    queryKey: ['active-flash-sales'],
    queryFn: flashSaleService.getActiveSales,
    staleTime: 30_000,
  })

  // Map skuId → flash sale price for quick lookup
  const flashPriceMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const sale of flashSalesData?.data ?? []) {
      for (const item of sale.items) {
        map.set(item.skuId, Number(item.salePrice))
      }
    }
    return map
  }, [flashSalesData])

  const cart = cartResponse?.data

  useEffect(() => {
    if (cart) {
      setItemCount(cart.items?.length ?? 0)
    }
  }, [cart, setItemCount])

  const updateMutation = useMutation({
    mutationFn: ({ skuId, quantity }: { skuId: string; quantity: number }) =>
      orderService.updateCartItem(skuId, quantity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  const removeMutation = useMutation({
    mutationFn: (skuId: string) => orderService.removeFromCart(skuId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  const clearMutation = useMutation({
    mutationFn: orderService.clearCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      setItemCount(0)
    },
  })

  const items = cart?.items ?? []

  // Recalculate subtotal applying flash sale prices where available
  const subtotal = useMemo(() => {
    if (items.length === 0) return cart?.subtotal ?? 0
    return items.reduce((sum, item) => {
      const price = flashPriceMap.get(item.skuId) ?? item.unitPrice
      return sum + price * item.quantity
    }, 0)
  }, [items, flashPriceMap, cart?.subtotal])

  const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 30_000
  const total = subtotal + shippingFee

  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Vui lòng đăng nhập</h2>
          <p className="text-gray-500 mb-6">Đăng nhập để xem giỏ hàng của bạn.</p>
          <Link
            to="/login"
            className="px-6 py-2.5 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors"
          >
            Đăng nhập
          </Link>
        </div>
      </MainLayout>
    )
  }

  if (isLoading) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="animate-pulse space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </MainLayout>
    )
  }

  if (items.length === 0) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <ShoppingBag className="w-20 h-20 text-gray-200 mx-auto mb-5" />
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Giỏ hàng trống</h2>
          <p className="text-gray-500 mb-8">Thêm sản phẩm vào giỏ để bắt đầu mua sắm!</p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Tiếp tục mua sắm
          </Link>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Giỏ hàng ({items.length})</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart items */}
          <div className="lg:col-span-2 space-y-4">
            {/* Clear cart */}
            <div className="flex justify-end">
              <button
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className="text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                Xóa tất cả
              </button>
            </div>

            {items.map((item) => (
              <div
                key={item.skuId}
                className="flex gap-4 bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
              >
                {/* Image */}
                <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                  {item.images?.[0] ? (
                    <img
                      src={getImageUrl(item.images[0])}
                      alt={item.productName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).src =
                          'https://via.placeholder.com/80x80?text=IMG'
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
                      IMG
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/products/${item.productId}`}
                    className="font-medium text-gray-800 hover:text-blue-600 line-clamp-2 text-sm leading-snug"
                  >
                    {item.productName}
                  </Link>
                  {item.variantName && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.variantName}</p>
                  )}
                  {flashPriceMap.has(item.skuId) ? (
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Zap className="w-3.5 h-3.5 text-orange-500 fill-orange-500 flex-shrink-0" />
                      <span className="text-red-500 font-bold text-sm">
                        {vndFormatter.format(flashPriceMap.get(item.skuId)!)}
                      </span>
                      <span className="text-gray-400 text-xs line-through">
                        {vndFormatter.format(item.unitPrice)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-blue-600 font-bold text-sm mt-1">
                      {vndFormatter.format(item.unitPrice)}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-3">
                    {/* Quantity stepper */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (item.quantity > 1) {
                            updateMutation.mutate({ skuId: item.skuId, quantity: item.quantity - 1 })
                          }
                        }}
                        disabled={item.quantity <= 1 || updateMutation.isPending}
                        className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateMutation.mutate({ skuId: item.skuId, quantity: item.quantity + 1 })
                        }
                        disabled={updateMutation.isPending}
                        className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Subtotal */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-800">
                        {vndFormatter.format(
                          (flashPriceMap.get(item.skuId) ?? item.unitPrice) * item.quantity,
                        )}
                      </span>
                      <button
                        onClick={() => removeMutation.mutate(item.skuId)}
                        disabled={removeMutation.isPending}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <Link
              to="/products"
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 mt-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Tiếp tục mua sắm
            </Link>
          </div>

          {/* Order summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sticky top-20">
              <h2 className="text-lg font-bold text-gray-900 mb-5">Tóm tắt đơn hàng</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Tạm tính</span>
                  <span className="font-medium text-gray-800">{vndFormatter.format(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Phí vận chuyển</span>
                  {shippingFee === 0 ? (
                    <span className="text-green-600 font-medium">Miễn phí</span>
                  ) : (
                    <span className="font-medium text-gray-800">
                      {vndFormatter.format(shippingFee)}
                    </span>
                  )}
                </div>
                {shippingFee > 0 && (
                  <p className="text-xs text-gray-400">
                    Mua thêm{' '}
                    <span className="text-blue-600 font-medium">
                      {vndFormatter.format(FREE_SHIPPING_THRESHOLD - subtotal)}
                    </span>{' '}
                    để được miễn phí vận chuyển.
                  </p>
                )}
                <hr className="border-gray-200" />
                <div className="flex justify-between text-base font-bold text-gray-900">
                  <span>Tổng cộng</span>
                  <span className="text-blue-600">{vndFormatter.format(total)}</span>
                </div>
              </div>

              <button
                onClick={() => navigate('/checkout')}
                className="mt-6 w-full py-3 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-colors shadow-md text-sm"
              >
                Thanh toán
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
