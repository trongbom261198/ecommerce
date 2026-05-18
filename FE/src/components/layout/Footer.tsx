import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingCart, Mail, Phone, MapPin, Send, Facebook, Youtube, Instagram } from 'lucide-react'

const QUICK_LINKS = [
  { label: 'Sản phẩm', to: '/products' },
  { label: 'Flash Sale', to: '/products' },
  { label: 'Giới thiệu', to: '/about' },
  { label: 'Tuyển dụng', to: '/careers' },
  { label: 'Liên hệ', to: '/contact' },
]

const POLICY_LINKS = [
  { label: 'Chính sách bảo mật', to: '/policy/privacy' },
  { label: 'Điều khoản sử dụng', to: '/policy/terms' },
  { label: 'Đổi trả & hoàn tiền', to: '/policy/return' },
  { label: 'Chính sách vận chuyển', to: '/policy/shipping' },
]

const SOCIALS = [
  { icon: Facebook, label: 'Facebook', href: '#', color: 'hover:bg-blue-600' },
  { icon: Youtube, label: 'YouTube', href: '#', color: 'hover:bg-red-600' },
  { icon: Instagram, label: 'Instagram', href: '#', color: 'hover:bg-pink-600' },
]

export default function Footer() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSubscribed(true)
    setEmail('')
    setTimeout(() => setSubscribed(false), 4000)
  }

  return (
    <footer className="bg-gray-950 text-gray-400 mt-auto">
      {/* Newsletter strip */}
      <div className="bg-gradient-to-r from-blue-700 via-violet-700 to-purple-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-white text-center md:text-left">
              <h3 className="text-xl font-extrabold mb-1">Đăng ký nhận ưu đãi độc quyền</h3>
              <p className="text-blue-200 text-sm">Nhận thông báo về Flash Sale và mã giảm giá mới nhất.</p>
            </div>
            {subscribed ? (
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white text-sm font-semibold px-5 py-3 rounded-2xl animate-scale-in">
                ✓ Đăng ký thành công! Cảm ơn bạn.
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Nhập email của bạn..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/15 backdrop-blur-sm text-white placeholder-blue-200 border border-white/20 focus:outline-none focus:border-white/50 text-sm transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 bg-white text-violet-700 font-bold px-5 py-3 rounded-xl hover:bg-blue-50 transition-all hover:-translate-y-0.5 hover:shadow-lg text-sm flex-shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  Đăng ký
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-md">
                <ShoppingCart className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-extrabold text-white">EcoShop</span>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs mb-6">
              Nền tảng thương mại điện tử hàng đầu, mang đến trải nghiệm mua sắm dễ dàng, an toàn và tiện lợi.
            </p>

            {/* Social icons */}
            <div className="flex gap-2">
              {SOCIALS.map(({ icon: Icon, label, href, color }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className={`w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200 hover:-translate-y-0.5 ${color}`}
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
              {/* TikTok SVG since Lucide doesn't have it */}
              <a
                href="#"
                aria-label="TikTok"
                className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-all duration-200 hover:-translate-y-0.5"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.3 6.3 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.87a8.18 8.18 0 004.78 1.52V7a4.85 4.85 0 01-1.01-.31z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Điều hướng</h3>
            <ul className="space-y-2.5">
              {QUICK_LINKS.map(({ label, to }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className="text-sm text-gray-500 hover:text-white transition-colors duration-150 hover:translate-x-0.5 inline-flex items-center gap-1.5 group"
                  >
                    <span className="w-1 h-1 rounded-full bg-gray-700 group-hover:bg-blue-500 transition-colors" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h3 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Chính sách</h3>
            <ul className="space-y-2.5">
              {POLICY_LINKS.map(({ label, to }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className="text-sm text-gray-500 hover:text-white transition-colors duration-150 inline-flex items-center gap-1.5 group"
                  >
                    <span className="w-1 h-1 rounded-full bg-gray-700 group-hover:bg-blue-500 transition-colors" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Liên hệ</h3>
            <ul className="space-y-3.5">
              <li className="flex items-start gap-2.5 text-sm text-gray-500">
                <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <span>123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh</span>
              </li>
              <li className="flex items-center gap-2.5 text-sm text-gray-500">
                <Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <a href="tel:19001234" className="hover:text-white transition-colors">1900 1234</a>
              </li>
              <li className="flex items-center gap-2.5 text-sm text-gray-500">
                <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <a href="mailto:support@ecoshop.vn" className="hover:text-white transition-colors">support@ecoshop.vn</a>
              </li>
            </ul>

            {/* Payment badges */}
            <div className="mt-5">
              <p className="text-xs text-gray-600 mb-2 uppercase tracking-wide">Phương thức thanh toán</p>
              <div className="flex flex-wrap gap-1.5">
                {['VISA', 'MOMO', 'VNPAY', 'COD'].map((p) => (
                  <span key={p} className="text-[10px] font-bold px-2 py-1 bg-gray-800 text-gray-400 rounded-md border border-gray-700">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} EcoShop. Tất cả quyền được bảo lưu.
          </p>
          <p className="text-xs text-gray-700">
            Được xây dựng với{' '}
            <span className="text-red-500">♥</span>
            {' '}bằng React &amp; TypeScript
          </p>
        </div>
      </div>
    </footer>
  )
}
