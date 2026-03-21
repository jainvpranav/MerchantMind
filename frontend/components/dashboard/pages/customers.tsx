'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Skeleton } from '@/components/ui/skeleton'
import { endpoints, fetcher, formatINR, getSegmentStyle } from '@/lib/api'
import type { CustomersResponse } from '@/lib/types'

const SEGMENTS = [
  { id: 'all',      label: 'All'     },
  { id: 'loyal',    label: 'Loyal'   },
  { id: 'active',   label: 'Active'  },
  { id: 'at_risk',  label: 'At Risk' },
  { id: 'dormant',  label: 'Dormant' },
]

const AVATAR_COLORS = ['#002970', '#003DA5', '#0097C4', '#00C48C', '#F5A623', '#E84040']

function initials(hash: string) {
  return hash.slice(-2).toUpperCase()
}

export function CustomersPage() {
  const [selectedSegment, setSelectedSegment] = useState('all')

  const endpoint = selectedSegment === 'all'
    ? endpoints.customers()
    : endpoints.customers(selectedSegment)

  const { data, isLoading, error } = useSWR<CustomersResponse>(endpoint, fetcher)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0D1B3E' }}>Customers</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7A8AAE' }}>Linked via phone number at checkout</p>
        </div>
        <button
          className="text-xs font-bold px-3 py-2 rounded-lg text-white"
          style={{ background: '#00BAF2' }}
        >
          ↓ Export
        </button>
      </div>

      {/* Segment tabs — scrollable on mobile */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-1 p-1 rounded-xl border"
        style={{ background: 'white', borderColor: '#DDE4F2', scrollbarWidth: 'none' }}
      >
        {SEGMENTS.map(seg => (
          <button
            key={seg.id}
            onClick={() => setSelectedSegment(seg.id)}
            className="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0"
            style={{
              background: selectedSegment === seg.id ? '#002970' : 'transparent',
              color: selectedSegment === seg.id ? 'white' : '#7A8AAE',
            }}
          >
            {seg.label}
          </button>
        ))}
      </div>

      {/* At-risk alert */}
      {selectedSegment === 'at_risk' && (
        <div className="flex items-start gap-3 p-3 rounded-xl border" style={{ background: '#FFF3DC', borderColor: '#F5A623' }}>
          <span className="text-lg">⚠️</span>
          <p className="text-xs" style={{ color: '#A06B00' }}>
            These customers haven't visited in 10+ days. Merchant Mind can send them a personalised win-back message.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl border text-sm" style={{ background: '#FFECEC', borderColor: '#E84040', color: '#B52B2B' }}>
          Error loading customer data
        </div>
      )}

      {/* Customer list */}
      <div className="space-y-3">
        {isLoading ? (
          [1,2,3,4,5].map(i => (
            <div key={i} className="bg-white rounded-xl border p-4 flex items-center gap-3" style={{ borderColor: '#DDE4F2' }}>
              <Skeleton className="size-10 rounded-full" style={{ background: '#EEF2FA' }} />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" style={{ background: '#EEF2FA' }} />
                <Skeleton className="h-3 w-24" style={{ background: '#EEF2FA' }} />
              </div>
              <Skeleton className="h-6 w-16" style={{ background: '#EEF2FA' }} />
            </div>
          ))
        ) : data?.customers.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#DDE4F2' }}>
            <p className="text-sm" style={{ color: '#7A8AAE' }}>No customers found in this segment</p>
          </div>
        ) : (
          data?.customers.map((customer, i) => {
            const style = getSegmentStyle(customer.segment)
            const segLabel = customer.segment.charAt(0).toUpperCase() + customer.segment.slice(1).replace('_', ' ')
            const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length]
            const isLoyal = customer.segment === 'loyal'
            return (
              <div
                key={customer.customer_hash}
                className="bg-white rounded-xl border p-4 flex items-center gap-3 transition-all hover:border-[#00BAF2] hover:shadow-sm"
                style={{ borderColor: '#DDE4F2' }}
              >
                {/* Avatar */}
                <div
                  className="size-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: avatarColor }}
                >
                  {initials(customer.customer_hash)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: '#0D1B3E' }}>
                      Customer #{customer.customer_hash.slice(-4).toUpperCase()}
                    </span>
                    {isLoyal && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                        style={{ background: '#EBF4FF', color: '#003DA5' }}
                      >
                        Loyal
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#7A8AAE' }}>
                    {customer.visit_count} visits ·{' '}
                    {customer.days_absent === 0 ? 'Today' : `${customer.days_absent}d ago`}
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold font-mono" style={{ color: '#0D1B3E' }}>
                    {formatINR(customer.avg_basket)}
                  </div>
                  <span
                    className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: style.bg, color: style.text }}
                  >
                    {segLabel}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
