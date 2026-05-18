import api from './api'
import type { Cart, CartItem, Order, OrderSummary, OrderTracking } from '@/types/order'
import type { ApiResponse, PageResponse } from '@/types/common'

export interface AddToCartRequest {
  skuId: string
  productId?: string
  productName: string
  skuCode?: string
  variantName?: string
  quantity: number
  unitPrice: number
  images?: string[]
}

export interface CheckoutRequest {
  addressId?: string
  addressSnapshot?: Record<string, string>
  paymentMethod: 'COD' | 'BANK_TRANSFER' | 'VNPAY'
  notes?: string
  warehouseId?: string
  flashSaleId?: string
  flashSaleSkuId?: string
}

export const orderService = {
  getCart: () => api.get<ApiResponse<Cart>>('/cart').then((r) => r.data),

  addToCart: (item: AddToCartRequest) =>
    api.post<ApiResponse<Cart>>('/cart/items', item).then((r) => r.data),

  updateCartItem: (skuId: string, quantity: number) =>
    api.put<ApiResponse<Cart>>(`/cart/items/${skuId}`, { quantity }).then((r) => r.data),

  removeFromCart: (skuId: string) =>
    api.delete<ApiResponse<Cart>>(`/cart/items/${skuId}`).then((r) => r.data),

  clearCart: () => api.delete<ApiResponse<void>>('/cart').then((r) => r.data),

  getOrders: (page = 0, size = 10) =>
    api
      .get<ApiResponse<PageResponse<OrderSummary>>>('/orders', { params: { page, size } })
      .then((r) => r.data),

  getOrderById: (id: string) =>
    api.get<ApiResponse<Order>>(`/orders/${id}`).then((r) => r.data),

  checkout: (request: CheckoutRequest) =>
    api.post<ApiResponse<Order>>('/orders/checkout', request).then((r) => r.data),

  cancelOrder: (id: string) =>
    api.put<ApiResponse<Order>>(`/orders/${id}/cancel`).then((r) => r.data),

  getOrderTracking: (id: string) =>
    api.get<ApiResponse<OrderTracking>>(`/orders/${id}/tracking`).then((r) => r.data),
}

export const cartService = {
  getCart: orderService.getCart,
  addToCart: orderService.addToCart,
  updateCartItem: orderService.updateCartItem,
  removeFromCart: orderService.removeFromCart,
  clearCart: orderService.clearCart,
}

export type { CartItem }
