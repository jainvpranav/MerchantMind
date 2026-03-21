'use client'

import { useState } from 'react'
import {
  CreditCard, CheckCircle, Tag, ArrowLeft,
  Wifi, Battery, Signal, ChevronRight, Gift, Package
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import useSWR from 'swr'
import { endpoints, fetcher } from '@/lib/api'

// ── Config ─────────────────────────────────────────────────────────────────
const MERCHANT_ID    = process.env.NEXT_PUBLIC_MERCHANT_ID || "demo-merchant-001"
const API_BASE       = process.env.NEXT_PUBLIC_API_BASE    || "http://localhost:8081"

type TerminalState = 'idle' | 'processing' | 'offer' | 'approved' | 'tagging' | 'done'

// ── Numpad ──────────────────────────────────────────────────────────────────
function Numpad({ onPress }: { onPress: (key: string) => void }) {
  const keys = ['1','2','3','4','5','6','7','8','9','.',  '0','⌫']
  return (
    <div className="grid grid-cols-3 gap-1 px-1">
      {keys.map((k) => (
        <button
          key={k}
          onClick={() => onPress(k)}
          className={`
            h-14 rounded text-xl font-bold border transition-colors active:bg-gray-200
            ${k === '⌫'
              ? 'bg-red-50 border-red-100 text-red-600'
              : 'bg-white border-gray-100 text-gray-900 shadow-sm hover:bg-gray-50'
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
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-white bg-black w-full rounded-t-[1.75rem]">
      <span className="font-medium tracking-wide">{time}</span>
      <div className="flex items-center gap-1.5 opacity-90">
        <Signal className="size-3" />
        <Wifi className="size-3" />
        <span className="font-bold ml-0.5 text-[#00BAF2]">4G</span>
        <Battery className="size-3 ml-1 fill-white" />
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
    <div className={`flex flex-wrap items-center justify-center gap-1.5 ${compact ? 'mt-3 opacity-40 grayscale' : 'mt-6 opacity-70'}`}>
      {brands.map(b => (
        <div key={b.name} className={`${compact ? 'px-1.5 py-0 text-[7px]' : 'px-2 py-0.5 text-[10px]'} rounded font-black italic tracking-tighter ${b.color}`}>
          {b.name.toUpperCase()}
        </div>
      ))}
    </div>
  )
}

export default function TerminalSimulator() {
  const [state, setState]               = useState<TerminalState>('idle')
  const [amount, setAmount]             = useState('')
  const [customerHash, setCustomerHash] = useState('8618994561')
  const [offerData, setOfferData]       = useState<{ has_offer: boolean; offers?: any[] } | null>(null)
  const [selectedOfferIndex, setSelectedOfferIndex] = useState<number>(0)
  const [discountApplied, setDiscountApplied] = useState(0)

  // Fetch live categories from the DB
  const { data: dbCategories = [] } = useSWR<{name: string, emoji: string}[]>(endpoints.categories, fetcher)

  const finalAmount = Math.max(0, parseFloat(amount || '0') - discountApplied)

  // ── Numpad handler ──────────────────────────────────────────
  const handleNumpad = (key: string) => {
    if (key === '⌫') {
      setAmount(a => a.slice(0, -1) || '')
    } else if (key === '.') {
      if (!amount.includes('.')) setAmount(a => a + '.')
    } else {
      setAmount(a => {
        if (a === '0') return key
        // Limit max digits
        if (a.replace('.', '').length > 7) return a
        return a + key
      })
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

      if (data.has_offer && data.offers && data.offers.length > 0) {
        setOfferData(data)
        setSelectedOfferIndex(0)
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
    if (offerData?.offers && offerData.offers.length > selectedOfferIndex) {
      setDiscountApplied(offerData.offers[selectedOfferIndex].discount_amount || 0)
    }
    toast.success('Offer applied!')
    completePayment()
  }

  // ── Tag category — calls merchant-api which triggers agents ─
  const handleTagCategory = async (category: string) => {
    toast.info(`Tagging as ${category}…`)

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

      // Invalidate the offer cache so the next transaction gets fresh recommendations
      await fetch(`${API_BASE}/v1/offer/invalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: MERCHANT_ID, customer_hash: customerHash })
      })
    } catch {
      // Ignore if offline
    }

    toast.success(`${category} tagged`)
    setState('done')
    setTimeout(resetTerminal, 2200)
  }

  const resetTerminal = () => {
    setState('idle')
    setAmount('')
    setCustomerHash('') // clear customer identity for the next transaction
    setOfferData(null)
    setSelectedOfferIndex(0)
    setDiscountApplied(0)
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans">

      {/* ── Paytm POS Hardware Shell (Dark Blue Bezel) ── */}
      <div 
        className="w-full max-w-[320px] h-[680px] bg-[#002970] rounded-[3rem] p-3 border-[6px] border-[#001f54] flex flex-col relative shrink-0"
        style={{ boxShadow: '0 30px 60px -15px rgba(0,20,60,0.6), inset 0 4px 10px rgba(255,255,255,0.1)' }}
      >
        {/* Hardware details: Soundbox grill holes */}
        <div className="absolute top-4 right-6 flex gap-1 text-[#001f54]">
          <div className="size-1 rounded-full bg-current" /><div className="size-1 rounded-full bg-current" /><div className="size-1 rounded-full bg-current" />
        </div>

        {/* ── Screen Bezel (Black Glass) ── */}
        <div className="flex-1 bg-black rounded-[2rem] p-1 flex flex-col overflow-hidden relative shadow-inner mt-4">
          
          {/* ── Actual Screen UI ── */}
          <div className="flex-1 bg-gray-50 rounded-[1.75rem] overflow-hidden flex flex-col relative h-[520px]">
             
             {/* Dynamic Status Bar (simulated Android on POS) */}
             <StatusBar />
             
             {/* Paytm Header */}
             <div className="flex items-center justify-center h-12 bg-white border-b border-gray-200">
               <div className="flex items-center gap-[2px]">
                 <span className="text-[#002970] font-black italic tracking-tighter text-2xl leading-none">Pay</span>
                 <span className="text-[#00BAF2] font-black italic tracking-tighter text-2xl leading-none">tm</span>
               </div>
             </div>

            {/* Screen Content Wrapper */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col relative w-full h-full">

              {/* IDLE: Amount entry + numpad */}
              {state === 'idle' && (
                <div className="flex-1 flex flex-col bg-white animate-in slide-in-from-right-4 duration-300">
                  
                  {/* Amount display */}
                  <div className="px-5 py-6 flex flex-col items-center justify-center border-b border-gray-100 bg-blue-50/30">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-2">Sale Amount</p>
                    <div className="flex items-start justify-center text-[#002970]">
                      <span className="text-3xl font-medium mt-1 mr-1">₹</span>
                      <span className={`font-bold tracking-tight ${amount.length > 5 ? 'text-4xl' : 'text-5xl'}`}>
                        {amount ? parseFloat(amount).toLocaleString('en-IN') : '0'}
                      </span>
                    </div>
                  </div>

                  {/* Customer field */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                    <div className="size-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px]">📞</div>
                    <div className="flex-1">
                      <Input
                        value={customerHash}
                        onChange={e => setCustomerHash(e.target.value)}
                        placeholder="Customer Mobile (Optional)"
                        className="h-8 border-0 bg-transparent text-gray-700 text-sm px-0 font-medium placeholder:text-gray-300 focus-visible:ring-0 shadow-none"
                      />
                    </div>
                  </div>

                  {/* Numpad */}
                  <div className="px-3 pt-4 pb-2 mt-auto">
                    <Numpad onPress={handleNumpad} />
                  </div>

                  {/* Pay button placed flat at bottom like a physical button on screen */}
                  <button
                    onClick={handleTap}
                    disabled={!amount || parseFloat(amount) <= 0}
                    className="w-full h-14 bg-[#00BAF2] disabled:bg-gray-200 disabled:text-gray-400
                      text-white font-bold text-lg flex items-center justify-center gap-2
                      transition-all active:bg-[#00a3d4]"
                  >
                    Collect ₹{amount ? parseFloat(amount).toLocaleString('en-IN') : '0'}
                  </button>
                </div>
              )}

              {/* PROCESSING */}
              {state === 'processing' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-white p-6 animate-in zoom-in-95 duration-200">
                  <div className="relative size-16 mb-8">
                    <div className="absolute inset-0 border-4 border-gray-100 rounded-full" />
                    <div className="absolute inset-0 border-4 border-[#00BAF2] rounded-full border-t-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <CreditCard className="size-6 text-[#002970]" />
                    </div>
                  </div>
                  <h3 className="font-bold text-[#002970] text-lg">Processing...</h3>
                  <p className="text-xs text-gray-500 mt-2 text-center">Checking MunimAI for personalized offers...</p>
                  
                  <CardLogos />
                </div>
              )}

              {/* OFFER */}
              {state === 'offer' && offerData && offerData.offers && (
                <div className="flex-1 flex flex-col bg-slate-50 animate-in slide-in-from-bottom-2 duration-300 h-full">
                  
                  <div className="bg-[#002970] px-4 py-4 text-center text-white relative flex shrink-0 items-center justify-center shadow-md z-10">
                    <Gift className="size-5 text-[#00BAF2] mr-2" />
                    <h2 className="text-sm font-bold tracking-wider uppercase">Select Offer</h2>
                  </div>

                  <div className="flex-1 p-3 flex flex-col overflow-y-auto">
                    <p className="text-xs font-semibold text-gray-500 mb-2 px-1 text-center">Recommended by MunimAI</p>
                    <div className="space-y-2 mb-4">
                      {offerData.offers.map((off, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedOfferIndex(idx)}
                          className={`w-full text-left border rounded-xl overflow-hidden active:scale-[0.98] transition-all flex flex-col ${
                            selectedOfferIndex === idx 
                            ? 'border-[#00BAF2] bg-blue-50 ring-1 ring-[#00BAF2] shadow-sm' 
                            : 'border-gray-200 bg-white opacity-80 hover:opacity-100 shadow-sm'
                          }`}
                        >
                          <div className={`p-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-white ${selectedOfferIndex === idx ? 'bg-[#00BAF2]' : 'bg-gray-300'}`}>
                            {off.offer_category}
                          </div>
                          <div className="p-3 bg-opacity-50">
                            <div className="font-bold text-[#002970] text-[13px] mb-1 leading-snug">{off.display_text}</div>
                            <div className="text-xs font-black text-green-600">Save ₹{off.discount_amount}</div>
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="mt-auto bg-white border border-gray-200 rounded-xl p-3 shadow-sm mb-3 shrink-0">
                      <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                        <span>Original Amount:</span>
                        <span className="font-semibold text-gray-700">₹{parseFloat(amount || '0').toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-green-600 font-medium mb-2 border-b border-dashed border-gray-200 pb-2">
                        <span>Selected Discount:</span>
                        <span>-₹{offerData.offers[selectedOfferIndex].discount_amount}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-800 font-bold text-sm">New Total:</span>
                        <span className="text-lg font-black text-[#002970]">
                          ₹{Math.max(0, parseFloat(amount || '0') - (offerData.offers[selectedOfferIndex].discount_amount || 0)).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 shrink-0">
                      <button
                        onClick={handleAcceptOffer}
                        className="w-full h-12 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md"
                      >
                        <CheckCircle className="size-4" /> Apply & Pay
                      </button>
                      <button
                        onClick={completePayment}
                        className="w-full h-10 bg-transparent text-gray-500 hover:bg-gray-100 font-semibold rounded-xl text-sm transition-all"
                      >
                        Skip Offer
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* APPROVED */}
              {state === 'approved' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-green-50 animate-in zoom-in duration-300">
                  <div className="size-24 rounded-full bg-green-500 flex items-center justify-center shadow-xl shadow-green-500/30 mb-6">
                    <CheckCircle className="size-12 text-white" />
                  </div>
                  <h3 className="text-2xl font-black text-green-700 tracking-tight">Payment</h3>
                  <h3 className="text-2xl font-black text-green-700 tracking-tight">Successful</h3>
                  <div className="mt-4 px-4 py-1.5 bg-green-100 text-green-800 rounded-full font-bold">
                    ₹{finalAmount.toLocaleString('en-IN')}
                  </div>
                </div>
              )}

              {/* TAGGING */}
              {state === 'tagging' && (
                <div className="flex-1 flex flex-col bg-white animate-in slide-in-from-right-8 duration-300">
                  <div className="bg-[#002970] p-4 text-white">
                    <h2 className="font-bold text-lg flex items-center gap-2">
                      <Tag className="size-4 opacity-70" /> Category Tagging
                    </h2>
                    <p className="text-xs text-blue-200 mt-1 opacity-90 leading-tight">
                      Tag this sale to update MunimAI analytics & trigger smart restock agents.
                    </p>
                  </div>

                  <div className="flex-1 p-3 overflow-y-auto">
                    {dbCategories.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                        <Package className="size-8 mb-3 opacity-20" />
                        <p className="text-sm">No categories in database.</p>
                        <p className="text-xs mt-1">Add them via Merchant Dashboard.</p>
                        <button onClick={() => handleTagCategory('Uncategorized')} className="mt-6 text-[#00BAF2] font-semibold">Skip Tagging →</button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {dbCategories.map((cat) => (
                          <button
                            key={cat.name}
                            onClick={() => handleTagCategory(cat.name)}
                            className="flex flex-col items-center justify-center gap-2 h-24 rounded-xl border border-gray-200 bg-white shadow-sm active:bg-blue-50 active:border-blue-200 transition-all text-gray-700 hover:border-[#00BAF2]"
                          >
                            <span className="text-3xl drop-shadow-sm">{cat.emoji}</span>
                            <span className="text-xs font-bold px-1 text-center leading-tight truncate w-full">{cat.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {dbCategories.length > 0 && (
                    <div className="p-3 border-t border-gray-100 bg-gray-50">
                      <button 
                        onClick={() => handleTagCategory('Misc')}
                        className="w-full py-3 text-sm font-semibold text-gray-500 rounded-lg active:bg-gray-200 transition-all"
                      >
                        Skip / Misc
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* DONE */}
              {state === 'done' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-white animate-in fade-in duration-300">
                  <div className="size-16 rounded-full bg-[#00BAF2]/10 flex items-center justify-center mb-4">
                    <CheckCircle className="size-8 text-[#00BAF2]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#002970]">All Done</h3>
                  <p className="text-sm text-gray-500 mt-1">Analytics Updated</p>
                  
                  <button
                    onClick={resetTerminal}
                    className="mt-8 flex items-center gap-2 px-6 py-3 rounded-full bg-gray-100 hover:bg-gray-200 text-[#002970] font-bold transition-all active:scale-95"
                  >
                    <ArrowLeft className="size-4" /> Next Order
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Hardware button row underneath screen */}
        <div className="mt-3 flex gap-2 w-full justify-center px-6">
          <div className="h-2 w-8 bg-[#001f54] rounded-full shadow-inner" />
          <div className="h-2 w-8 bg-red-600/30 rounded-full shadow-inner" />
          <div className="h-2 w-8 bg-green-500/30 rounded-full shadow-inner" />
        </div>
      </div>

      {/* Caption */}
      <p className="mt-8 text-center text-xs text-gray-400 max-w-xs leading-relaxed font-medium">
        Hardware mock of Paytm Android POS integrating dynamic MunimAI ML offers and live database categorisation.
      </p>
    </div>
  )
}
