'use client'

import { useState } from 'react'
import {
  CreditCard, CheckCircle, Tag, ArrowLeft,
  Wifi, Battery, Signal, Clock, ChevronRight,
  ShoppingBag, Package, Pill, Shirt, Coffee, Cpu, MoreHorizontal
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// ── Config ─────────────────────────────────────────────────────────────────
const MERCHANT_ID    = process.env.NEXT_PUBLIC_MERCHANT_ID || "9351981c-0e94-401a-b982-024eab47b520"
const API_BASE       = process.env.NEXT_PUBLIC_API_BASE    || "http://localhost:8081"

type TerminalState = 'idle' | 'processing' | 'offer' | 'approved' | 'tagging' | 'done'

const CATEGORIES = [
  { label: 'Grocery',     icon: ShoppingBag, color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' },
  { label: 'Pharma',      icon: Pill,         color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'   },
  { label: 'Clothing',    icon: Shirt,        color: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100' },
  { label: 'Food & Bev',  icon: Coffee,       color: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' },
  { label: 'Electronics', icon: Cpu,           color: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' },
  { label: 'Misc',        icon: MoreHorizontal,color: 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'   },
]

// ── Numpad ──────────────────────────────────────────────────────────────────
function Numpad({ onPress }: { onPress: (key: string) => void }) {
  const keys = ['1','2','3','4','5','6','7','8','9','.',  '0','⌫']
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {keys.map((k) => (
        <button
          key={k}
          onClick={() => onPress(k)}
          className={`
            h-12 rounded-xl text-lg font-semibold border transition-all active:scale-95
            ${k === '⌫'
              ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
              : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50 shadow-sm'
            }
          `}
        >
          {k}
        </button>
      ))}
    </div>
  )
}

// ── Status bar ──────────────────────────────────────────────────────────────
function StatusBar() {
  const now = new Date()
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
      <span className="font-medium">{time}</span>
      <div className="flex items-center gap-2">
        <Signal className="size-3" />
        <Wifi className="size-3" />
        <Battery className="size-3" />
      </div>
    </div>
  )
}

// ── Card Brands ──────────────────────────────────────────────────────────────
function CardLogos({ compact = false }: { compact?: boolean }) {
  const brands = [
    { name: 'Visa', color: 'bg-[#1A1F71] text-white' },
    { name: 'Mastercard', color: 'bg-[#EB001B] text-white' },
    { name: 'RuPay', color: 'bg-[#FF9933] text-white' },
    { name: 'Amex', color: 'bg-[#007BC1] text-white' },
  ]
  
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${compact ? 'mt-2 opacity-50 grayscale' : 'mt-6 opacity-80'}`}>
      {brands.map(b => (
        <div key={b.name} className={`${compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-3 py-1 text-xs'} rounded font-black italic tracking-tighter ${b.color}`}>
          {b.name.toUpperCase()}
        </div>
      ))}
    </div>
  )
}

export default function TerminalSimulator() {
  const [state, setState]               = useState<TerminalState>('idle')
  const [amount, setAmount]             = useState('1500')
  const [customerHash, setCustomerHash] = useState('cust_demo_789')
  const [offer, setOffer]               = useState<{ has_offer: boolean; display_text?: string; offer_category?: string; discount_amount?: number } | null>(null)
  const [discountApplied, setDiscountApplied] = useState(0)

  const finalAmount = Math.max(0, parseFloat(amount || '0') - discountApplied)

  // ── Numpad handler ──────────────────────────────────────────
  const handleNumpad = (key: string) => {
    if (key === '⌫') {
      setAmount(a => a.slice(0, -1) || '0')
    } else if (key === '.') {
      if (!amount.includes('.')) setAmount(a => a + '.')
    } else {
      setAmount(a => (a === '0' ? key : a + key))
    }
  }

  // ── Tap to Pay ──────────────────────────────────────────────
  const handleTap = async () => {
    if (!amount || parseFloat(amount) <= 0 || !customerHash) return
    setState('processing')

    try {
      const res  = await fetch(`${API_BASE}/v1/offer/realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: MERCHANT_ID, customer_hash: customerHash }),
      })
      const data = await res.json()

      if (data.has_offer) {
        setOffer(data)
        setState('offer')
      } else {
        completePayment()
      }
    } catch {
      toast.error('Offer engine offline — proceeding to payment')
      completePayment()
    }
  }

  const completePayment = () => {
    setState('approved')
    setTimeout(() => setState('tagging'), 1800)
  }

  const handleAcceptOffer = () => {
    if (offer?.discount_amount) {
      setDiscountApplied(offer.discount_amount)
    }
    toast.success('Offer applied!')
    completePayment()
  }

  // ── Tag category — calls merchant-api which triggers agents ─
  const handleTagCategory = async (category: string) => {
    toast.info(`Tagging as ${category}…`)

    // POST transaction tag → merchant-api records it in DB
    // The restock + recovery agents are triggered separately via
    // POST /v1/merchant/:id/agent/restock and /agent/recovery
    try {
      await fetch(`${API_BASE}/v1/transaction/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id:   MERCHANT_ID,
          amount:        finalAmount,
          category,
          customer_hash: customerHash,
        }),
      })
    } catch {
      // Non-fatal — tag might not be implemented yet as a separate endpoint
    }

    toast.success(`${category} tagged — analytics updated`)
    setState('done')
    setTimeout(resetTerminal, 2200)
  }

  const resetTerminal = () => {
    setState('idle')
    setAmount('0')
    setOffer(null)
    setDiscountApplied(0)
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex flex-col items-center justify-center p-4">

      {/* POS Device Shell */}
      <div className="w-full max-w-[340px] bg-white rounded-[2rem] shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
        style={{ boxShadow: '0 25px 60px -10px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)' }}
      >

        {/* ── Top notch / camera bar ─────────────────────── */}
        <div className="h-5 bg-gray-900 flex items-center justify-center">
          <div className="w-16 h-1.5 bg-gray-700 rounded-full" />
        </div>

        {/* ── Status Bar ─────────────────────────────────── */}
        <StatusBar />

        {/* ── Pine Labs Header ───────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-red-600 flex items-center justify-center">
              <CreditCard className="size-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800 leading-none">Pine Labs</p>
              <p className="text-[10px] text-gray-400">Plutus Smart POS</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 bg-green-50 px-1.5 py-0">
            ONLINE
          </Badge>
        </div>

        {/* ── Screen Content (min height to avoid jumps) ─── */}
        <div className="flex-1 min-h-[420px] flex flex-col">

          {/* IDLE: Amount entry + numpad */}
          {state === 'idle' && (
            <div className="flex-1 flex flex-col p-4 gap-4 animate-in fade-in duration-200">
              {/* Amount display */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Sale Amount</p>
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-bold text-gray-400">₹</span>
                  <span className="text-5xl font-bold text-gray-900 tracking-tight leading-none">
                    {parseFloat(amount || '0').toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Customer field */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1 block">Customer ID (demo)</label>
                <Input
                  value={customerHash}
                  onChange={e => setCustomerHash(e.target.value)}
                  className="h-9 bg-gray-50 border-gray-200 text-gray-700 text-sm rounded-xl"
                />
              </div>

              {/* Numpad */}
              <Numpad onPress={handleNumpad} />

              {/* Pay button */}
              <button
                onClick={handleTap}
                disabled={parseFloat(amount || '0') <= 0}
                className="w-full h-14 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400
                  text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-3
                  transition-all active:scale-95 shadow-lg shadow-red-600/30"
              >
                <CreditCard className="size-5" />
                Pay ₹{parseFloat(amount || '0').toLocaleString('en-IN')}
              </button>
            </div>
          )}

          {/* PROCESSING */}
          {state === 'processing' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-300">
              <div className="relative size-20 mb-6">
                <div className="absolute inset-0 border-4 border-gray-100 rounded-full" />
                <div className="absolute inset-0 border-4 border-red-500 rounded-full border-t-transparent animate-spin" />
                <CreditCard className="absolute inset-0 m-auto size-7 text-gray-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-800">Checking Offers…</p>
                <p className="text-xs text-gray-400 mt-1">Contacting MerchantMind AI</p>
              </div>
              
              <CardLogos />
            </div>
          )}

          {/* OFFER */}
          {state === 'offer' && offer && (
            <div className="flex-1 flex flex-col p-5 gap-4 animate-in slide-in-from-bottom-4 duration-300">
              <div className="text-center">
                <Badge className="bg-red-600 text-white border-0 mb-3">🎁 Exclusive Offer</Badge>
                <h2 className="text-xl font-bold text-gray-900 leading-snug">
                  {offer.display_text}
                </h2>
                <p className="text-xs text-gray-400 mt-2">Powered by MerchantMind AI · Valid for this transaction only</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-amber-100 rounded-full flex items-center justify-center text-xl">🛒</div>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Category: {offer.offer_category || 'Special'}</p>
                    <p className="text-xs text-amber-600">This offer was personalised for you</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mt-auto">
                <Button
                  onClick={handleAcceptOffer}
                  className="w-full h-13 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl"
                >
                  <CheckCircle className="size-4 mr-2" />
                  Apply Offer & Pay ₹{Math.max(0, parseFloat(amount || '0') - (offer.discount_amount || 0)).toLocaleString('en-IN')}
                </Button>
                <button
                  onClick={completePayment}
                  className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 underline-offset-2 hover:underline"
                >
                  No thanks, pay full amount
                </button>
              </div>
              
              <CardLogos compact />
            </div>
          )}

          {/* APPROVED */}
          {state === 'approved' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-in zoom-in duration-300">
              <div className="size-24 bg-green-50 border-4 border-green-200 rounded-full flex items-center justify-center">
                <CheckCircle className="size-12 text-green-500" />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-gray-900">Approved</h3>
                <p className="text-sm text-gray-400 mt-1">₹{finalAmount.toLocaleString('en-IN')} · Processing…</p>
              </div>
            </div>
          )}

          {/* TAGGING */}
          {state === 'tagging' && (
            <div className="flex-1 flex flex-col p-4 gap-4 animate-in slide-in-from-bottom-6 duration-300">
              <div className="text-center">
                <div className="inline-flex size-11 rounded-full bg-blue-50 border border-blue-100 items-center justify-center mb-3">
                  <Tag className="size-5 text-blue-500" />
                </div>
                <h2 className="font-bold text-gray-900">What did they buy?</h2>
                <p className="text-xs text-gray-400 mt-1">Tag for MerchantMind analytics</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(({ label, icon: Icon, color }) => (
                  <button
                    key={label}
                    onClick={() => handleTagCategory(label)}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${color}`}
                  >
                    <Icon className="size-4 flex-shrink-0" />
                    {label}
                    <ChevronRight className="size-3 ml-auto opacity-50" />
                  </button>
                ))}
              </div>

              <p className="text-center text-[11px] text-gray-300">
                Tagging feeds the Restock & Recovery AI agents
              </p>
            </div>
          )}

          {/* DONE */}
          {state === 'done' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 animate-in zoom-in duration-200">
              <div className="size-16 bg-green-50 rounded-full flex items-center justify-center">
                <CheckCircle className="size-8 text-green-500" />
              </div>
              <p className="font-semibold text-gray-700">Transaction Complete</p>
              <p className="text-xs text-gray-400">Ready for next customer…</p>
            </div>
          )}

        </div>

        {/* ── Bottom home bar ─────────────────────────────── */}
        {state !== 'idle' && (
          <div className="px-4 pb-4 pt-2">
            <button
              onClick={resetTerminal}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-all"
            >
              <ArrowLeft className="size-3" /> New Transaction
            </button>
          </div>
        )}
        <div className="h-5 bg-gray-50 border-t border-gray-100 flex items-center justify-center">
          <div className="w-20 h-1 bg-gray-200 rounded-full" />
        </div>
      </div>

      {/* Caption */}
      <p className="mt-6 text-center text-xs text-gray-400 max-w-xs leading-relaxed">
        Pine Labs Plutus Smart POS — Pre-payment AI offers &amp; post-payment category tagging for MerchantMind analytics.
      </p>
    </div>
  )
}
