'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { endpoints, fetcher, addOffer as apiAddOffer, toggleOffer as apiToggleOffer, deleteOffer as apiDeleteOffer } from '@/lib/api'
import type { CampaignsResponse } from '@/lib/types'

// ── Types ───────────────────────────────────────────────────────────────────
type OfferType = 'flat' | 'percent' | 'cashback' | 'bogo'
type OfferSegment = 'all' | 'loyal' | 'at_risk' | 'new'

interface LocalOffer {
  id: string
  title: string
  type: OfferType
  value: number
  minAmount: number
  segment: OfferSegment
  category: string
  active: boolean
}

const OFFER_TYPES: { id: OfferType; label: string; icon: string; desc: string }[] = [
  { id: 'flat',     label: 'Flat Off',       icon: '₹', desc: 'Fixed rupee discount' },
  { id: 'percent',  label: '% Discount',     icon: '%', desc: 'Percentage off total'  },
  { id: 'cashback', label: 'Paytm Cashback', icon: '🔄', desc: 'Cashback to wallet'  },
  { id: 'bogo',     label: 'Buy 1 Get 1',    icon: '🎁', desc: 'Free item on purchase' },
]

const SEGMENTS: { id: OfferSegment; label: string; color: string }[] = [
  { id: 'all',     label: 'All Customers',  color: '#003DA5' },
  { id: 'loyal',   label: 'Loyal',          color: '#008A5E' },
  { id: 'at_risk', label: 'At Risk',        color: '#A06B00' },
  { id: 'new',     label: 'New Customers',  color: '#7A8AAE' },
]

// ── Offer type badge style ───────────────────────────────────────────────────
function offerTypeBadge(type: OfferType) {
  const map: Record<OfferType, { bg: string; color: string }> = {
    flat:     { bg: '#EBF4FF', color: '#003DA5' },
    percent:  { bg: '#E4F8F1', color: '#008A5E' },
    cashback: { bg: '#EBF4FF', color: '#003DA5' },
    bogo:     { bg: '#FFF3DC', color: '#A06B00' },
  }
  return map[type]
}

