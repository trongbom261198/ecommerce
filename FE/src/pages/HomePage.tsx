import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronRight, Truck, ShieldCheck, RefreshCw, Headphones, Sparkles } from 'lucide-react'
import MainLayout from '@/components/layout/MainLayout'
import ProductCard from '@/components/product/ProductCard'
import FlashSaleBanner from '@/components/home/flash-sale-banner'
import QuickFilterSection from '@/components/home/quick-filter-section'
import { productService } from '@/services/productService'
import { useInView } from '@/hooks/use-in-view'

const TRUST_BADGES = [
  { icon: Truck, label: 'Miễn phí vận chuyển', sub: 'Đơn từ 500.000đ', color: 'text-blue-600', bg: 'bg-blue-50' },
  { icon: ShieldCheck, label: 'Thanh toán an toàn', sub: '100% bảo mật', color: 'text-green-600', bg: 'bg-green-50' },
  { icon: RefreshCw, label: 'Đổi trả dễ dàng', sub: 'Trong vòng 30 ngày', color: 'text-violet-600', bg: 'bg-violet-50' },
  { icon: Headphones, label: 'Hỗ trợ 24/7', sub: 'Chat trực tiếp', color: 'text-orange-600', bg: 'bg-orange-50' },
]

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between mb-7">
      <div className="flex items-center gap-3">
        <div className="w-1 h-7 rounded-full bg-gradient-to-b from-blue-600 to-violet-600" />
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
      </div>
      <Link
        to={href}
        className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-violet-600 transition-colors group"
      >
        Xem tất cả
        <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}

