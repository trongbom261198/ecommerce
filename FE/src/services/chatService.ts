import api from './api'
import type { ApiResponse, PageResponse } from '@/types/common'
import type { ChatRoom, ChatMessage, ChatConfig } from '@/types/chat'

export const chatService = {
  // Public (no auth needed)
  getPublicConfig: () =>
    api.get<ApiResponse<ChatConfig>>('/chat/config').then((r) => r.data),

  // User
  getRoom: () =>
    api.get<ApiResponse<ChatRoom | null>>('/chat/room').then((r) => r.data),

  startRoom: (contactName: string, contactPhone: string) =>
    api.post<ApiResponse<ChatRoom>>('/chat/room', { contactName, contactPhone }).then((r) => r.data),

  clearRoom: (roomId: string) =>
    api.delete<ApiResponse<void>>(`/chat/room/${roomId}`).then((r) => r.data),

  getMessages: (roomId: string) =>
    api.get<ApiResponse<ChatMessage[]>>(`/chat/room/${roomId}/messages`).then((r) => r.data),

  sendMessage: (roomId: string, content: string) =>
    api.post<ApiResponse<ChatMessage>>(`/chat/room/${roomId}/messages`, { content }).then((r) => r.data),

  // Admin
  adminListRooms: (page = 0, size = 20) =>
    api.get<ApiResponse<PageResponse<ChatRoom>>>('/admin/chat/rooms', { params: { page, size } }).then((r) => r.data),

  adminGetMessages: (roomId: string) =>
    api.get<ApiResponse<ChatMessage[]>>(`/admin/chat/rooms/${roomId}/messages`).then((r) => r.data),

  adminReply: (roomId: string, content: string) =>
    api.post<ApiResponse<ChatMessage>>(`/admin/chat/rooms/${roomId}/messages`, { content }).then((r) => r.data),

  adminCloseRoom: (roomId: string) =>
    api.post<ApiResponse<void>>(`/admin/chat/rooms/${roomId}/close`).then((r) => r.data),

  getConfig: () =>
    api.get<ApiResponse<ChatConfig>>('/admin/chat/config').then((r) => r.data),

  updateConfig: (config: ChatConfig) =>
    api.put<ApiResponse<ChatConfig>>('/admin/chat/config', config).then((r) => r.data),
}
