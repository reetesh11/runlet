import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' })

export const metadata: Metadata = {
  title: 'Runlet — AI Agent Marketplace',
  description: 'Browse, configure, and deploy AI agents for your team — no code required.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="bg-gray-950 text-gray-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
