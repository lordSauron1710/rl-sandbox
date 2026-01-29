import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RL LAB // Gym Manager',
  description: 'Train and visualize reinforcement learning agents',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
