import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, X, Send, Bot, User, Trash2, Shield } from 'lucide-react'
import { chatService } from '@/services/chatService'
import { useChatSocket } from '@/hooks/useChatSocket'
import { useAuthStore } from '@/store/authStore'
import type { ChatMessage } from '@/types/chat'

type Step = 'closed' | 'pre-chat' | 'chat'

export default function ChatWidget() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [step, setStep] = useState<Step>('closed')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [nameErr, setNameErr] = useState('')
  const [phoneErr, setPhoneErr] = useState('')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  // Load chatbox config (public — no auth needed)
  const { data: configRes } = useQuery({
    queryKey: ['chat-public-config'],
    queryFn: chatService.getPublicConfig,
    staleTime: 60_000,
  })
  const config = configRes?.data

  // Check existing open room when widget opens
  const { data: roomRes, refetch: refetchRoom } = useQuery({
    queryKey: ['chat-room'],
    queryFn: chatService.getRoom,
    enabled: isAuthenticated && step !== 'closed',
    staleTime: 0,
  })
  const room = roomRes?.data ?? null

  // If room already exists → go straight to chat
  useEffect(() => {
    if (step === 'pre-chat' && room) setStep('chat')
  }, [room, step])

  // Load message history
  const { data: historyRes } = useQuery({
    queryKey: ['chat-messages', room?.id],
    queryFn: () => chatService.getMessages(room!.id),
    enabled: !!room?.id && step === 'chat',
  })
  useEffect(() => {
    if (historyRes?.data) setMessages(historyRes.data)
  }, [historyRes])

  // WebSocket real-time
  const onWsMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
  }, [])
  useChatSocket(room?.id ?? null, onWsMessage)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Start chat with contact info
  const startMutation = useMutation({
    mutationFn: () => chatService.startRoom(name.trim(), phone.trim()),
    onSuccess: (res) => {
      qc.setQueryData(['chat-room'], res)
      setStep('chat')
    },
  })

  // Send message
  const sendMutation = useMutation({
    mutationFn: (content: string) => chatService.sendMessage(room!.id, content),
    onSuccess: (res) => {
      if (res.data) setMessages((prev) =>
        prev.some((m) => m.id === res.data!.id) ? prev : [...prev, res.data!])
    },
  })

  // Clear chat
  const clearMutation = useMutation({
    mutationFn: () => chatService.clearRoom(room!.id),
    onSuccess: () => {
      setMessages([])
      qc.removeQueries({ queryKey: ['chat-room'] })
      qc.removeQueries({ queryKey: ['chat-messages'] })
      setStep('pre-chat')
      setName('')
      setPhone('')
    },
  })

  function handleOpen() {
    if (step === 'closed') {
      setStep('pre-chat')
      refetchRoom()
    } else {
      setStep('closed')
    }
  }

  function validateAndStart() {
    let valid = true
    if (!name.trim()) { setNameErr('Vui lòng nhập họ tên'); valid = false } else setNameErr('')
    if (!/^[0-9]{9,11}$/.test(phone.trim())) { setPhoneErr('Số điện thoại không hợp lệ'); valid = false } else setPhoneErr('')
    if (valid) startMutation.mutate()
  }

  function handleSend() {
    const content = draft.trim()
    if (!content || !room) return
    setDraft('')
    sendMutation.mutate(content)
  }

  if (!isAuthenticated) return null

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {step !== 'closed' && (
        <div className="w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ height: step === 'pre-chat' ? 'auto' : 560 }}>

          {/* Header */}
          <div className="bg-blue-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-white" />
              <div>
                <span className="text-white font-semibold text-sm">Hỗ trợ khách hàng</span>
                {config && (
                  <p className="text-blue-200 text-xs">
                    {config.botEnabled ? '🤖 Chatbot tự động' : '👤 Nhân viên trực tiếp'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {step === 'chat' && room && (
                <button
                  onClick={() => clearMutation.mutate()}
                  disabled={clearMutation.isPending}
                  title="Xoá đoạn chat"
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setStep('closed')} className="text-white/80 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Pre-chat form */}
          {step === 'pre-chat' && (
            <div className="p-5 space-y-4">
              {/* Welcome message from config */}
              <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3">
                {config?.botEnabled
                  ? <Bot className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                  : <Shield className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />}
                <p className="text-sm text-gray-700">
                  {config?.welcomeMessage ?? 'Xin chào! Chúng tôi có thể giúp gì cho bạn?'}
                </p>
              </div>
              <p className="text-xs text-gray-500">
                {config?.botEnabled
                  ? 'Bạn sẽ được hỗ trợ bởi chatbot tự động'
                  : 'Bạn sẽ được kết nối trực tiếp với nhân viên hỗ trợ'}
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Họ và tên *</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Nguyễn Văn A" className={inputCls} />
                {nameErr && <p className="text-red-500 text-xs mt-1">{nameErr}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số điện thoại *</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901234567" className={inputCls} />
                {phoneErr && <p className="text-red-500 text-xs mt-1">{phoneErr}</p>}
              </div>
              <button onClick={validateAndStart} disabled={startMutation.isPending}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {startMutation.isPending ? 'Đang kết nối...' : 'Bắt đầu chat'}
              </button>
            </div>
          )}

          {/* Chat view */}
          {step === 'chat' && (
            <>
              {room?.contactName && (
                <div className="px-4 py-1.5 bg-blue-50 border-b border-blue-100 flex-shrink-0">
                  <p className="text-xs text-blue-700">
                    {room.contactName} · {room.contactPhone}
                  </p>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
                <div ref={bottomRef} />
              </div>

              {/* Quick-reply option buttons — only when bot mode is enabled */}
              {config?.botEnabled && (config?.botRules?.length ?? 0) > 0 && (
                <div className="border-t border-gray-100 bg-white px-3 pt-2.5 pb-2 flex-shrink-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Câu hỏi thường gặp
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {config!.botRules.map((rule, i) => (
                      <button
                        key={i}
                        onClick={() => { if (room) sendMutation.mutate(rule.keyword) }}
                        disabled={sendMutation.isPending}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 transition-colors"
                      >
                        {rule.keyword}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 px-3 py-2 flex gap-2 items-end bg-white flex-shrink-0">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Hoặc nhập câu hỏi khác..." rows={1}
                  className="flex-1 resize-none px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-24" />
                <button onClick={handleSend} disabled={!draft.trim() || sendMutation.isPending}
                  className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Toggle button */}
      <button onClick={handleOpen}
        className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center">
        {step !== 'closed' ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.senderType === 'USER'
  const isBot = msg.senderType === 'BOT'
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white
        ${isUser ? 'bg-blue-500' : isBot ? 'bg-purple-500' : 'bg-green-500'}`}>
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed
        ${isUser ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none shadow-sm'}`}>
        {msg.content}
      </div>
    </div>
  )
}
