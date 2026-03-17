import type { Metadata } from 'next'
import { connection } from 'next/server'
import './globals.css'

export const metadata: Metadata = {
  title: 'RL SANDBOX // GYM LAB',
  description: 'Train and visualize reinforcement learning agents',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await connection()

  return (
    <html lang="en">
      <body className="h-screen flex flex-col overflow-hidden">
        {children}
      </body>
    </html>
  )
}
