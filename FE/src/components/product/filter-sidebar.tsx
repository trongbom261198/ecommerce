import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { productService } from '@/services/productService'
import type { Category } from '@/types/product'

const PRICE_PRESETS = [
  { label: 'Dưới 200k', max: 200000 },
  { label: '200k – 500k', min: 200000, max: 500000 },
  { label: '500k – 2 triệu', min: 500000, max: 2000000 },
  { label: '2 – 5 triệu', min: 2000000, max: 5000000 },
  { label: 'Trên 5 triệu', min: 5000000 },
]

interface Props {
  categories: Category[]
}

function Section({ title, children, defaultOpen = true }: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-800 hover:text-blue-600 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

export default function FilterSidebar({ categories }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [minInput, setMinInput] = useState(searchParams.get('minPrice') ?? '')
  const [maxInput, setMaxInput] = useState(searchParams.get('maxPrice') ?? '')

  const activeCategory = searchParams.get('category') ?? ''
  const activeBrand = searchParams.get('brand') ?? ''
  const activeMin = searchParams.get('minPrice') ?? ''
  const activeMax = searchParams.get('maxPrice') ?? ''

  const { data: brandsData } = useQuery({
    queryKey: ['brands'],
    queryFn: productService.getBrands,
    staleTime: 300_000,
  })
  const brands = brandsData?.data ?? []

  function setParam(key: string, value: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!value) next.delete(key)
      else next.set(key, value)
      next.delete('page')
      return next
    })
  }

  function applyPricePreset(min?: number, max?: number) {
    setMinInput(min ? String(min) : '')
    setMaxInput(max ? String(max) : '')
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      min ? next.set('minPrice', String(min)) : next.delete('minPrice')
      max ? next.set('maxPrice', String(max)) : next.delete('maxPrice')
      next.delete('page')
      return next
    })
  }

  function applyCustomPrice() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      minInput ? next.set('minPrice', minInput) : next.delete('minPrice')
      maxInput ? next.set('maxPrice', maxInput) : next.delete('maxPrice')
      next.delete('page')
      return next
    })
  }

  function clearAll() {
    setMinInput('')
    setMaxInput('')
    setSearchParams({})
  }

  const hasFilters = activeCategory || activeBrand || activeMin || activeMax

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4 sticky top-20">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 text-sm">Bộ lọc</h3>
        {hasFilters && (
          <button onClick={clearAll} className="text-xs text-red-500 hover:underline font-medium">
            Xóa tất cả
          </button>
        )}
      </div>

      {/* Category */}
      <Section title="Danh mục">
        <ul className="space-y-0.5">
          <li>
            <button
              onClick={() => setParam('category', null)}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                !activeCategory ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Tất cả
            </button>
          </li>
          {categories.map((cat) => (
            <li key={cat.id}>
              <button
                onClick={() => setParam('category', cat.id)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  activeCategory === cat.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {cat.name}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {/* Price */}
      <Section title="Khoảng giá">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PRICE_PRESETS.map((p) => {
              const isActive = activeMin === String(p.min ?? '') && activeMax === String(p.max ?? '')
              return (
                <button
                  key={p.label}
                  onClick={() => applyPricePreset(p.min, p.max)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                      : 'border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="number"
              placeholder="Từ"
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <span className="text-gray-400 text-xs shrink-0">–</span>
            <input
              type="number"
              placeholder="Đến"
              value={maxInput}
              onChange={(e) => setMaxInput(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <button
            onClick={applyCustomPrice}
            className="w-full py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Áp dụng
          </button>
        </div>
      </Section>

      {/* Brand */}
      {brands.length > 0 && (
        <Section title="Thương hiệu">
          <ul className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
            <li>
              <button
                onClick={() => setParam('brand', null)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  !activeBrand ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Tất cả
              </button>
            </li>
            {brands.map((brand) => (
              <li key={brand}>
                <button
                  onClick={() => setParam('brand', brand)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    activeBrand === brand ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {brand}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
