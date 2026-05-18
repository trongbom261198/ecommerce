import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function OAuthCallbackPage() {
  const navigate = useNavigate()
  const loginWithTokens = useAuthStore((s) => s.loginWithTokens)

  useEffect(() => {
    const hash = window.location.hash.slice(1) // strip leading '#'
    const params = new URLSearchParams(hash)

    const access = params.get('access')
    const refresh = params.get('refresh')
    const error = new URLSearchParams(window.location.search).get('error')

    if (error) {
      // Clean up URL then redirect to login with error
      window.history.replaceState(null, '', '/login')
      navigate('/login', { replace: true, state: { oauthError: error } })
      return
    }

    if (access && refresh) {
      loginWithTokens(access, refresh)
      // Remove tokens from browser history
      window.history.replaceState(null, '', '/oauth/callback')
      navigate('/', { replace: true })
      return
    }

    // No tokens and no error — unexpected state, redirect to login
    navigate('/login', { replace: true })
  }, [loginWithTokens, navigate])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-blue-50 to-indigo-100">
      <LoadingSpinner size="lg" />
      <p className="text-gray-600 text-sm">Đang đăng nhập với Google...</p>
    </div>
  )
}
