import type { ReactNode } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'
import ChatWidget from '@/components/chat/ChatWidget'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <ChatWidget />
    </div>
  )
}
