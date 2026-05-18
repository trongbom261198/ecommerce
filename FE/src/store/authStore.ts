import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types/user'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  loginWithTokens: (accessToken: string, refreshToken: string) => void
  logout: () => void
}

/** Decode a JWT payload without verification (browser-safe, no crypto needed). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      loginWithTokens: (accessToken, refreshToken) => {
        const payload = decodeJwtPayload(accessToken)
        const user: User | null = payload
          ? {
              id: (payload.sub as string) ?? '',
              email: (payload.email as string) ?? '',
              fullName: (payload.fullName as string) ?? (payload.email as string) ?? '',
              role: (payload.role as User['role']) ?? 'CUSTOMER',
              enabled: true,
              createdAt: '',
            }
          : null
        set({ user, accessToken, refreshToken, isAuthenticated: !!user })
      },
      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    { name: 'auth-storage' }
  )
)
