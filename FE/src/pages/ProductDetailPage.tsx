import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, ChevronRight, Minus, Plus, AlertCircle, Zap } from 'lucide-react'
import MainLayout from '@/components/layout/MainLayout'
import { productService } from '@/services/productService'
import { flashSaleService } from '@/services/flashSaleService'
import { reviewService } from '@/services/review-service'
import { useCart } from '@/hooks/useCart'
import { useAuthStore } from '@/store/authStore'
import type { Sku } from '@/types/product'
import type { ReviewResponse } from '@/types/review'
import type { FlashSale, FlashSaleItem } from '@/types/flash-sale'
import { getImageUrl } from '@/utils/image'
import dayjs from 'dayjs'
import ReviewSummary from '@/components/review/ReviewSummary'
import ReviewForm from '@/components/review/ReviewForm'
import ReviewList from '@/components/review/ReviewList'
import RelatedProducts from '@/components/product/RelatedProducts'

const vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

function useCountdown(endTime: string | undefined) {
  const [secs, setSecs] = useState(() =>
    endTime ? Math.max(0, dayjs(endTime).diff(dayjs(), 'second')) : 0
  )
  useEffect(() => {
    if (!endTime) return
    const calc = () => Math.max(0, dayjs(endTime).diff(dayjs(), 'second'))
    setSecs(calc())
    const id = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(id)
  }, [endTime])
  return `${String(Math.floor(secs / 3600)).padStart(2, '0')}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
}

function FlashSaleBlock({ sale, item }: { sale: FlashSale; item: FlashSaleItem }) {
  const countdown = useCountdown(sale.endTime)
  const discountPct = item.originalPrice > 0
    ? Math.round((1 - Number(item.salePrice) / Number(item.originalPrice)) * 100)
    : 0
  const progress = item.quota > 0 ? Math.min(100, (item.sold / item.quota) * 100) : 0

  return (
    <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-red-50 to-orange-50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-orange-500 fill-orange-500" />
          <span className="text-sm font-bold text-red-600 uppercase tracking-wide">Flash Sale</span>
          {sale.name && (
            <span className="text-xs text-gray-500">— {sale.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Kết thúc sau:</span>
          <span className="bg-gray-900 text-white font-mono font-bold text-xs px-2 py-0.5 rounded">
            {countdown}
          </span>
        </div>
      </div>

      {/* Prices */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-3xl font-bold text-red-600">
          {vndFormatter.format(Number(item.salePrice))}
        </span>
        <span className="text-lg text-gray-400 line-through">
          {vndFormatter.format(Number(item.originalPrice))}
        </span>
        {discountPct > 0 && (
          <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
            -{discountPct}%
          </span>
        )}
      </div>

      {/* Sold progress bar */}
      <div className="space-y-1">
        <div className="relative h-5 bg-orange-100 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-400 to-red-500"
            style={{ width: `${Math.max(progress, 6)}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white drop-shadow">
            {progress >= 70 ? 'Đang bán chạy' : `Đã bán ${item.sold}/${item.quota}`}
          </span>
        </div>
        <p className="text-xs text-orange-600 font-medium">Còn {item.remaining} sản phẩm</p>
      </div>
    </div>
  )
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const { user } = useAuthStore()

  const [selectedSku, setSelectedSku] = useState<Sku | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [activeImage, setActiveImage] = useState(0)
  const [addedMessage, setAddedMessage] = useState('')
  const [editingReview, setEditingReview] = useState<ReviewResponse | null>(null)

  const { data: productResponse, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productService.getProductById(id!),
    enabled: !!id,
  })

  const { data: flashSalesData } = useQuery({
    queryKey: ['active-flash-sales'],
    queryFn: flashSaleService.getActiveSales,
    staleTime: 30_000,
  })

  const product = productResponse?.data

  // Build skuId -> { sale, item } map filtered to this product
  const flashSaleMap = useMemo(() => {
    const map = new Map<string, { sale: FlashSale; item: FlashSaleItem }>()
    for (const sale of flashSalesData?.data ?? []) {
      for (const item of sale.items) {
        if (item.productId === id) map.set(item.skuId, { sale, item })
      }
    }
    return map
  }, [flashSalesData, id])

  const activeSku = selectedSku ?? product?.skus[0]
  const flashEntry = activeSku ? flashSaleMap.get(activeSku.id) : null

  const reviewSectionRef = useRef<HTMLDivElement>(null)

  const { data: reviewSummaryData } = useQuery({
    queryKey: ['review-summary', id],
    queryFn: () => reviewService.getSummary(id!),
    enabled: !!id,
    staleTime: 30_000,
  })
  const reviewSummary = reviewSummaryData?.data

  // Attribute selection logic
  const attributeKeys = product
    ? Array.from(new Set(product.skus.flatMap((s) => Object.keys(s.attributes))))
    : []

  const selectedAttrs: Record<string, string> = selectedSku?.attributes ?? {}

  function getSkuForSelection(attrs: Record<string, string>): Sku | undefined {
    return product?.skus.find((s) =>
      Object.entries(attrs).every(([k, v]) => s.attributes[k] === v),
    )
  }

  function handleAttrSelect(key: string, value: string) {
    const newAttrs = { ...selectedAttrs, [key]: value }
    const matched = getSkuForSelection(newAttrs)
    if (matched) setSelectedSku(matched)
    else {
      const partial = product?.skus.find((s) => s.attributes[key] === value)
      setSelectedSku(partial ?? null)
    }
    setQuantity(1)
  }

  function getAttrValues(key: string): string[] {
    if (!product) return []
    return Array.from(new Set(product.skus.map((s) => s.attributes[key]).filter(Boolean)))
  }

  function handleAddToCart() {
    if (!product) return
    const sku = selectedSku ?? product.skus[0]
    if (!sku) return
    addItem.mutate(
      {
        skuId: sku.id,
        productId: product.id,
        productName: product.name,
        skuCode: sku.skuCode,
        variantName: sku.variantName,
        quantity,
        unitPrice: sku.price,
        images: product.images,
      },
      {
        onSuccess: () => {
          setAddedMessage('Đã thêm vào giỏ hàng!')
          setTimeout(() => setAddedMessage(''), 3000)
        },
      },
    )
  }

  const displayPrice = flashEntry
    ? Number(flashEntry.item.salePrice)
    : (selectedSku ?? product?.skus[0])?.price ?? product?.basePrice ?? 0

  if (isLoading) {
    return (
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-pulse">
            <div className="aspect-square bg-gray-200 rounded-2xl" />
            <div className="space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/3" />
              <div className="h-8 bg-gray-200 rounded w-3/4" />
              <div className="h-10 bg-gray-200 rounded w-1/2" />
              <div className="h-4 bg-gray-200 rounded w-full" />
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!product) {
    return (
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Không tìm thấy sản phẩm</h2>
          <p className="text-gray-500 mb-6">Sản phẩm này không tồn tại hoặc đã bị xóa.</p>
          <button
            onClick={() => navigate('/products')}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors"
          >
            Quay lại danh sách
          </button>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6 flex-wrap">
          <Link to="/" className="hover:text-blue-600">Trang chủ</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/products" className="hover:text-blue-600">Sản phẩm</Link>
          {product.categoryName && (
            <>
              <ChevronRight className="w-4 h-4" />
              <Link to={`/products?category=${product.categoryId}`} className="hover:text-blue-600">
                {product.categoryName}
              </Link>
            </>
          )}
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-800 font-medium truncate max-w-[200px]">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Images */}
          <div>
            <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100 mb-3">
              {product.images[activeImage] ? (
                <img
                  src={getImageUrl(product.images[activeImage])}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src =
                      'https://via.placeholder.com/600x600?text=No+Image'
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {product.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                      i === activeImage ? 'border-blue-500' : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <img src={getImageUrl(img)} alt={`${product.name} ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col gap-5">
            {product.brand && (
              <p className="text-sm text-gray-400 uppercase tracking-wide font-medium">{product.brand}</p>
            )}
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">{product.name}</h1>

            {/* Price — flash sale overrides regular */}
            {flashEntry ? (
              <FlashSaleBlock sale={flashEntry.sale} item={flashEntry.item} />
            ) : (
              <p className="text-3xl font-bold text-blue-600">{vndFormatter.format(displayPrice)}</p>
            )}

            {/* SKU attributes */}
            {attributeKeys.map((key) => (
              <div key={key}>
                <p className="text-sm font-semibold text-gray-700 mb-2 capitalize">{key}</p>
                <div className="flex flex-wrap gap-2">
                  {getAttrValues(key).map((val) => {
                    const isSelected = selectedAttrs[key] === val
                    // Check if any SKU with this attr value has a flash sale
                    const skuWithThisVal = product.skus.find((s) => s.attributes[key] === val)
                    const hasFlash = skuWithThisVal ? flashSaleMap.has(skuWithThisVal.id) : false
                    return (
                      <button
                        key={val}
                        onClick={() => handleAttrSelect(key, val)}
                        className={`relative px-4 py-1.5 rounded-full text-sm border-2 transition-colors font-medium ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 text-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {val}
                        {hasFlash && (
                          <Zap className="w-3 h-3 text-orange-500 fill-orange-500 inline ml-1 -mt-0.5" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Quantity */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Số lượng</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                  <Minus className="w-4 h-4 text-gray-600" />
                </button>
                <span className="w-10 text-center text-lg font-semibold">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleAddToCart}
                disabled={
                  product.status === 'OUT_OF_STOCK' ||
                  product.status === 'DELETED' ||
                  addItem.isPending
                }
                className="flex items-center justify-center gap-2 flex-1 py-3 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
              >
                <ShoppingCart className="w-5 h-5" />
                {addItem.isPending ? 'Đang thêm...' : 'Thêm vào giỏ hàng'}
              </button>
              <Link
                to="/cart"
                className="flex items-center justify-center gap-2 flex-1 py-3 border-2 border-blue-600 text-blue-600 rounded-full font-semibold hover:bg-blue-50 transition-colors"
              >
                Xem giỏ hàng
              </Link>
            </div>

            {addedMessage && (
              <p className="text-green-600 text-sm font-medium">{addedMessage}</p>
            )}
            {product.status === 'OUT_OF_STOCK' && (
              <p className="text-red-500 text-sm font-medium">Sản phẩm tạm hết hàng.</p>
            )}

            {product.description && (
              <div className="border-t border-gray-200 pt-5">
                <h3 className="text-base font-semibold text-gray-800 mb-3">Mô tả sản phẩm</h3>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Related Products ────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <RelatedProducts productId={product.id} />
      </div>

      {/* ── Reviews ─────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={reviewSectionRef} className="mt-10 border-t border-gray-100 pt-8 space-y-6">
          <h2 className="text-xl font-bold text-gray-900">Đánh giá sản phẩm</h2>

          {reviewSummary && (
            <ReviewSummary
              summary={reviewSummary}
              onWriteReview={() =>
                reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
              }
            />
          )}

          {editingReview ? (
            <ReviewForm
              productId={product.id}
              reviewId={editingReview.id}
              initialRating={editingReview.rating}
              initialComment={editingReview.comment ?? ''}
              onCancel={() => setEditingReview(null)}
              onSuccess={() => setEditingReview(null)}
            />
          ) : (
            reviewSummary?.canReview && <ReviewForm productId={product.id} />
          )}

          <ReviewList
            productId={product.id}
            currentUserId={user?.id}
            currentUserRole={user?.role}
            onEdit={setEditingReview}
          />
        </div>
      </div>
    </MainLayout>
  )
}
