import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const BASE_URL = 'http://localhost:8080/api/v1'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh']

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const requestPath = original?.url ?? ''

    // Không retry refresh nếu đang gọi auth endpoints — tránh loop vô hạn
    const isAuthEndpoint = AUTH_PATHS.some((p) => requestPath.includes(p))
    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true
      try {
        const refreshToken = useAuthStore.getState().refreshToken
        if (!refreshToken) throw new Error('No refresh token')
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
        useAuthStore.getState().setTokens(data.data.accessToken, data.data.refreshToken)
        original.headers.Authorization = `Bearer ${data.data.accessToken}`
        return api(original)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
