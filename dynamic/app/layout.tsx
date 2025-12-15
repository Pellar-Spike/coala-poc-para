import type { Metadata } from 'next'
import './globals.css'
import { DynamicProvider } from '@/components/DynamicProvider'

export const metadata: Metadata = {
  title: 'Coala POC - Vault & Wallet Management',
  description: 'Internal tool for managing vaults, wallets, and policies',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <DynamicProvider>{children}</DynamicProvider>
      </body>
    </html>
  )
}

