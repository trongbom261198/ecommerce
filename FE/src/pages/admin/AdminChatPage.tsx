import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { MessageCircle, Send, X, Bot, User, Shield } from 'lucide-react'
import AdminLayout from '@/components/layout/AdminLayout'
import { chatService } from '@/services/chatService'
import { useChatSocket } from '@/hooks/useChatSocket'
import type { ChatRoom, ChatMessage } from '@/types/chat'

export default function AdminChatPage() {
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: roomsRes, refetch: refetchRooms } = useQuery({
    queryKey: ['admin-chat-rooms'],
    queryFn: () => chatService.adminListRooms(),
    refetchInterval: 10_000,
  })
  const rooms = roomsRes?.data?.content ?? []

  const { data: msgsRes } = useQuery({
    queryKey: ['admin-chat-messages', selectedRoom?.id],
    queryFn: () => chatService.adminGetMessages(selectedRoom!.id),
    enabled: !!selectedRoom?.id,
  })
  useEffect(() => {
    if (msgsRes?.data) setMessages(msgsRes.data)
  }, [msgsRes])

  const onWsMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
    refetchRooms()
  }, [refetchRooms])
  useChatSocket(selectedRoom?.id ?? null, onWsMessage)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const replyMutation = useMutation({
    mutationFn: (content: string) => chatService.adminReply(selectedRoom!.id, content),
    onSuccess: (res) => {
      if (res.data) setMessages((prev) =>
        prev.some((m) => m.id === res.data!.id) ? prev : [...prev, res.data!])
    },
  })

  const closeMutation = useMutation({
    mutationFn: () => chatService.adminCloseRoom(selectedRoom!.id),
    onSuccess: () => { setSelectedRoom(null); refetchRooms() },
  })

  function handleSend() {
    const content = draft.trim()
    if (!content || !selectedRoom) return
    setDraft('')
    replyMutation.mutate(content)
  }

  return (
    <AdminLayout>
      <div className="flex gap-4 h-[calc(100vh-108px)]">
        {/* Room list */}
        <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-800 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-500" />
            Hội thoại ({rooms.length})
          </div>
          {rooms.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">Chưa có hội thoại nào</p>
          )}
          {rooms.map((room) => (
            <button key={room.id}
              onClick={() => { setSelectedRoom(room); setMessages([]) }}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50 transition-colors
                ${selectedRoom?.id === room.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-medium text-gray-800 truncate">
                  {room.contactName ?? `User #${room.userId.slice(-6)}`}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0
                  ${room.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {room.status === 'OPEN' ? 'Mở' : 'Đóng'}
                </span>
              </div>
              {room.contactPhone && (
                <p className="text-xs text-blue-500 mt-0.5">{room.contactPhone}</p>
              )}
              {room.lastMessage && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{room.lastMessage.content}</p>
              )}
            </button>
          ))}
        </div>

        {/* Message pane */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          {!selectedRoom ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Chọn một hội thoại để xem
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <span className="font-semibold text-gray-800 text-sm">
                    {selectedRoom.contactName ?? `User #${selectedRoom.userId.slice(-6)}`}
                  </span>
                  {selectedRoom.contactPhone && (
                    <p className="text-xs text-gray-400">{selectedRoom.contactPhone}</p>
                  )}
                </div>
                {selectedRoom.status === 'OPEN' && (
                  <button onClick={() => closeMutation.mutate()}
                    disabled={closeMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors">
                    <X className="w-3.5 h-3.5" /> Đóng hội thoại
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {messages.map((msg) => <AdminMsgBubble key={msg.id} msg={msg} />)}
                <div ref={bottomRef} />
              </div>

              {selectedRoom.status === 'OPEN' && (
                <div className="border-t border-gray-200 px-3 py-2 flex gap-2 items-end flex-shrink-0">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder="Trả lời khách hàng..." rows={1}
                    className="flex-1 resize-none px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-24" />
                  <button onClick={handleSend} disabled={!draft.trim() || replyMutation.isPending}
                    className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

function AdminMsgBubble({ msg }: { msg: ChatMessage }) {
  const isAdmin = msg.senderType === 'ADMIN'
  const isBot = msg.senderType === 'BOT'
  return (
    <div className={`flex gap-2 ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white
        ${isAdmin ? 'bg-green-500' : isBot ? 'bg-purple-500' : 'bg-blue-500'}`}>
        {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
      </div>
      <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed
        ${isAdmin
          ? 'bg-green-600 text-white rounded-tr-none'
          : isBot
            ? 'bg-purple-100 text-purple-800 border border-purple-200 rounded-tl-none'
            : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none shadow-sm'}`}>
        {isBot && <Bot className="w-3 h-3 inline mr-1 opacity-60" />}
        {msg.content}
      </div>
    </div>
  )
}
