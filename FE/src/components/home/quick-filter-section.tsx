import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Tag, DollarSign } from 'lucide-react'
import { productService } from '@/services/productService'

const PRICE_RANGES = [
  { label: 'Dưới 200k', maxPrice: 200000 },
  { label: '200k – 500k', minPrice: 200000, maxPrice: 500000 },
  { label: '500k – 2 triệu', minPrice: 500000, maxPrice: 2000000 },
  { label: '2 – 5 triệu', minPrice: 2000000, maxPrice: 5000000 },
  { label: 'Trên 5 triệu', minPrice: 5000000 },
]

export default function QuickFilterSection() {
  const navigate = useNavigate()

  const { data: brandsData } = useQuery({
    queryKey: ['brands'],
    queryFn: productService.getBrands,
    staleTime: 300_000,
  })
  const brands = (brandsData?.data ?? []).slice(0, 10)

  function goPrice(min?: number, max?: number) {
    const params = new URLSearchParams()
    if (min) params.set('minPrice', String(min))
    if (max) params.set('maxPrice', String(max))
    navigate(`/products?${params.toString()}`)
  }

  function goBrand(brand: string) {
    navigate(`/products?brand=${encodeURIComponent(brand)}`)
  }

  return (
    <section className="bg-white border-b border-gray-100 py-6 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        {/* Price ranges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">
            <DollarSign className="w-3.5 h-3.5" />
            Khoảng giá
          </span>
          {PRICE_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => goPrice(r.minPrice, r.maxPrice)}
              className="px-3.5 py-1.5 text-sm font-medium rounded-full border border-gray-200 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150"
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Brands */}
        {brands.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">
              <Tag className="w-3.5 h-3.5" />
              Thương hiệu
            </span>
            {brands.map((brand) => (
              <button
                key={brand}
                onClick={() => goBrand(brand)}
                className="px-3.5 py-1.5 text-sm font-medium rounded-full border border-gray-200 text-gray-700 hover:border-violet-500 hover:text-violet-600 hover:bg-violet-50 transition-all duration-150"
              >
                {brand}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
