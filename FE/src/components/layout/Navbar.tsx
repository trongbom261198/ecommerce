import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Menu, X, User, ChevronDown, Package, LogOut, LayoutDashboard } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useCartStore } from '@/store/cartStore'
import SearchBox from './SearchBox'

export default function Navbar() {
  const navigate = useNavigate()
  const { user, isAuthenticated, logout } = useAuthStore()
  const itemCount = useCartStore((s) => s.itemCount)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close user menu when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-user-menu]')) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  function handleLogout() {
    logout()
    setUserMenuOpen(false)
    navigate('/')
  }

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'backdrop-blur-md bg-white/90 shadow-lg border-b border-white/20'
          : 'bg-white border-b border-gray-100 shadow-sm'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link
              to="/"
              className="flex items-center gap-2 group"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-md group-hover:shadow-blue-300 transition-shadow duration-300">
                <ShoppingCart className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-extrabold gradient-text tracking-tight">
                EcoShop
              </span>
            </Link>
          </div>

          {/* Search - desktop */}
          <div className="hidden md:flex flex-1 max-w-lg mx-8">
            <SearchBox />
          </div>

          {/* Right side - desktop */}
          <div className="hidden md:flex items-center gap-3">
            {user?.role === 'ADMIN' && (
              <Link
                to="/admin"
                className="flex items-center gap-1.5 text-sm text-violet-600 font-medium hover:text-violet-800 px-3 py-1.5 rounded-lg hover:bg-violet-50 transition-all duration-200"
              >
                <LayoutDashboard className="w-4 h-4" />
                Admin
              </Link>
            )}

            {/* Cart */}
            <Link
              to="/cart"
              className="relative p-2.5 text-gray-600 hover:text-blue-600 rounded-xl hover:bg-blue-50 transition-all duration-200 group"
            >
              <ShoppingCart className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-sm animate-bounce-in">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </Link>

            {/* User menu */}
            {isAuthenticated ? (
              <div className="relative" data-user-menu>
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 py-2 px-3 rounded-xl hover:bg-blue-50 transition-all duration-200"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                    {user?.fullName?.charAt(0)?.toUpperCase() ?? <User className="w-3 h-3" />}
                  </div>
                  <span className="max-w-[100px] truncate font-medium">{user?.fullName}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 z-50 animate-scale-in">
                    <div className="px-4 py-2.5 border-b border-gray-100">
                      <p className="text-xs text-gray-500">Xin chào,</p>
                      <p className="text-sm font-semibold text-gray-800 truncate">{user?.fullName}</p>
                    </div>
                    <Link
                      to="/orders"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      <Package className="w-4 h-4" />
                      Đơn hàng của tôi
                    </Link>
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="text-sm text-gray-700 hover:text-blue-600 px-3 py-2 rounded-xl hover:bg-gray-100 transition-all duration-200 font-medium"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="text-sm bg-gradient-to-r from-blue-600 to-violet-600 text-white px-4 py-2 rounded-xl hover:opacity-90 transition-opacity font-semibold shadow-sm hover:shadow-blue-200 hover:shadow-md duration-200"
                >
                  Đăng ký
                </Link>
              </div>
            )}
          </div>

          {/* Mobile right */}
          <div className="flex md:hidden items-center gap-1">
            <Link to="/cart" className="relative p-2.5 text-gray-600 rounded-xl hover:bg-blue-50 transition-colors">
              <ShoppingCart className="w-5 h-5" />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="p-2.5 text-gray-600 hover:text-blue-600 rounded-xl hover:bg-blue-50 transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          mobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="border-t border-gray-100 bg-white pb-5 px-4 space-y-4">
          <div className="pt-4">
            <SearchBox onSearch={() => setMobileMenuOpen(false)} />
          </div>

          <div className="space-y-1">
            <Link
              to="/products"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 py-2.5 px-3 text-sm text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
            >
              Sản phẩm
            </Link>
            {user?.role === 'ADMIN' && (
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 py-2.5 px-3 text-sm text-violet-600 font-medium hover:bg-violet-50 rounded-xl transition-colors"
              >
                <LayoutDashboard className="w-4 h-4" />
                Admin Dashboard
              </Link>
            )}
            {isAuthenticated ? (
              <>
                <Link
                  to="/orders"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 py-2.5 px-3 text-sm text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                >
                  <Package className="w-4 h-4" />
                  Đơn hàng của tôi
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full py-2.5 px-3 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Đăng xuất
                </button>
              </>
            ) : (
              <div className="flex gap-2 pt-1">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 text-center py-2.5 text-sm text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 text-center py-2.5 text-sm bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
                >
                  Đăng ký
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
