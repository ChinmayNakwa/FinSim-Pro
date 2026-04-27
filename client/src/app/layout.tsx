import type { Metadata } from 'next'
import './globals.css'


export const metadata: Metadata = {
  title: 'FinSim Pro',
  description: 'Multi-asset Indian financial simulation',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text antialiased">
        {children}
      </body>
    </html>
  )
}