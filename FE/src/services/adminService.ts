import api from './api'
import type { Order, OrderStatus } from '@/types/order'
import type { Product, Category, Sku, SkuRequest } from '@/types/product'
import type { ApiResponse, PageResponse } from '@/types/common'
import type {
  FlashSale,
  FlashSaleRequest,
} from '@/types/flash-sale'

export interface InventoryItem {
  id: string
  skuId: string
  skuCode: string
  productName: string
  warehouseId: string
  warehouseName: string
  quantityOnHand: number
  quantityReserved: number
  availableQuantity: number
  safetyStock: number
}

export interface DashboardStats {
  totalOrders: number
  totalRevenue: number
  totalProducts: number
  totalUsers: number
  ordersByStatus: Record<string, number>
}

export interface RevenueData {
  date: string
  revenue: number
  orders: number
}

export interface AdminUser {
  id: string
  email: string
  phone: string | null
  fullName: string
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'DRIVER'
  enabled: boolean
  emailVerified: boolean
  createdAt: string
}

export interface AdminStatsResponse {
  totalUsers: number
  customerCount: number
  adminCount: number
  staffCount: number
  driverCount: number
  enabledCount: number
}

export interface AdminOrderStatsResponse {
  totalOrders: number
  totalRevenue: number
  ordersByStatus: Record<string, number>
  todayOrders: number
  todayRevenue: number
}

export const adminService = {
  getDashboardStats: () =>
    api.get<ApiResponse<DashboardStats>>('/admin/dashboard/stats').then((r) => r.data),

  getRevenueData: (days = 7) =>
    api
      .get<ApiResponse<RevenueData[]>>('/admin/dashboard/revenue', { params: { days } })
      .then((r) => r.data),

  getAllOrders: (page = 0, size = 10, status?: OrderStatus) =>
    api
      .get<ApiResponse<PageResponse<Order>>>('/admin/orders', {
        params: { page, size, status },
      })
      .then((r) => r.data),

  updateOrderStatus: (id: string, status: OrderStatus) =>
    api.put<ApiResponse<Order>>(`/admin/orders/${id}/status`, { status }).then((r) => r.data),

  getOrderStats: () =>
    api.get<ApiResponse<AdminOrderStatsResponse>>('/admin/orders/stats').then((r) => r.data),

  getInventory: (page = 0, size = 20) =>
    api
      .get<ApiResponse<PageResponse<InventoryItem>>>('/inventory', {
        params: { page, size },
      })
      .then((r) => r.data),

  adjustStock: (skuId: string, warehouseId: string, quantityDelta: number, reason: string) =>
    api
      .post<ApiResponse<InventoryItem>>('/inventory/adjust', {
        skuId,
        warehouseId,
        quantityDelta,
        reason,
      })
      .then((r) => r.data),

  getProducts: (page = 0, size = 20) =>
    api
      .get<ApiResponse<PageResponse<Product>>>('/products', { params: { page, size } })
      .then((r) => r.data),

  searchProducts: (q: string, size = 10) =>
    api
      .get<ApiResponse<PageResponse<Product>>>('/products', { params: { q, size, page: 0 } })
      .then((r) => r.data),

  getProductSkus: (productId: string) =>
    api.get<ApiResponse<Sku[]>>(`/products/${productId}/skus`).then((r) => r.data),

  createSku: (productId: string, data: SkuRequest) =>
    api.post<ApiResponse<Sku>>(`/products/${productId}/skus`, data).then((r) => r.data),

  updateSku: (productId: string, skuId: string, data: SkuRequest) =>
    api.put<ApiResponse<Sku>>(`/products/${productId}/skus/${skuId}`, data).then((r) => r.data),

  deleteSku: (productId: string, skuId: string) =>
    api.delete<ApiResponse<void>>(`/products/${productId}/skus/${skuId}`).then((r) => r.data),

  createProduct: (data: Partial<Product>) =>
    api.post<ApiResponse<Product>>('/products', data).then((r) => r.data),

  updateProduct: (id: string, data: Partial<Product>) =>
    api.put<ApiResponse<Product>>(`/products/${id}`, data).then((r) => r.data),

  deleteProduct: (id: string) =>
    api.delete<ApiResponse<void>>(`/products/${id}`).then((r) => r.data),

  getUserStats: () =>
    api.get<ApiResponse<AdminStatsResponse>>('/admin/stats').then((r) => r.data),

  getAllUsers: (page = 0, size = 20) =>
    api
      .get<ApiResponse<PageResponse<AdminUser>>>('/admin/users', { params: { page, size } })
      .then((r) => r.data),

  updateUserRole: (id: string, role: AdminUser['role']) =>
    api.put<ApiResponse<AdminUser>>(`/admin/users/${id}/role`, { role }).then((r) => r.data),

  updateUserStatus: (id: string, enabled: boolean) =>
    api
      .put<ApiResponse<AdminUser>>(`/admin/users/${id}/status`, { enabled })
      .then((r) => r.data),

  createCategory: (data: Partial<Category>) =>
    api.post<ApiResponse<Category>>('/categories', data).then((r) => r.data),

  updateCategory: (id: string, data: Partial<Category>) =>
    api.put<ApiResponse<Category>>(`/categories/${id}`, data).then((r) => r.data),

  deleteCategory: (id: string) =>
    api.delete<ApiResponse<void>>(`/categories/${id}`).then((r) => r.data),

  // Flash Sales
  getFlashSales: (page = 0, size = 20) =>
    api
      .get<ApiResponse<PageResponse<FlashSale>>>('/admin/flash-sales', { params: { page, size } })
      .then((r) => r.data),

  getFlashSaleById: (id: string) =>
    api.get<ApiResponse<FlashSale>>(`/admin/flash-sales/${id}`).then((r) => r.data),

  createFlashSale: (data: FlashSaleRequest) =>
    api.post<ApiResponse<FlashSale>>('/admin/flash-sales', data).then((r) => r.data),

  updateFlashSale: (id: string, data: FlashSaleRequest) =>
    api.put<ApiResponse<FlashSale>>(`/admin/flash-sales/${id}`, data).then((r) => r.data),

  activateFlashSale: (id: string) =>
    api.post<ApiResponse<FlashSale>>(`/admin/flash-sales/${id}/activate`).then((r) => r.data),

  endFlashSale: (id: string) =>
    api.post<ApiResponse<FlashSale>>(`/admin/flash-sales/${id}/end`).then((r) => r.data),

  cancelFlashSale: (id: string) =>
    api.delete<ApiResponse<void>>(`/admin/flash-sales/${id}`).then((r) => r.data),
}
