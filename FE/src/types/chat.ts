export type ChatRoomStatus = 'OPEN' | 'CLOSED'
export type ChatSenderType = 'USER' | 'ADMIN' | 'BOT'

export interface ChatMessage {
  id: string
  roomId: string
  senderType: ChatSenderType
  senderId: string | null
  content: string
  createdAt: string
}

export interface ChatRoom {
  id: string
  userId: string
  status: ChatRoomStatus
  contactName: string | null
  contactPhone: string | null
  createdAt: string
  updatedAt: string
  lastMessage: ChatMessage | null
}

export interface ChatBotRule {
  keyword: string
  response: string
}

export interface ChatConfig {
  botEnabled: boolean
  welcomeMessage: string
  offlineMessage: string
  botRules: ChatBotRule[]
}
