import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Package } from 'lucide-react'
import { authService } from '@/services/authService'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

type Step = 'email' | 'otp'

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Email không hợp lệ')
      return
    }
    setLoading(true)
    try {
      await authService.forgotPassword(email)
      setStep('otp')
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại')
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    setError(null)
    setResending(true)
    try {
      await authService.forgotPassword(email)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Không thể gửi lại OTP')
    } finally {
      setResending(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(otp)) {
      setError('OTP phải là 6 chữ số')
      return
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp')
      return
    }
    setLoading(true)
    try {
      await authService.resetPassword(email, otp, newPassword)
      setSuccess(true)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center mb-3">
            <Package className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Quên mật khẩu</h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === 'email' ? 'Nhập email để nhận mã OTP' : `Nhập mã OTP gửi tới ${email}`}
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Success state */}
        {success ? (
          <div className="text-center space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              Đặt lại mật khẩu thành công!
            </div>
            <Link
              to="/login"
              className="inline-block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              Đăng nhập ngay
            </Link>
          </div>
        ) : step === 'email' ? (
          /* Step 1: Email form */
          <form onSubmit={handleRequestOtp} noValidate className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading && <LoadingSpinner size="sm" />}
              Gửi mã OTP
            </button>
          </form>
        ) : (
          /* Step 2: OTP + new password form */
          <form onSubmit={handleResetPassword} noValidate className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mã OTP</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500 focus:border-blue-500 tracking-widest text-center"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mật khẩu mới</label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Xác nhận mật khẩu</label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading && <LoadingSpinner size="sm" />}
              Đặt lại mật khẩu
            </button>
            <button
              type="button"
              disabled={resending}
              onClick={handleResendOtp}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {resending && <LoadingSpinner size="sm" />}
              Gửi lại OTP
            </button>
          </form>
        )}

        {/* Back to login */}
        {!success && (
          <p className="text-center text-sm text-gray-500 mt-6">
            <Link to="/login" className="text-blue-600 font-medium hover:underline">
              Quay lại đăng nhập
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
