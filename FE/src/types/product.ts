export interface Category {
  id: string
  parentId?: string
  name: string
  slug: string
  description?: string
  imageUrl?: string
  children?: Category[]
}

export interface Sku {
  id: string
  skuCode: string
  variantName?: string
  attributes: Record<string, string>
  price: number
  costPrice?: number
  weightGrams?: number
  active: boolean
}

export interface SkuRequest {
  skuCode: string
  variantName?: string
  attributes?: Record<string, string>
  price: number
  costPrice?: number
  weightGrams?: number
  active: boolean
}

export interface Product {
  id: string
  categoryId?: string
  categoryName?: string
  name: string
  slug: string
  description?: string
  brand?: string
  basePrice: number
  status: 'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK' | 'DELETED'
  attributes: Record<string, unknown>
  images: string[]
  skus: Sku[]
  createdAt: string
  avgRating?: number
  reviewCount?: number
}

export interface ProductSearchParams {
  q?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  brand?: string
  page?: number
  size?: number
  sort?: string
}
