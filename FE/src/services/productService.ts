import api from './api'
import type { Product, Category, ProductSearchParams } from '@/types/product'
import type { ApiResponse, PageResponse } from '@/types/common'

export const productService = {
  getProducts: (params?: ProductSearchParams) =>
    api
      .get<ApiResponse<PageResponse<Product>>>('/products', { params })
      .then((r) => r.data),

  getProductById: (id: string) =>
    api.get<ApiResponse<Product>>(`/products/${id}`).then((r) => r.data),

  getProductBySlug: (slug: string) =>
    api.get<ApiResponse<Product>>(`/products/slug/${slug}`).then((r) => r.data),

  getCategories: () =>
    api.get<ApiResponse<Category[]>>('/categories').then((r) => r.data),

  getCategoryById: (id: string) =>
    api.get<ApiResponse<Category>>(`/categories/${id}`).then((r) => r.data),

  getCategoryProducts: (id: string, page = 0, size = 12) =>
    api
      .get<ApiResponse<PageResponse<Product>>>(`/categories/${id}/products`, {
        params: { page, size },
      })
      .then((r) => r.data),

  getBrands: () =>
    api.get<ApiResponse<string[]>>('/products/brands').then((r) => r.data),

  getRelatedProducts: (productId: string, limit = 6) =>
    api
      .get<ApiResponse<Product[]>>(`/products/${productId}/related`, { params: { limit } })
      .then((r) => r.data),

  uploadImage: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api
      .post<ApiResponse<{ url: string }>>('/products/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },
}
