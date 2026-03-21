'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, ArrowRight, X, Info, Zap, RefreshCw } from 'lucide-react'
import { 
  endpoints, 
  fetcher, 
  formatTimeAgo, 
  getAgentTypeStyle, 
  approveCampaign, 
  rejectCampaign, 
  runRecoveryAgent, 
  runRestockAgent 
} from '@/lib/api'
import type { CampaignsResponse, Campaign } from '@/lib/types'
import { cn } from '@/lib/utils'

// ── Premium Styles ───────────────────────────────────────────────────────────
const styles = {
  glass: "backdrop-blur-xl bg-white/40 border border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]",
  cardGradient: (type: string) => {
    if (type.toLowerCase().includes('restock'))
      return "from-[#002970] via-[#003da5] to-[#0052cc]"
    if (type.toLowerCase().includes('recovery'))
      return "from-[#1a3a00] via-[#2a5a00] to-[#3a7a00]"
    return "from-[#3a2000] via-[#5a3800] to-[#7a4a00]"
  },
  accent: (type: string) => {
    if (type.toLowerCase().includes('restock')) return '#00BAF2'
    if (type.toLowerCase().includes('recovery')) return '#00C48C'
    return '#F5A623'
  }
}

// ── Confetti / Particle Burst ────────────────────────────────────────────────
function ParticleBurst() {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          className="absolute animate-bounce opacity-0"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float ${1 + Math.random() * 2}s ease-out forwards`,
            backgroundColor: ['#00BAF2', '#00C48C', '#F5A623', '#FF4E50', '#FC913A'][Math.floor(Math.random() * 5)],
            width: `${4 + Math.random() * 6}px`,
            height: `${4 + Math.random() * 6}px`,
            borderRadius: '50%',
            filter: 'blur(1px)',
          }}
        />
      ))}
      <style jsx global>{`
        @keyframes float {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-100px) scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ── Insight Card ─────────────────────────────────────────────────────────────
function CampaignCard({ campaign, onApprove, onReject, isRemoving, index }: {
  campaign: Campaign
  onApprove: (id: string) => void
  onReject: (id: string) => void
  isRemoving: boolean
  index: number
}) {
  const accentColor = styles.accent(campaign.agent_type)
  const bgGradient = styles.cardGradient(campaign.agent_type)

  return (
    <div
      className={cn(
        'group relative rounded-3xl overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]',
        isRemoving ? 'opacity-0 scale-90 -translate-y-4' : 'opacity-100 scale-100 translate-y-0',
        'hover:shadow-[0_20px_50px_rgba(0,0,0,0.15)] hover:-translate-y-1'
      )}
      style={{ 
        background: `linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.7))`,
        animationDelay: `${index * 100}ms`
       }}
    >
      {/* Dynamic Background Glow */}
      <div 
        className="absolute -right-20 -top-20 w-64 h-64 rounded-full blur-[80px] opacity-20 transition-opacity group-hover:opacity-40"
        style={{ background: accentColor }}
      />

      <div className="relative p-6 flex flex-col h-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="p-2.5 rounded-2xl shadow-inner"
              style={{ background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}11)` }}
            >
              <Zap className="size-4" style={{ color: accentColor }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: accentColor }}>
                  {campaign.agent_type}
                </span>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span className="text-[10px] text-gray-400 font-medium lowercase">
                  {formatTimeAgo(campaign.created_at)}
                </span>
              </div>
              <h3 className="text-sm font-bold text-gray-800 mt-0.5">
                Target: <span className="text-gray-500 font-medium">{campaign.target_segment}</span>
              </h3>
            </div>
          </div>
          <button 
            onClick={() => onReject(campaign.id)}
            className="p-2 rounded-full hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Message Body - Glass Container */}
        <div className="relative group/msg">
          <div 
            className="absolute rounded-2xl inset-0 blur-[2px] opacity-0 group-hover/msg:opacity-10 pointer-events-none transition-opacity"
            style={{ background: accentColor }}
          />
          <div 
            className="p-5 rounded-2xl border border-white/40 shadow-sm relative overflow-hidden" 
            style={{ background: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(4px)' }}
          >
            <p className="text-[14px] leading-relaxed text-gray-700 font-medium whitespace-pre-wrap italic">
              "{campaign.message_body}"
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => onApprove(campaign.id)}
            disabled={isRemoving}
            className="flex-1 group/btn relative h-12 rounded-2xl overflow-hidden transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: accentColor, color: 'white' }}
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
            <span className="relative flex items-center justify-center gap-2 text-sm font-bold">
              Execute Campaign <ArrowRight className="size-4 group-hover/btn:translate-x-1 transition-transform" />
            </span>
          </button>
          
          <div className="p-3 rounded-2xl bg-gray-50 text-gray-400 border border-gray-100 cursor-help hover:text-gray-600 transition-colors">
            <Info className="size-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export function ActionsPage() {
  const { data, isLoading, error, mutate } = useSWR<CampaignsResponse>(
    endpoints.campaigns('draft'), fetcher
  )
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [showParticles, setShowParticles] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleApprove = async (id: string) => {
    setRemovingIds(prev => new Set(prev).add(id))
    try {
      await approveCampaign(id)
      setShowParticles(true)
      setTimeout(() => setShowParticles(false), 2000)
      toast.success('Campaign live on WhatsApp ✨', {
        className: 'rounded-2xl border-0 shadow-lg bg-[#002970] text-white font-bold',
      })
      setTimeout(() => {
        mutate(c => ({ campaigns: c?.campaigns.filter(x => x.id !== id) || [] }), false)
        setRemovingIds(prev => { const n = new Set(prev); n.delete(id); return n })
      }, 700)
    } catch {
      toast.error('Workflow interrupted')
      setRemovingIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  const handleReject = async (id: string) => {
    setRemovingIds(prev => new Set(prev).add(id))
    try {
      await rejectCampaign(id)
      setTimeout(() => {
        mutate(c => ({ campaigns: c?.campaigns.filter(x => x.id !== id) || [] }), false)
        setRemovingIds(prev => { const n = new Set(prev); n.delete(id); return n })
      }, 700)
    } catch {
      setRemovingIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  const refreshAgents = async (type: 'restock' | 'recovery') => {
    setIsRefreshing(true)
    try {
      if (type === 'restock') await runRestockAgent()
      else await runRecoveryAgent()
      toast.info(`MunimAI is analyzing ${type} patterns...`, { icon: '🧠' })
      setTimeout(() => {
        mutate()
        setIsRefreshing(false)
        toast.success('Insights updated')
      }, 8000)
    } catch {
      setIsRefreshing(false)
      toast.error('Agent failure')
    }
  }

  const campaigns = data?.campaigns || []

  return (
    <div className="space-y-8 pb-12">
      {showParticles && <ParticleBurst />}

      {/* Header - Premium Glass Card */}
      <div className={cn("p-8 rounded-[2.5rem] relative overflow-hidden", styles.glass)}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-400/10 blur-[100px] pointer-events-none" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-[#002970] text-white p-1.5 rounded-lg shadow-lg">
                <Sparkles className="size-4" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[#002970]/60">AI Intelligence</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-[#002970]">Munim Insights</h1>
            <p className="text-gray-500 font-medium max-w-md">Precision automated cross-selling and inventory risk mitigation.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => refreshAgents('restock')}
              disabled={isRefreshing}
              className="px-6 py-3 rounded-2xl bg-white border border-[#DDE4F2] text-[#002970] font-bold text-sm shadow-sm transition-all hover:bg-[#F5F7FD] active:scale-95 flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} /> Restock Logic
            </button>
            <button
              onClick={() => refreshAgents('recovery')}
              disabled={isRefreshing}
              className="px-6 py-3 rounded-2xl bg-[#002970] text-white font-bold text-sm shadow-lg shadow-blue-900/20 transition-all hover:opacity-90 active:scale-95 flex items-center gap-2 disabled:opacity-50"
            >
              <Zap className="size-4" /> Retention Agent
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm font-bold flex items-center gap-2 animate-pulse">
           ⚠️ Data stream interrupted. Reconnecting...
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-3xl p-6 bg-white/50 border border-white h-64 space-y-4">
              <Skeleton className="h-6 w-32 rounded-full" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <div className="flex gap-3">
                <Skeleton className="h-12 flex-1 rounded-2xl" />
                <Skeleton className="h-12 w-12 rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-[40px] rounded-full" />
            <div className="relative size-24 rounded-full bg-white shadow-xl flex items-center justify-center text-4xl">
              🧘‍♂️
            </div>
          </div>
          <div>
            <h3 className="text-xl font-black text-[#002970]">Perfectly Synced</h3>
            <p className="text-gray-400 font-medium max-w-xs mx-auto">MunimAI has resolved all critical data anomalies. Your store is optimized.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-1000">
          {campaigns.map((c, idx) => (
            <CampaignCard
              key={c.id}
              index={idx}
              campaign={c}
              onApprove={handleApprove}
              onReject={handleReject}
              isRemoving={removingIds.has(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

