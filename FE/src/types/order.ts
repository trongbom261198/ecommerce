export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PICKING'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED'

export interface OrderItem {
  id: string
  skuId: string
  productId: string
  productName: string
  skuCode: string
  variantName?: string
  quantity: number
  unitPrice: number
  subtotal: number
  images?: string[]
}

export interface Order {
  id: string
  orderNumber: string
  status: OrderStatus
  subtotal: number
  shippingFee: number
  discountAmount: number
  totalAmount: number
  shippingAddress: Record<string, string>
  paymentMethod: string
  paymentStatus: string
  notes?: string
  items: OrderItem[]
  events?: OrderEvent[]
  createdAt: string
  updatedAt: string
}

export interface OrderSummary {
  id: string
  orderNumber: string
  status: OrderStatus
  totalAmount: number
  itemCount: number
  createdAt: string
}

export interface CartItem {
  skuId: string
  productId: string
  productName: string
  skuCode: string
  variantName?: string
  quantity: number
  unitPrice: number
  images: string[]
}

export interface Cart {
  userId: string
  items: CartItem[]
  subtotal: number
  updatedAt: string
}

export interface OrderEvent {
  eventType: string
  fromStatus?: string
  toStatus?: string
  description?: string
  createdAt: string
}

export interface OrderTracking {
  orderId: string
  orderNumber: string
  status: OrderStatus
  events: OrderEvent[]
  shipmentId?: string
  trackingNumber?: string
  estimatedDelivery?: string
}
