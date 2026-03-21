'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { OverviewPage } from './pages/overview'
import { CustomersPage } from './pages/customers'
import { ActionsPage } from './pages/actions'
import { OffersPage } from './pages/offers'
import { InventoryPage } from './pages/inventory'
import { endpoints, fetcher } from '@/lib/api'
import type { CampaignsResponse } from '@/lib/types'

export function Dashboard() {
  const [currentPage, setCurrentPage] = useState('overview')

  const { data: campaignsData } = useSWR<CampaignsResponse>(
    endpoints.campaigns('draft'),
    fetcher,
    { refreshInterval: 30000 }
  )
  const pendingDrafts = campaignsData?.campaigns.length || 0

  const renderPage = () => {
    switch (currentPage) {
      case 'overview':   return <OverviewPage />
      case 'actions':    return <ActionsPage />
      case 'offers':     return <OffersPage />
      case 'inventory':  return <InventoryPage />
      case 'customers':  return <CustomersPage />
      default:           return <OverviewPage />
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#EEF2FA' }}>
      <TopBar />
      <Sidebar
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pendingDrafts={pendingDrafts}
      />
      <div className="md:ml-[220px] pb-20 md:pb-0">
        <main className="p-4 md:p-6 max-w-5xl mx-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
