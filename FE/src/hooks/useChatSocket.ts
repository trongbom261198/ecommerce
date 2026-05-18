import { useEffect, useRef, useCallback } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import type { ChatMessage } from '@/types/chat'

export function useChatSocket(roomId: string | null, onMessage: (msg: ChatMessage) => void) {
  const clientRef = useRef<Client | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!roomId) return

    const client = new Client({
      webSocketFactory: () => new SockJS(import.meta.env.VITE_WS_URL || '/ws'),
      onConnect: () => {
        client.subscribe(`/topic/chat/${roomId}`, (frame) => {
          const msg = JSON.parse(frame.body) as ChatMessage
          onMessageRef.current(msg)
        })
      },
      reconnectDelay: 5000,
    })

    client.activate()
    clientRef.current = client

    return () => {
      client.deactivate()
    }
  }, [roomId])

  const disconnect = useCallback(() => {
    clientRef.current?.deactivate()
  }, [])

  return { disconnect }
}