// ── Offer card ───────────────────────────────────────────────────────────────
function OfferCard({ offer, onToggle, onDelete }: {
  offer: LocalOffer
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}) {
  const badge = offerTypeBadge(offer.type)
  const seg = SEGMENTS.find(s => s.id === offer.segment)

  return (
    <div
      className="bg-white rounded-xl border p-4 transition-all"
      style={{ borderColor: offer.active ? '#00BAF2' : '#DDE4F2', opacity: offer.active ? 1 : 0.65 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: '#0D1B3E' }}>{offer.title}</span>
            {!offer.active && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#F5F7FD', color: '#7A8AAE' }}>PAUSED</span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.color }}>
              {OFFER_TYPES.find(t => t.id === offer.type)?.label}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#F5F7FD', color: seg?.color }}>
              {seg?.label}
            </span>
            <span className="text-[10px]" style={{ color: '#7A8AAE' }}>Min ₹{offer.minAmount}</span>
            <span className="text-[10px]" style={{ color: '#7A8AAE' }}>· {offer.category}</span>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          onClick={() => onToggle(offer.id)}
          className="relative w-10 h-5 rounded-full transition-all shrink-0 mt-0.5"
          style={{ background: offer.active ? '#00BAF2' : '#DDE4F2' }}
        >
          <div
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all"
            style={{ left: offer.active ? '1.25rem' : '0.125rem' }}
          />
        </button>
      </div>

      {/* Delete */}
      <div className="flex justify-end mt-2">
        <button
          onClick={() => onDelete(offer.id)}
          className="text-[10px] font-medium transition-colors"
          style={{ color: '#7A8AAE' }}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

// ── Add offer modal / inline form ────────────────────────────────────────────
function AddOfferForm({ onAdd, onClose, categories }: { onAdd: (o: Omit<LocalOffer, 'id'>) => void; onClose: () => void; categories: string[] }) {
  const [type, setType] = useState<OfferType>('flat')
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [minAmount, setMinAmount] = useState('0')
  const [segment, setSegment] = useState<OfferSegment>('all')
  const [category, setCategory] = useState('Any')

  const submit = () => {
    if (!title || !value) return toast.error('Fill in offer title and value')
    onAdd({
      title, type,
      value: parseFloat(value),
      minAmount: parseFloat(minAmount) || 0,
      segment, category,
      active: true,
    })
    toast.success('Offer added — will show at POS checkout')
    onClose()
  }

  return (
    <div className="bg-white rounded-xl border p-4 space-y-4" style={{ borderColor: '#00BAF2', boxShadow: '0 0 0 3px rgba(0,186,242,0.1)' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: '#0D1B3E' }}>New Offer</span>
        <button onClick={onClose} className="text-lg" style={{ color: '#7A8AAE' }}>×</button>
      </div>

      {/* Offer type grid */}
      <div className="grid grid-cols-2 gap-2">
        {OFFER_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className="text-left p-2.5 rounded-xl border-2 transition-all"
            style={{
              borderColor: type === t.id ? '#00BAF2' : '#DDE4F2',
              background: type === t.id ? '#EBF4FF' : 'white',
            }}
          >
            <div className="text-base mb-0.5">{t.icon}</div>
            <div className="text-[11px] font-semibold" style={{ color: type === t.id ? '#003DA5' : '#0D1B3E' }}>{t.label}</div>
            <div className="text-[10px]" style={{ color: '#7A8AAE' }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Title */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#7A8AAE' }}>Offer Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. ₹50 off on orders above ₹300"
          className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#00BAF2]"
          style={{ borderColor: '#DDE4F2', color: '#0D1B3E', fontFamily: 'DM Sans' }}
        />
      </div>

      {/* Value + Min */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#7A8AAE' }}>
            {type === 'percent' ? 'Discount %' : 'Value (₹)'}
          </label>
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={type === 'percent' ? '10' : '50'}
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#00BAF2]"
            style={{ borderColor: '#DDE4F2', color: '#0D1B3E', fontFamily: 'DM Mono' }}
          />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#7A8AAE' }}>Min Order (₹)</label>
          <input
            type="number"
            value={minAmount}
            onChange={e => setMinAmount(e.target.value)}
            placeholder="300"
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#00BAF2]"
            style={{ borderColor: '#DDE4F2', color: '#0D1B3E', fontFamily: 'DM Mono' }}
          />
        </div>
      </div>

      {/* Segment + Category */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#7A8AAE' }}>Target Segment</label>
          <select
            value={segment}
            onChange={e => setSegment(e.target.value as OfferSegment)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: '#DDE4F2', color: '#0D1B3E', fontFamily: 'DM Sans', background: 'white' }}
          >
            {SEGMENTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#7A8AAE' }}>Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: '#DDE4F2', color: '#0D1B3E', fontFamily: 'DM Sans', background: 'white' }}
          >
            {['Any', ...categories].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <button
        onClick={submit}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
        style={{ background: '#00BAF2' }}
      >
        🎁 Push Offer to Paytm POS
      </button>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export function OffersPage() {
  const { data: offers = [], mutate: mutateOffers } = useSWR<LocalOffer[]>(endpoints.offers, fetcher)
  const { data: dbCategories = [] } = useSWR<{name: string}[]>(endpoints.categories, fetcher)
  const catNames = dbCategories.map(c => c.name)

  const [showForm, setShowForm] = useState(false)

  // Also fetch live AI campaign drafts (offer suggestions from AI)
  const { data: campaigns } = useSWR<CampaignsResponse>(endpoints.campaigns('draft'), fetcher)
  const aiSuggestions = (campaigns?.campaigns || []).filter(c => c.agent_type === 'DYNAMIC OFFER')

  const toggle = async (id: string) => {
    mutateOffers(offers.map(o => o.id === id ? { ...o, active: !o.active } : o), false)
    await apiToggleOffer(id)
    await mutateOffers()
  }

  const remove = async (id: string) => {
    await apiDeleteOffer(id)
    await mutateOffers()
    toast.success('Offer removed')
  }

  const add = async (o: Omit<LocalOffer, 'id'>) => {
    await apiAddOffer(o)
    await mutateOffers()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0D1B3E' }}>Offer Engine</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7A8AAE' }}>Offers shown at Paytm POS checkout — per segment &amp; category</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="text-xs font-bold px-3 py-2 rounded-lg text-white transition-all hover:opacity-90 shrink-0"
          style={{ background: '#00BAF2' }}
        >
          + New Offer
        </button>
      </div>

      {/* Add form */}
      {showForm && <AddOfferForm onAdd={add} onClose={() => setShowForm(false)} categories={catNames} />}

      {/* How it works banner */}
      <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: '#002970' }}>
        <span className="text-xl mt-0.5">💡</span>
        <div>
          <div className="text-xs font-semibold text-white">How it works</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
            When a customer taps to pay at POS, MunimAI checks their segment &amp; order total and shows the best matching offer before completing payment.
          </div>
        </div>
      </div>

      {/* AI suggestions */}
      {aiSuggestions.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#7A8AAE' }}>🧠 MunimAI Suggestions</div>
          <div className="space-y-2">
            {aiSuggestions.map(c => (
              <div key={c.id} className="rounded-xl p-3 border" style={{ background: '#F5F7FD', borderColor: '#DDE4F2' }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs" style={{ color: '#0D1B3E' }}>{c.message_body}</p>
                  <button
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg text-white shrink-0"
                    style={{ background: '#003DA5' }}
                    onClick={() => toast.success('Offer pushed to engine!')}
                  >
                    Use →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active / All offers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: '#7A8AAE' }}>Your Offers</div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#EBF4FF', color: '#003DA5' }}>
            {offers.filter(o => o.active).length} active
          </span>
        </div>
        {offers.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center" style={{ borderColor: '#DDE4F2' }}>
            <p className="text-2xl mb-2">🎁</p>
            <p className="text-sm font-medium" style={{ color: '#7A8AAE' }}>No offers yet — add your first one above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {offers.map(o => (
              <OfferCard key={o.id} offer={o} onToggle={toggle} onDelete={remove} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
