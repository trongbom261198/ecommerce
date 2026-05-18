import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Heart } from 'lucide-react'
import type { Product } from '@/types/product'
import { useCart } from '@/hooks/useCart'
import { getImageUrl } from '@/utils/image'
import StarRating from '@/components/review/StarRating'

interface ProductCardProps {
  product: Product
}

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
})

export default function ProductCard({ product }: ProductCardProps) {
  const navigate = useNavigate()
  const { addItem } = useCart()
  const [wishlisted, setWishlisted] = useState(false)
  const [justAdded, setJustAdded] = useState(false)

  const firstSku = product.skus?.[0]
  const displayPrice = firstSku?.price ?? product.basePrice
  const imageUrl = getImageUrl(product.images?.[0])
  const isOutOfStock = product.status === 'OUT_OF_STOCK'

  function handleAddToCart(e: React.MouseEvent) {
    e.stopPropagation()
    if (!firstSku || isOutOfStock) return
    addItem.mutate(
      {
        skuId: firstSku.id,
        productId: product.id,
        productName: product.name,
        skuCode: firstSku.skuCode,
        variantName: firstSku.variantName,
        quantity: 1,
        unitPrice: firstSku.price,
        images: product.images,
      },
      {
        onSuccess: () => {
          setJustAdded(true)
          setTimeout(() => setJustAdded(false), 1800)
        },
      },
    )
  }

  function handleWishlist(e: React.MouseEvent) {
    e.stopPropagation()
    setWishlisted((v) => !v)
  }

  return (
    <div
      onClick={() => navigate(`/products/${product.id}`)}
      className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-gray-200/60 hover:-translate-y-1.5 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-gray-50">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
            onError={(e) => {
              ;(e.target as HTMLImageElement).src =
                'https://via.placeholder.com/300x300?text=No+Image'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-200 bg-gradient-to-br from-gray-50 to-gray-100">
            <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Out of stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
            <span className="bg-white/90 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full shadow">
              Hết hàng
            </span>
          </div>
        )}

        {/* Wishlist button — revealed on hover */}
        <button
          onClick={handleWishlist}
          aria-label="Yêu thích"
          className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 shadow-md ${
            wishlisted
              ? 'bg-red-500 text-white scale-110'
              : 'bg-white/80 backdrop-blur-sm text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
          }`}
        >
          <Heart className={`w-4 h-4 ${wishlisted ? 'fill-white' : ''}`} />
        </button>

        {/* Brand badge */}
        {product.brand && (
          <span className="absolute top-2.5 left-2.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {product.brand}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3.5 flex flex-col flex-1 gap-1.5">
        <h3 className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug flex-1 group-hover:text-blue-700 transition-colors duration-200">
          {product.name}
        </h3>

        <p className="text-base font-extrabold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
          {vndFormatter.format(displayPrice)}
        </p>

        {(product.reviewCount ?? 0) > 0 && (
          <div className="flex items-center gap-1">
            <StarRating value={product.avgRating ?? 0} size="sm" />
            <span className="text-xs text-gray-500">({product.reviewCount})</span>
          </div>
        )}

        {/* Add to cart button — slides up on hover */}
        <button
          onClick={handleAddToCart}
          disabled={isOutOfStock || !firstSku || addItem.isPending}
          className={`mt-1.5 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 shadow-sm
            ${justAdded
              ? 'bg-green-500 text-white scale-[0.98]'
              : isOutOfStock || !firstSku
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:opacity-90 hover:shadow-md hover:shadow-blue-200 active:scale-[0.97]'
            }
            opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          {justAdded ? '✓ Đã thêm!' : addItem.isPending ? 'Đang thêm...' : 'Thêm vào giỏ'}
        </button>
      </div>
    </div>
  )
}
