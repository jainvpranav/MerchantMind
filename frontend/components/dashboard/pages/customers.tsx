'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { endpoints, fetcher, formatINR, getSegmentStyle } from '@/lib/api'
import type { CustomersResponse } from '@/lib/types'
import { cn } from '@/lib/utils'

const segments = [
  { id: 'all', label: 'All' },
  { id: 'loyal', label: 'Loyal' },
  { id: 'active', label: 'Active' },
  { id: 'at_risk', label: 'At Risk' },
  { id: 'dormant', label: 'Dormant' },
]

function SegmentBadge({ segment }: { segment: string }) {
  const style = getSegmentStyle(segment)
  const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace('_', ' ')
  
  return (
    <Badge className={cn('border-0', style.bg, style.text)}>
      {label}
    </Badge>
  )
}

function CustomerTableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-12 bg-zinc-800" />
      ))}
    </div>
  )
}

export function CustomersPage() {
  const [selectedSegment, setSelectedSegment] = useState('all')
  
  const endpoint = selectedSegment === 'all' 
    ? endpoints.customers() 
    : endpoints.customers(selectedSegment)
  
  const { data, isLoading, error } = useSWR<CustomersResponse>(endpoint, fetcher)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Customers</h1>

      <Tabs value={selectedSegment} onValueChange={setSelectedSegment}>
        <TabsList className="bg-zinc-800 border-zinc-700">
          {segments.map((seg) => (
            <TabsTrigger
              key={seg.id}
              value={seg.id}
              className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400"
            >
              {seg.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {segments.map((seg) => (
          <TabsContent key={seg.id} value={seg.id}>
            {selectedSegment === 'at_risk' && (
              <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4">
                <AlertTriangle className="size-5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-amber-200 text-sm">
                  {"These customers haven't visited in 10+ days. The Recovery Agent can send them a personalised win-back message."}
                </p>
              </div>
            )}

            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
                Error loading customer data
              </div>
            )}

            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6">
                    <CustomerTableSkeleton />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-zinc-400">Customer</TableHead>
                        <TableHead className="text-zinc-400">Segment</TableHead>
                        <TableHead className="text-zinc-400">Avg Basket</TableHead>
                        <TableHead className="text-zinc-400">Visits</TableHead>
                        <TableHead className="text-zinc-400">Last Seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.customers.map((customer) => (
                        <TableRow key={customer.customer_hash} className="border-zinc-800">
                          <TableCell className="text-zinc-100 font-medium">
                            Customer #{customer.customer_hash.slice(-4).toUpperCase()}
                          </TableCell>
                          <TableCell>
                            <SegmentBadge segment={customer.segment} />
                          </TableCell>
                          <TableCell className="text-zinc-300">
                            {formatINR(customer.avg_basket)}
                          </TableCell>
                          <TableCell className="text-zinc-300">
                            {customer.visit_count}
                          </TableCell>
                          <TableCell className="text-zinc-400">
                            {customer.days_absent === 0 
                              ? 'Today' 
                              : `${customer.days_absent} days ago`}
                          </TableCell>
                        </TableRow>
                      ))}
                      {data?.customers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-zinc-400 py-8">
                            No customers found in this segment
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