export default function HomePage() {
  const { data: categoriesResponse, isLoading: loadingCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: productService.getCategories,
  })

  const { data: productsResponse, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', { page: 0, size: 8 }],
    queryFn: () => productService.getProducts({ page: 0, size: 8 }),
  })

  const { ref: trustRef, inView: trustVisible } = useInView<HTMLElement>()
  const { ref: catRef, inView: catVisible } = useInView<HTMLElement>()
  const { ref: prodRef, inView: prodVisible } = useInView<HTMLElement>()

  const categories = categoriesResponse?.data ?? []
  const products = productsResponse?.data?.content ?? []

  return (
    <MainLayout>
      {/* ─── Hero Banner ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-violet-700 animated-gradient text-white">
        {/* Decorative floating blobs */}
        <div className="absolute top-[-80px] right-[-60px] w-80 h-80 rounded-full bg-violet-500/30 blur-3xl animate-float pointer-events-none" />
        <div className="absolute bottom-[-60px] left-[-40px] w-64 h-64 rounded-full bg-blue-400/20 blur-3xl animate-float-delay pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-2xl">
            {/* Badge */}
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-blue-100 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 animate-fade-in border border-white/20">
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              Ưu đãi mới nhất đang chờ bạn
            </span>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-5 animate-fade-in-up">
              Mua sắm dễ dàng
              <br />
              <span className="text-blue-200 drop-shadow-sm">Giao hàng nhanh chóng</span>
            </h1>

            <p className="text-blue-100 text-lg mb-8 leading-relaxed max-w-xl animate-fade-in-up delay-150">
              Khám phá hàng ngàn sản phẩm chất lượng với giá tốt nhất. Giao hàng toàn quốc, đổi trả dễ dàng.
            </p>

            <div className="flex flex-wrap gap-3 animate-fade-in-up delay-300">
              <Link
                to="/products"
                className="inline-flex items-center gap-2 bg-white text-blue-700 font-bold px-7 py-3.5 rounded-2xl hover:bg-blue-50 transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 text-sm"
              >
                Mua ngay
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/products"
                className="inline-flex items-center gap-2 border-2 border-white/60 text-white font-semibold px-7 py-3.5 rounded-2xl hover:bg-white/10 hover:border-white transition-all duration-200 text-sm backdrop-blur-sm"
              >
                Khám phá thêm
              </Link>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-8 mt-10 animate-fade-in-up delay-500">
              {[
                { value: '10K+', label: 'Sản phẩm' },
                { value: '50K+', label: 'Khách hàng' },
                { value: '99%', label: 'Hài lòng' },
              ].map(({ value, label }) => (
                <div key={label} className="text-center">
                  <p className="text-2xl font-extrabold text-white">{value}</p>
                  <p className="text-blue-200 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Quick Search & Filter ────────────────────────────────── */}
      <QuickFilterSection />

      {/* ─── Trust Badges ─────────────────────────────────────────── */}
      <section
        ref={trustRef}
        className={`py-8 bg-white border-b border-gray-100 section-hidden ${trustVisible ? 'section-visible' : ''}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {TRUST_BADGES.map(({ icon: Icon, label, sub, color, bg }, i) => (
              <div
                key={label}
                className={`flex items-center gap-3 p-4 rounded-2xl ${bg} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Flash Sale ───────────────────────────────────────────── */}
      <FlashSaleBanner />

      {/* ─── Categories ───────────────────────────────────────────── */}
      <section
        ref={catRef}
        className={`py-12 bg-gray-50/60 section-hidden ${catVisible ? 'section-visible' : ''}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader title="Danh mục nổi bật" href="/products" />

          {loadingCategories ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-28 h-36 bg-gray-200 rounded-2xl shimmer-bg" />
              ))}
            </div>
          ) : categories.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map((cat, i) => (
                <Link
                  key={cat.id}
                  to={`/products?category=${cat.id}`}
                  className="flex-shrink-0 flex flex-col items-center gap-2.5 group"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="w-24 h-24 rounded-2xl bg-white border-2 border-transparent shadow-sm overflow-hidden group-hover:border-blue-400 group-hover:shadow-lg group-hover:shadow-blue-100 transition-all duration-300 group-hover:-translate-y-1">
                    {cat.imageUrl ? (
                      <img
                        src={cat.imageUrl}
                        alt={cat.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-400"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center">
                        <span className="text-2xl font-extrabold text-blue-400">
                          {cat.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-gray-700 text-center max-w-[96px] leading-tight group-hover:text-blue-600 transition-colors">
                    {cat.name}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Chưa có danh mục nào.</p>
          )}
        </div>
      </section>

      {/* ─── Featured Products ────────────────────────────────────── */}
      <section
        ref={prodRef}
        className={`py-12 section-hidden ${prodVisible ? 'section-visible' : ''}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader title="Sản phẩm nổi bật" href="/products" />

          {loadingProducts ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="aspect-square shimmer-bg" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 shimmer-bg rounded w-3/4" />
                    <div className="h-3 shimmer-bg rounded w-1/2" />
                    <div className="h-8 shimmer-bg rounded-xl mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {products.map((product, i) => (
                <div
                  key={product.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-500">
              <p>Chưa có sản phẩm nào.</p>
            </div>
          )}
        </div>
      </section>

      {/* ─── CTA Banner ───────────────────────────────────────────── */}
      <section className="py-12 mx-4 sm:mx-6 lg:mx-8 mb-12 rounded-3xl overflow-hidden bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500 animated-gradient shadow-xl shadow-pink-200">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-white text-center md:text-left">
            <h3 className="text-2xl font-extrabold mb-1">🚀 Miễn phí vận chuyển toàn quốc</h3>
            <p className="text-orange-100 text-sm">Cho đơn hàng từ 500.000đ — áp dụng ngay hôm nay!</p>
          </div>
          <Link
            to="/products"
            className="flex-shrink-0 bg-white text-orange-600 font-bold px-7 py-3 rounded-2xl hover:bg-orange-50 transition-all hover:-translate-y-0.5 hover:shadow-lg text-sm shadow-md"
          >
            Mua sắm ngay →
          </Link>
        </div>
      </section>
    </MainLayout>
  )
}
