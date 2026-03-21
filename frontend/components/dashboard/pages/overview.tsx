'use client'

import useSWR from 'swr'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, LabelList,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { endpoints, fetcher, formatINR, getSegmentStyle } from '@/lib/api'
import type { Summary, VelocityResponse, SegmentsResponse } from '@/lib/types'

// ── Metric card ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, change, changeUp, barWidth, barColor, isLoading }: {
  label: string; value: string | number; change?: string; changeUp?: boolean
  barWidth?: number; barColor?: string; isLoading: boolean
}) {
  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#DDE4F2' }}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#7A8AAE' }}>{label}</div>
      {isLoading ? (
        <Skeleton className="h-7 w-24 mt-1" style={{ background: '#EEF2FA' }} />
      ) : (
        <>
          <div className="text-2xl font-bold leading-none" style={{ color: '#0D1B3E' }}>{value}</div>
          {change && (
            <div className="text-xs mt-1 flex items-center gap-1" style={{ color: changeUp ? '#00C48C' : '#E84040' }}>
              {changeUp ? '↑' : '↓'} {change}
            </div>
          )}
          {barWidth !== undefined && (
            <div className="h-1 rounded-full mt-2" style={{ background: '#DDE4F2' }}>
              <div className="h-full rounded-full" style={{ width: `${barWidth}%`, background: barColor || '#00BAF2' }} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Velocity chart ───────────────────────────────────────────────────────────
function VelocityChart() {
  const { data, isLoading, error } = useSWR<VelocityResponse>(endpoints.velocity, fetcher)

  const chartData = data?.velocity.map(item => ({
    category: item.category,
    count: item.last_7_days,
    pct_change: item.pct_change,
    isPositive: item.pct_change >= 0,
  })) || []

  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#DDE4F2' }}>
      <div className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#0D1B3E' }}>
        <span>📈</span> Category Velocity
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-7" style={{ background: '#EEF2FA' }} />)}
        </div>
      ) : error ? (
        <p className="text-sm" style={{ color: '#E84040' }}>Error loading data</p>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 70, right: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DDE4F2" horizontal={false} />
            <XAxis type="number" stroke="#7A8AAE" fontSize={11} />
            <YAxis 
              type="category" 
              dataKey="category" 
              stroke="#7A8AAE" 
              fontSize={11} 
              width={110} 
              tickFormatter={(v) => v.length > 20 ? v.substring(0, 19) + '…' : v} 
            />
            <Tooltip
              contentStyle={{ background: '#002970', border: 'none', borderRadius: '10px', color: '#ffffff', fontSize: '12px' }}
              cursor={{ fill: '#EEF2FA' }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.isPositive ? '#00C48C' : '#E84040'} />
              ))}
              <LabelList
                dataKey="pct_change"
                position="right"
                formatter={(v: number) => `${v >= 0 ? '+' : ''}${Math.round(v)}%`}
                fill="#7A8AAE"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Segments chart ───────────────────────────────────────────────────────────
function SegmentsChart() {
  const { data, isLoading, error } = useSWR<SegmentsResponse>(endpoints.segments, fetcher)

  const chartData = data?.segments.map(seg => ({
    name: seg.segment.charAt(0).toUpperCase() + seg.segment.slice(1).replace('_', ' '),
    value: seg.customer_count,
    avg_basket: seg.avg_basket,
    fill: getSegmentStyle(seg.segment).fill,
  })) || []

  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#DDE4F2' }}>
      <div className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#0D1B3E' }}>
        <span>🎯</span> Customer Segments
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center h-[240px]">
          <Skeleton className="size-40 rounded-full" style={{ background: '#EEF2FA' }} />
        </div>
      ) : error ? (
        <p className="text-sm" style={{ color: '#E84040' }}>Error loading data</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#002970', border: 'none', borderRadius: '10px', color: '#ffffff', fontSize: '12px' }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: number, name: string, props: any) => [
                  `${value} customers • Avg: ${formatINR(props.payload.avg_basket)}`, name,
                ] as [string, string]}
              />
              <Legend verticalAlign="bottom" height={30} formatter={(v) => <span className="text-xs" style={{ color: '#7A8AAE' }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {chartData.map(seg => (
              <div key={seg.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: seg.fill }} />
                <span style={{ color: '#7A8AAE' }}>{seg.name}:</span>
                <span className="font-semibold" style={{ color: '#0D1B3E' }}>{seg.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function OverviewPage() {
  const { data: summary, isLoading } = useSWR<Summary>(endpoints.summary, fetcher)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: '#0D1B3E' }}>Basket &amp; Customer Analytics</h1>
        <p className="text-sm mt-0.5" style={{ color: '#7A8AAE' }}>Spend patterns · Offer performance · Customer segments</p>
      </div>

      {/* Metric cards — 2 cols on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 anim anim-d1">
        <MetricCard
          label="Total GMV"
          value={summary ? formatINR(summary.today_revenue) : '—'}
          change={summary?.today_revenue_change !== undefined ? `${Math.abs(Math.round(summary.today_revenue_change))}% vs yesterday` : undefined}
          changeUp={(summary?.today_revenue_change ?? 0) >= 0} 
          barWidth={72} isLoading={isLoading}
        />
        <MetricCard
          label="This Week"
          value={summary ? formatINR(summary.week_revenue) : '—'}
          change={summary?.week_revenue_change !== undefined ? `${Math.abs(Math.round(summary.week_revenue_change))}% vs last week` : undefined}
          changeUp={(summary?.week_revenue_change ?? 0) >= 0} 
          barWidth={55} barColor="#00C48C" isLoading={isLoading}
        />
        <MetricCard
          label="Top Category"
          value={summary?.top_category || '—'}
          change="Trending now"
          changeUp barWidth={63} barColor="#F5A623" isLoading={isLoading}
        />
        <MetricCard
          label="Draft Insights"
          value={summary?.active_campaigns ?? '—'}
          change={summary?.campaigns_change !== undefined ? `${summary.campaigns_change} new since yesterday` : undefined}
          changeUp={(summary?.campaigns_change ?? 0) >= 0} 
          barWidth={30} barColor="#E84040" isLoading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 anim anim-d2">
        <VelocityChart />
        <SegmentsChart />
      </div>
    </div>
  )
}
