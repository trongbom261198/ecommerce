import api from './api'
import type { Cart } from '@/types/order'
import type { ApiResponse } from '@/types/common'

export interface AddCartItemRequest {
  skuId: string
  quantity: number
  price: number
  productName: string
  variantName?: string
}

export const cartService = {
  getCart: () =>
    api.get<ApiResponse<Cart>>('/cart').then((r) => r.data),

  addItem: (
    skuId: string,
    quantity: number,
    price: number,
    productName: string,
    variantName?: string,
  ) =>
    api
      .post<ApiResponse<Cart>>('/cart/items', { skuId, quantity, price, productName, variantName })
      .then((r) => r.data),

  updateItem: (skuId: string, quantity: number) =>
    api.put<ApiResponse<Cart>>(`/cart/items/${skuId}`, { quantity }).then((r) => r.data),

  removeItem: (skuId: string) =>
    api.delete<ApiResponse<Cart>>(`/cart/items/${skuId}`).then((r) => r.data),

  clearCart: () =>
    api.delete<ApiResponse<void>>('/cart').then((r) => r.data),
}
