import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import MainLayout from '@/components/layout/MainLayout'
import ProductCard from '@/components/product/ProductCard'
import FilterSidebar from '@/components/product/filter-sidebar'
import { productService } from '@/services/productService'

const SORT_OPTIONS = [
  { value: '', label: 'Mặc định' },
  { value: 'basePrice,asc', label: 'Giá thấp → cao' },
  { value: 'basePrice,desc', label: 'Giá cao → thấp' },
  { value: 'avgRating,desc', label: 'Đánh giá cao nhất' },
  { value: 'createdAt,desc', label: 'Mới nhất' },
]

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? undefined
  const category = searchParams.get('category') ?? undefined
  const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined
  const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined
  const brand = searchParams.get('brand') ?? undefined
  const page = Number(searchParams.get('page') ?? 0)
  const sort = searchParams.get('sort') ?? undefined

  const { data: productsResponse, isLoading } = useQuery({
    queryKey: ['products', { q, category, minPrice, maxPrice, brand, page, sort }],
    queryFn: () => productService.getProducts({ q, category, minPrice, maxPrice, brand, page, size: 12, sort }),
  })

  const { data: categoriesResponse } = useQuery({
    queryKey: ['categories'],
    queryFn: productService.getCategories,
  })

  const products = productsResponse?.data?.content ?? []
  const totalPages = productsResponse?.data?.totalPages ?? 0
  const totalElements = productsResponse?.data?.totalElements ?? 0
  const categories = categoriesResponse?.data ?? []

  function setSort(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      value ? next.set('sort', value) : next.delete('sort')
      next.delete('page')
      return next
    })
  }

  function setPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      p === 0 ? next.delete('page') : next.set('page', String(p))
      return next
    })
  }

  // Build active filter tags for display
  const activeFilters: { label: string; key: string }[] = []
  if (q) activeFilters.push({ label: `"${q}"`, key: 'q' })
  if (brand) activeFilters.push({ label: `Hãng: ${brand}`, key: 'brand' })
  if (minPrice || maxPrice) {
    const from = minPrice ? minPrice.toLocaleString('vi-VN') : '0'
    const to = maxPrice ? maxPrice.toLocaleString('vi-VN') : '∞'
    activeFilters.push({ label: `${from}đ – ${to}đ`, key: '_price' })
  }

  function removeFilter(key: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (key === '_price') { next.delete('minPrice'); next.delete('maxPrice') }
      else next.delete(key)
      next.delete('page')
      return next
    })
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6 flex-wrap">
          <Link to="/" className="hover:text-blue-600">Trang chủ</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-800">Sản phẩm</span>
          {q && <><ChevronRight className="w-4 h-4" /><span className="text-gray-800">"{q}"</span></>}
        </nav>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <aside className="w-full lg:w-56 flex-shrink-0">
            <FilterSidebar categories={categories} />
          </aside>

          {/* Main */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-sm text-gray-500">
                {isLoading
                  ? <span className="inline-block h-4 w-32 bg-gray-200 rounded animate-pulse" />
                  : <><span className="font-semibold text-gray-800">{totalElements}</span> sản phẩm</>
                }
              </p>
              <select
                value={sort ?? ''}
                onChange={(e) => setSort(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Active filter tags */}
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {activeFilters.map((f) => (
                  <span
                    key={f.key}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full border border-blue-200"
                  >
                    {f.label}
                    <button onClick={() => removeFilter(f.key)} className="hover:text-red-500 font-bold leading-none">×</button>
                  </span>
                ))}
                <button
                  onClick={() => setSearchParams({})}
                  className="text-xs text-red-500 hover:underline font-medium"
                >
                  Xóa tất cả
                </button>
              </div>
            )}

            {/* Grid */}
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="bg-gray-100 rounded-xl animate-pulse">
                    <div className="aspect-square bg-gray-200 rounded-t-xl" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-4 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-10">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 0}
                      className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: totalPages }).map((_, i) => {
                      if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) {
                        return (
                          <button
                            key={i}
                            onClick={() => setPage(i)}
                            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              i === page ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {i + 1}
                          </button>
                        )
                      }
                      if (Math.abs(i - page) === 2) return <span key={i} className="px-1 text-gray-400">…</span>
                      return null
                    })}
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages - 1}
                      className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Search className="w-16 h-16 text-gray-300 mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Không tìm thấy sản phẩm</h3>
                <p className="text-gray-500 text-sm mb-6">Thử thay đổi từ khóa hoặc điều chỉnh bộ lọc.</p>
                <button
                  onClick={() => setSearchParams({})}
                  className="px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Xóa bộ lọc
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
