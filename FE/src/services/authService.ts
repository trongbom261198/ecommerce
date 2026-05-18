import api from './api'
import type { AuthResponse } from '@/types/user'
import type { ApiResponse } from '@/types/common'

export const authService = {
  register: (data: { email: string; phone?: string; password: string; fullName: string }) =>
    api.post<ApiResponse<AuthResponse>>('/auth/register', data).then((r) => r.data),

  login: (email: string, password: string) =>
    api.post<ApiResponse<AuthResponse>>('/auth/login', { email, password }).then((r) => r.data),

  refresh: (refreshToken: string) =>
    api.post<ApiResponse<AuthResponse>>('/auth/refresh', { refreshToken }).then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),

  getProfile: () => api.get('/users/me').then((r) => r.data),

  getAddresses: () => api.get('/users/me/addresses').then((r) => r.data),

  addAddress: (data: object) => api.post('/users/me/addresses', data).then((r) => r.data),

  setDefaultAddress: (id: string) =>
    api.put(`/users/me/addresses/${id}/default`).then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post<ApiResponse<void>>('/auth/forgot-password', { email }).then((r) => r.data),

  resetPassword: (email: string, otp: string, newPassword: string) =>
    api.post<ApiResponse<void>>('/auth/reset-password', { email, otp, newPassword }).then((r) => r.data),
}
