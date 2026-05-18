import { useState, useEffect, useRef } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import type { OrderTracking } from '@/types/order'

export function useOrderTracking(orderId: string | null) {
  const [tracking, setTracking] = useState<OrderTracking | null>(null)
  const [connected, setConnected] = useState(false)
  const clientRef = useRef<Client | null>(null)

  useEffect(() => {
    if (!orderId) return

    const client = new Client({
      webSocketFactory: () => new SockJS(import.meta.env.VITE_WS_URL || '/ws'),
      onConnect: () => {
        setConnected(true)
        client.subscribe(`/topic/order/${orderId}`, (message) => {
          const data = JSON.parse(message.body) as OrderTracking
          setTracking(data)
        })
      },
      onDisconnect: () => {
        setConnected(false)
      },
      reconnectDelay: 5000,
    })

    client.activate()
    clientRef.current = client

    return () => {
      client.deactivate()
    }
  }, [orderId])

  return { tracking, connected }
}
