import { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react'
import { flashSaleService } from '@/services/flashSaleService'
import { productService } from '@/services/productService'
import { getImageUrl } from '@/utils/image'
import type { FlashSale, FlashSaleItem } from '@/types/flash-sale'
import dayjs from 'dayjs'

function useCountdown(endTime: string) {
  const [secs, setSecs] = useState(() =>
    Math.max(0, dayjs(endTime).diff(dayjs(), 'second'))
  )
  useEffect(() => {
    const calc = () => Math.max(0, dayjs(endTime).diff(dayjs(), 'second'))
    setSecs(calc())
    const id = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(id)
  }, [endTime])
  return {
    h: Math.floor(secs / 3600),
    m: Math.floor((secs % 3600) / 60),
    s: secs % 60,
    expired: secs === 0,
  }
}

function FlipDigit({ value }: { value: number }) {
  const display = String(value).padStart(2, '0')
  const [prev, setPrev] = useState(display)
  const [flipping, setFlipping] = useState(false)

  useEffect(() => {
    if (display !== prev) {
      setFlipping(true)
      const t = setTimeout(() => {
        setPrev(display)
        setFlipping(false)
      }, 300)
      return () => clearTimeout(t)
    }
  }, [display, prev])

  return (
    <div className="relative perspective inline-block">
      <div
        className={`w-10 h-10 bg-gray-900 text-white font-mono font-extrabold text-lg flex items-center justify-center rounded-lg shadow-inner transition-transform duration-300 ${
          flipping ? 'scale-y-0' : 'scale-y-100'
        }`}
        style={{ transformOrigin: 'center' }}
      >
        {flipping ? prev : display}
      </div>
      {/* Bottom shine line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/10 rounded-b-lg" />
    </div>
  )
}

function CountdownDisplay({ h, m, s }: { h: number; m: number; s: number }) {
  return (
    <div className="flex items-center gap-1">
      <FlipDigit value={h} />
      <span className="text-white font-extrabold text-lg leading-none pb-0.5 opacity-70">:</span>
      <FlipDigit value={m} />
      <span className="text-white font-extrabold text-lg leading-none pb-0.5 opacity-70">:</span>
      <FlipDigit value={s} />
    </div>
  )
}

function FlashItemCard({ item, imageUrl }: { item: FlashSaleItem; imageUrl: string }) {
  const discountPct = item.originalPrice > 0
    ? Math.round((1 - item.salePrice / item.originalPrice) * 100)
    : 0
  const progress = item.quota > 0 ? Math.min(100, (item.sold / item.quota) * 100) : 0
  const hotSelling = progress >= 70

  return (
    <Link
      to={`/products/${item.productId}`}
      className="flex-shrink-0 w-40 sm:w-44 bg-white rounded-2xl overflow-hidden border border-orange-100 hover:shadow-lg hover:shadow-orange-100 hover:-translate-y-1 transition-all duration-300 group"
    >
      {/* Image */}
      <div className="relative w-full aspect-square bg-orange-50 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.productName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-orange-200">
            <Zap className="w-12 h-12" />
          </div>
        )}
        {discountPct > 0 && (
          <div className="absolute top-0 right-0 bg-gradient-to-bl from-red-600 to-orange-500 text-white text-[11px] font-extrabold px-2 py-1 rounded-bl-xl shadow-sm">
            -{discountPct}%
          </div>
        )}
        {hotSelling && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-red-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            🔥 Hot
          </div>
        )}
      </div>

      {/* Name */}
      <div className="px-2.5 pt-2">
        <p className="text-xs text-gray-600 font-medium line-clamp-1">{item.productName}</p>
      </div>

      {/* Price */}
      <div className="px-2.5 pt-1 pb-0.5">
        <p className="text-orange-600 font-extrabold text-base leading-tight">
          {Number(item.salePrice).toLocaleString('vi-VN')}₫
        </p>
        {discountPct > 0 && (
          <p className="text-gray-400 text-xs line-through leading-tight">
            {Number(item.originalPrice).toLocaleString('vi-VN')}₫
          </p>
        )}
      </div>

      {/* Sold progress bar */}
      <div className="px-2.5 pb-3 pt-1.5">
        <div className="relative h-4 bg-orange-100 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-400 to-red-500 transition-all duration-500"
            style={{ width: `${Math.max(progress, 6)}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow">
            {hotSelling ? 'Đang bán chạy' : `${item.sold} đã bán`}
          </span>
        </div>
      </div>
    </Link>
  )
}

function FlashSaleSlider({ sale }: { sale: FlashSale }) {
  const { h, m, s, expired } = useCountdown(sale.endTime)
  const scrollRef = useRef<HTMLDivElement>(null)

  const productIds = useMemo(
    () => [...new Set(sale.items.map((i) => i.productId))],
    [sale.items]
  )

  const productQueries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ['product', id],
      queryFn: () => productService.getProductById(id),
      staleTime: 300_000,
    })),
  })

  const imageMap = useMemo(() => {
    const map = new Map<string, string>()
    productIds.forEach((id, i) => {
      const img = productQueries[i]?.data?.data?.images?.[0]
      if (img) map.set(id, getImageUrl(img))
    })
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productQueries])

  const scroll = (dir: 'left' | 'right') =>
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -380 : 380, behavior: 'smooth' })

  if (expired || !sale.items.length) return null

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-md shadow-orange-100/50 border border-orange-100">
      {/* Header strip */}
      <div className="relative bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 px-5 py-3.5 flex items-center gap-3 overflow-hidden">
        {/* Animated shimmer overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent shimmer-bg opacity-30" />

        <div className="flex items-center gap-2 relative">
          <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300 animate-pulse" />
          <Zap className="w-4 h-4 text-yellow-200 fill-yellow-200 animate-pulse delay-200 -ml-2" />
          <span className="font-black text-white text-lg tracking-widest uppercase drop-shadow">
            Flash Sale
          </span>
        </div>

        {sale.name && (
          <span className="text-orange-100 text-xs font-medium hidden sm:inline">— {sale.name}</span>
        )}

        {/* Countdown */}
        <div className="flex items-center gap-2 ml-2 relative">
          <span className="text-orange-100 text-xs font-medium hidden sm:inline">Kết thúc sau</span>
          <CountdownDisplay h={h} m={m} s={s} />
        </div>

        <div className="flex-1" />

        <Link
          to="/products"
          className="relative text-white/90 text-sm font-semibold hover:text-white flex items-center gap-0.5 whitespace-nowrap bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-full hover:bg-white/25 transition-all"
        >
          Xem tất cả <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Slider area */}
      <div className="relative group px-4 py-4">
        <button
          onClick={() => scroll('left')}
          aria-label="Trước"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white rounded-full shadow-lg border border-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-blue-50 hover:border-blue-200 hover:scale-110"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>

        <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth">
          {sale.items.map((item) => (
            <FlashItemCard key={item.id} item={item} imageUrl={imageMap.get(item.productId) ?? ''} />
          ))}
        </div>

        <button
          onClick={() => scroll('right')}
          aria-label="Tiếp"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white rounded-full shadow-lg border border-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-blue-50 hover:border-blue-200 hover:scale-110"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    </div>
  )
}

export default function FlashSaleBanner() {
  const { data } = useQuery({
    queryKey: ['active-flash-sales'],
    queryFn: flashSaleService.getActiveSales,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const sales = (data?.data ?? []).filter((s) => s.items.length > 0)
  if (!sales.length) return null

  return (
    <section className="py-8 bg-gradient-to-b from-orange-50/60 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        {sales.map((sale) => (
          <FlashSaleSlider key={sale.id} sale={sale} />
        ))}
      </div>
    </section>
  )
}
