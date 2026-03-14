'use client'

import useSWR from 'swr'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  LabelList,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { endpoints, fetcher, formatINR, getSegmentStyle } from '@/lib/api'
import type { Summary, VelocityResponse, SegmentsResponse } from '@/lib/types'

function StatCard({
  title,
  value,
  isLoading,
  isError,
  accent,
}: {
  title: string
  value: string | number
  isLoading: boolean
  isError: boolean
  accent?: boolean
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24 bg-zinc-800" />
        ) : isError ? (
          <span className="text-red-400 text-sm">Error loading data</span>
        ) : (
          <p className={`text-2xl font-bold ${accent ? 'text-red-500' : 'text-zinc-100'}`}>
            {value}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function VelocityChart() {
  const { data, isLoading, error } = useSWR<VelocityResponse>(endpoints.velocity, fetcher)

  if (isLoading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100">Category Velocity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 bg-zinc-800" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100">Category Velocity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-400 text-sm">Error loading velocity data</p>
        </CardContent>
      </Card>
    )
  }

  const chartData = data?.velocity.map((item) => ({
    category: item.category,
    count: item.last_7_days,
    pct_change: item.pct_change,
    isPositive: item.pct_change >= 0,
  })) || []

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-zinc-100">Category Velocity</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" horizontal={false} />
            <XAxis type="number" stroke="#71717a" fontSize={12} />
            <YAxis type="category" dataKey="category" stroke="#71717a" fontSize={12} width={70} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                color: '#fafafa',
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isPositive ? '#22c55e' : '#ef4444'}
                />
              ))}
              <LabelList
                dataKey="pct_change"
                position="right"
                formatter={(value: number) => `${value >= 0 ? '+' : ''}${Math.round(value)}%`}
                fill="#a1a1aa"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function SegmentsChart() {
  const { data, isLoading, error } = useSWR<SegmentsResponse>(endpoints.segments, fetcher)

  if (isLoading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100">Customer Segments</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <Skeleton className="size-48 rounded-full bg-zinc-800" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100">Customer Segments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-400 text-sm">Error loading segment data</p>
        </CardContent>
      </Card>
    )
  }

  const chartData = data?.segments.map((seg) => ({
    name: seg.segment.charAt(0).toUpperCase() + seg.segment.slice(1).replace('_', ' '),
    value: seg.customer_count,
    avg_basket: seg.avg_basket,
    fill: getSegmentStyle(seg.segment).fill,
  })) || []

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-zinc-100">Customer Segments</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                color: '#fafafa',
              }}
              formatter={(value: number, name: string, props: { payload: { avg_basket: number } }) => [
                `${value} customers • Avg: ${formatINR(props.payload.avg_basket)}`,
                name,
              ]}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => <span className="text-zinc-400 text-sm">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {chartData.map((seg) => (
            <div key={seg.name} className="flex items-center gap-2 text-sm">
              <span className="size-3 rounded-full" style={{ backgroundColor: seg.fill }} />
              <span className="text-zinc-400">{seg.name}:</span>
              <span className="text-zinc-100">{seg.value}</span>
              <span className="text-zinc-500">• {formatINR(seg.avg_basket)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function OverviewPage() {
  const { data: summary, isLoading, error } = useSWR<Summary>(endpoints.summary, fetcher)

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value={summary ? formatINR(summary.today_revenue) : ''}
          isLoading={isLoading}
          isError={!!error}
        />
        <StatCard
          title="This Week"
          value={summary ? formatINR(summary.week_revenue) : ''}
          isLoading={isLoading}
          isError={!!error}
        />
        <StatCard
          title="Top Category"
          value={summary?.top_category || ''}
          isLoading={isLoading}
          isError={!!error}
        />
        <StatCard
          title="Pending Actions"
          value={summary?.active_campaigns || 0}
          isLoading={isLoading}
          isError={!!error}
          accent={(summary?.active_campaigns || 0) > 0}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VelocityChart />
        <SegmentsChart />
      </div>
    </div>
  )
}
