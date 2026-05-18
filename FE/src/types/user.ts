export interface User {
  id: string
  email: string
  phone?: string
  fullName: string
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'DRIVER'
  enabled: boolean
  createdAt: string
}

export interface Address {
  id: string
  label?: string
  recipientName: string
  phone: string
  streetAddress: string
  ward?: string
  district?: string
  province: string
  country: string
  postalCode?: string
  isDefault: boolean
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  userId: string
  email: string
  role: string
  fullName: string
}
