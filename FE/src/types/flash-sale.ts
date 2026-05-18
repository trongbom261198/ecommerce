export type FlashSaleStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
export type DiscountType = 'PERCENTAGE' | 'FIXED'

export interface FlashSaleItem {
  id: string
  skuId: string
  productId: string
  productName: string
  originalPrice: number
  salePrice: number
  quota: number
  sold: number
  remaining: number
}

export interface FlashSale {
  id: string
  name: string
  description: string | null
  status: FlashSaleStatus
  discountType: DiscountType
  discountValue: number
  maxQuantity: number | null
  soldQuantity: number
  startTime: string
  endTime: string
  createdAt: string
  items: FlashSaleItem[]
}

export interface FlashSaleItemRequest {
  skuId: string
  productId: string
  productName: string
  originalPrice: number
  salePrice: number
  quota: number
}

export interface FlashSaleRequest {
  name: string
  description?: string
  discountType: DiscountType
  discountValue: number
  maxQuantity?: number
  startTime: string
  endTime: string
  items: FlashSaleItemRequest[]
}
