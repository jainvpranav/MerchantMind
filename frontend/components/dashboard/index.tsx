'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { OverviewPage } from './pages/overview'
import { PatternsPage } from './pages/patterns'
import { CustomersPage } from './pages/customers'
import { ActionsPage } from './pages/actions'
import { endpoints, fetcher } from '@/lib/api'
import type { CampaignsResponse } from '@/lib/types'

export function Dashboard() {
  const [currentPage, setCurrentPage] = useState('overview')
  
  // Fetch draft campaigns count for sidebar badge
  const { data: campaignsData } = useSWR<CampaignsResponse>(
    endpoints.campaigns('draft'),
    fetcher,
    { refreshInterval: 30000 } // Refresh every 30 seconds
  )

  const pendingDrafts = campaignsData?.campaigns.length || 0

  const renderPage = () => {
    switch (currentPage) {
      case 'overview':
        return <OverviewPage />
      case 'patterns':
        return <PatternsPage />
      case 'customers':
        return <CustomersPage />
      case 'actions':
        return <ActionsPage />
      default:
        return <OverviewPage />
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Sidebar 
        currentPage={currentPage} 
        onPageChange={setCurrentPage}
        pendingDrafts={pendingDrafts}
      />
      
      {/* Main Content */}
      <div className="md:ml-64">
        <TopBar />
        <main className="p-6 pb-24 md:pb-6">
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
