import { useQuery } from '@tanstack/react-query'
import { productService } from '@/services/productService'
import ProductCard from './ProductCard'

interface RelatedProductsProps {
  productId: string
  limit?: number
}

export default function RelatedProducts({ productId, limit = 6 }: RelatedProductsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['related-products', productId],
    queryFn: () => productService.getRelatedProducts(productId, limit),
    staleTime: 60_000,
  })

  const products = data?.data ?? []

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: limit }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square rounded-2xl bg-gray-200 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-3/4 mb-1" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (products.length === 0) return null

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Sản phẩm liên quan</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
