'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { endpoints, fetcher, formatTimeAgo, getAgentTypeStyle, approveCampaign, rejectCampaign } from '@/lib/api'
import type { CampaignsResponse, Campaign } from '@/lib/types'
import { cn } from '@/lib/utils'

function CampaignCard({
  campaign,
  onApprove,
  onReject,
  isRemoving,
}: {
  campaign: Campaign
  onApprove: (id: string) => void
  onReject: (id: string) => void
  isRemoving: boolean
}) {
  const agentStyle = getAgentTypeStyle(campaign.agent_type)

  return (
    <Card
      className={cn(
        'bg-zinc-900 border-zinc-800 transition-all duration-500',
        isRemoving && 'opacity-0 scale-95'
      )}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <Badge className={cn('border-0 text-xs', agentStyle.bg, agentStyle.text)}>
            {campaign.agent_type}
          </Badge>
          <span className="text-xs text-zinc-500">
            {formatTimeAgo(campaign.created_at)}
          </span>
        </div>

        <div className="mb-4">
          <span className="text-xs text-zinc-500">Target:</span>
          <Badge variant="outline" className="ml-2 text-zinc-400 border-zinc-700">
            {campaign.target_segment}
          </Badge>
        </div>

        <div className="bg-zinc-950 rounded-lg p-4 border-l-4 border-green-500 mb-6">
          <p className="text-zinc-300 text-sm whitespace-pre-wrap">
            {campaign.message_body}
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => onApprove(campaign.id)}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            disabled={isRemoving}
          >
            Approve & Send
          </Button>
          <Button
            onClick={() => onReject(campaign.id)}
            variant="outline"
            className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            disabled={isRemoving}
          >
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CampaignSkeleton() {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-6 space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-6 w-32 bg-zinc-800" />
          <Skeleton className="h-4 w-20 bg-zinc-800" />
        </div>
        <Skeleton className="h-4 w-24 bg-zinc-800" />
        <Skeleton className="h-24 bg-zinc-800" />
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 bg-zinc-800" />
          <Skeleton className="h-10 flex-1 bg-zinc-800" />
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="py-16 flex flex-col items-center justify-center text-center">
        <div className="size-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
          <Zap className="size-8 text-zinc-500" />
        </div>
        <h3 className="text-lg font-medium text-zinc-100 mb-2">All caught up</h3>
        <p className="text-zinc-400">No pending agent actions.</p>
      </CardContent>
    </Card>
  )
}

function ConfettiBurst() {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          className="absolute animate-confetti"
          style={{
            left: `${Math.random() * 100}%`,
            top: '-10px',
            animationDelay: `${Math.random() * 0.5}s`,
            backgroundColor: ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7'][
              Math.floor(Math.random() * 5)
            ],
            width: '8px',
            height: '8px',
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
          }}
        />
      ))}
    </div>
  )
}

export function ActionsPage() {
  const { data, isLoading, error, mutate } = useSWR<CampaignsResponse>(
    endpoints.campaigns('draft'),
    fetcher
  )
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [showConfetti, setShowConfetti] = useState(false)

  const handleApprove = async (id: string) => {
    setRemovingIds((prev) => new Set(prev).add(id))
    
    try {
      await approveCampaign(id)
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 2000)
      toast.success('Campaign sent to WhatsApp ✓')
      
      // Wait for animation then remove from data
      setTimeout(() => {
        mutate(
          (current) => ({
            campaigns: current?.campaigns.filter((c) => c.id !== id) || [],
          }),
          false
        )
        setRemovingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 500)
    } catch {
      toast.error('Failed to approve campaign')
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleReject = async (id: string) => {
    setRemovingIds((prev) => new Set(prev).add(id))
    
    try {
      await rejectCampaign(id)
      
      setTimeout(() => {
        mutate(
          (current) => ({
            campaigns: current?.campaigns.filter((c) => c.id !== id) || [],
          }),
          false
        )
        setRemovingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 500)
    } catch {
      toast.error('Failed to dismiss campaign')
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleRunRecoveryAgent = () => {
    toast.info('Recovery Agent triggered — wiring coming soon!')
  }

  const campaigns = data?.campaigns || []

  return (
    <div className="space-y-6">
      {showConfetti && <ConfettiBurst />}
      
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Pending Agent Drafts</h1>
          <p className="text-zinc-400 mt-1">
            Review and approve AI-generated actions below. All campaigns pause for your approval.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRunRecoveryAgent}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Run Recovery Agent
        </Button>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          Error loading campaigns
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <CampaignSkeleton key={i} />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onApprove={handleApprove}
              onReject={handleReject}
              isRemoving={removingIds.has(campaign.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
