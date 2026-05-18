import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearchSuggestions } from '@/hooks/use-search-suggestions'
import { getImageUrl } from '@/utils/image'

const vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

interface Props {
  inputClassName?: string
  onSearch?: () => void
}

export default function SearchBox({ inputClassName, onSearch }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { suggestions } = useSearchSuggestions(query)

  // Open dropdown whenever suggestions arrive for a non-empty query
  useEffect(() => {
    if (query.trim().length >= 2 && suggestions.length > 0) {
      setOpen(true)
    } else if (query.trim().length < 2) {
      setOpen(false)
    }
    setHighlightedIndex(-1)
  }, [suggestions, query])

  // Close on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  function goSearch(q: string) {
    navigate(`/products?q=${encodeURIComponent(q.trim())}`)
    setQuery('')
    setOpen(false)
    setHighlightedIndex(-1)
    onSearch?.()
  }

  function goProduct(id: string) {
    navigate(`/products/${id}`)
    setQuery('')
    setOpen(false)
    setHighlightedIndex(-1)
    onSearch?.()
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      goProduct(suggestions[highlightedIndex].id)
    } else if (query.trim()) {
      goSearch(query)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlightedIndex(-1)
    }
  }

  const baseInput =
    'w-full pl-4 pr-10 py-2 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && query.trim().length >= 2 && setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Tìm kiếm sản phẩm..."
            className={inputClassName ?? baseInput}
            autoComplete="off"
          />
          <button
            type="submit"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600"
          >
            <SearchIcon />
          </button>
        </div>
      </form>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-100 shadow-xl z-50 overflow-hidden animate-scale-in">
          <ul>
            {suggestions.map((item, i) => {
              const isHighlighted = i === highlightedIndex
              const thumbSrc = item.thumbnail ? getImageUrl(item.thumbnail) : null
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onMouseDown={() => goProduct(item.id)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                      isHighlighted ? 'bg-blue-50' : 'hover:bg-blue-50'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-[30px] h-[30px] rounded flex-shrink-0 overflow-hidden bg-gray-100">
                      {thumbSrc ? (
                        <img
                          src={thumbSrc}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200" />
                      )}
                    </div>
                    {/* Name + price */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 line-clamp-1">{item.name}</p>
                      <p className="text-xs text-blue-600 font-medium">
                        {vndFormatter.format(item.price)}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {/* Footer: see all results */}
          <div className="border-t border-gray-100">
            <button
              type="button"
              onMouseDown={() => goSearch(query)}
              className="w-full text-left px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
            >
              Xem tất cả kết quả cho &ldquo;{query}&rdquo;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
