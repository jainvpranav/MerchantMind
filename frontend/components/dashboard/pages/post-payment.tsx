'use client'

import { useState } from 'react'
import { toast } from 'sonner'

const CATEGORIES = [
  { emoji: '🍬', name: 'Sweets',      sub: 'Mithai'     },
  { emoji: '🥘', name: 'Snacks',      sub: 'Namkeen'    },
  { emoji: '🛒', name: 'Grocery',     sub: 'Staples'    },
  { emoji: '👗', name: 'Apparel',     sub: 'Clothing'   },
  { emoji: '💊', name: 'Medical',     sub: 'Pharmacy'   },
  { emoji: '📱', name: 'Electronics', sub: 'Gadgets'    },
  { emoji: '🏠', name: 'Home',        sub: 'Household'  },
  { emoji: '📦', name: 'Other',       sub: 'Misc'       },
]

const STEPS = ['Payment', 'Upload & Scan', 'Category', 'Customer', 'Confirm']

export function PostPaymentPage() {
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [uploadState, setUploadState] = useState<'idle' | 'scanning' | 'done'>('idle')

  const handleUpload = () => {
    setUploadState('scanning')
    setTimeout(() => {
      setUploadState('done')
      toast.success('AI Scan Complete — 3 items found at 93% confidence')
    }, 1800)
  }

  const handlePhone = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10)
    setPhone(digits)
    if (digits.length === 10) setPhoneVerified(true)
    else setPhoneVerified(false)
  }

  const handleConfirm = () => {
    toast.success('Saved to Inventory! INV_20250321_0847 · Customer linked')
  }

  const currentStep = uploadState === 'idle' ? 1 : uploadState === 'scanning' ? 1 : selectedCat ? (phoneVerified ? 4 : 3) : 2

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0D1B3E' }}>Post-Payment Entry</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7A8AAE' }}>Upload receipt · Tag category · Link customer</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#E4F8F1', color: '#008A5E' }}>
            ● TXN LIVE
          </span>
        </div>
      </div>

      {/* Step indicator — horizontal scroll on mobile */}
      <div className="flex items-center overflow-x-auto pb-1 gap-0 anim anim-d1" style={{ scrollbarWidth: 'none' }}>
        {STEPS.map((step, i) => {
          const isDone = i < currentStep
          const isActive = i === currentStep
          return (
            <div key={step} className="flex items-center shrink-0">
              <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium ${
                isDone ? 'text-[#00C48C]' : isActive ? 'bg-[#EBF4FF] text-[#003DA5] font-semibold' : 'text-[#7A8AAE]'
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isDone ? 'bg-[#00C48C] text-white' : isActive ? 'bg-[#002970] text-white' : 'bg-[#DDE4F2] text-[#7A8AAE]'
                }`}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span className="whitespace-nowrap">{step}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="h-px w-4 shrink-0" style={{ background: '#DDE4F2' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-xl border p-4 anim anim-d2" style={{ borderColor: '#DDE4F2' }}>
        <div className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#0D1B3E' }}>
          <span>📸</span> Receipt / Item Photo
        </div>
        {uploadState === 'idle' ? (
          <button
            onClick={handleUpload}
            className="w-full rounded-xl border-2 border-dashed py-8 flex flex-col items-center gap-2 transition-all hover:border-[#00BAF2] hover:bg-blue-50"
            style={{ borderColor: '#DDE4F2', background: '#F5F7FD' }}
          >
            <span className="text-3xl">📷</span>
            <span className="text-sm font-semibold" style={{ color: '#0D1B3E' }}>Drop receipt photo here</span>
            <span className="text-xs" style={{ color: '#7A8AAE' }}>or tap to browse camera / gallery</span>
            <div className="flex gap-2 mt-1">
              {['JPG','PNG','PDF','HEIC'].map(f => (
                <span key={f} className="text-[10px] px-2 py-0.5 border rounded font-mono" style={{ borderColor: '#DDE4F2', color: '#7A8AAE', background: 'white' }}>{f}</span>
              ))}
            </div>
          </button>
        ) : uploadState === 'scanning' ? (
          <div className="py-8 flex flex-col items-center gap-3">
            <span className="text-3xl animate-spin">⏳</span>
            <span className="text-sm font-semibold" style={{ color: '#0D1B3E' }}>Scanning with AI…</span>
            <span className="text-xs" style={{ color: '#7A8AAE' }}>Calling POST /api/v1/inventory/scan</span>
          </div>
        ) : (
          <div>
            <div className="py-3 flex flex-col items-center gap-1 text-center">
              <span className="text-2xl">✅</span>
              <span className="text-sm font-semibold" style={{ color: '#0D1B3E' }}>Scan complete — 3 items found</span>
              <span className="text-xs" style={{ color: '#7A8AAE' }}>93% confidence · Ready to review</span>
            </div>
            {/* AI scan result */}
            <div className="rounded-xl overflow-hidden mt-2" style={{ background: '#002970' }}>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <span className="text-sm">🤖</span>
                <span className="text-sm font-semibold text-white">AI Extraction Result</span>
                <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,196,140,0.2)', color: '#00C48C' }}>
                  93% confidence
                </span>
              </div>
              {[
                { name: 'Motichoor Laddoo', meta: 'Sweets · Perishable', qty: '×2 kg', price: '₹480' },
                { name: 'Kaju Katli Box',   meta: 'Premium Sweets · 500g', qty: '×3 pcs', price: '₹1,350' },
                { name: 'Gulab Jamun Mix',  meta: 'Ready-to-cook · 1kg', qty: '×5 pcs', price: '₹625' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div>
                    <div className="text-sm font-medium text-white">{item.name}</div>
                    <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{item.meta}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>{item.qty}</span>
                    <span className="text-sm font-medium font-mono" style={{ color: '#00BAF2' }}>{item.price}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 px-4 py-2" style={{ background: 'rgba(0,186,242,0.08)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-[#00C48C]" />
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Extracted via <span style={{ color: '#00C48C', fontWeight: 600 }}>Paytm Vision API</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TXN summary box */}
      <div className="rounded-xl overflow-hidden anim anim-d3" style={{ background: '#002970' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#003DA5' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold text-white" style={{ background: '#00C48C' }}>✓</div>
          <div>
            <div className="text-sm font-bold text-white">Payment Confirmed</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Paytm PG · UPI · 09:45:12 AM</div>
          </div>
          <div className="ml-auto text-lg font-bold font-mono" style={{ color: '#00C48C' }}>₹2,455</div>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          {[
            ['Transaction ID', 'PTM20250321094512'],
            ['Order ID', 'ORDER_984721'],
            ['Payment Mode', 'UPI / @okaxis'],
            ['Status', 'TXN_SUCCESS'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between items-center">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{k}</span>
              <span className="text-xs font-medium font-mono" style={{ color: k === 'Status' ? '#00C48C' : 'rgba(255,255,255,0.85)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Category grid */}
      <div className="bg-white rounded-xl border p-4 anim anim-d4" style={{ borderColor: '#DDE4F2' }}>
        <div className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#0D1B3E' }}>
          <span>🏷️</span> Select Category
        </div>
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setSelectedCat(cat.name)}
              className="flex flex-col items-center py-3 px-1 rounded-xl border-2 transition-all text-center"
              style={{
                borderColor: selectedCat === cat.name ? '#00BAF2' : '#DDE4F2',
                background: selectedCat === cat.name ? '#EBF4FF' : 'white',
              }}
            >
              <span className="text-2xl mb-1">{cat.emoji}</span>
              <span className="text-[10px] font-semibold" style={{ color: selectedCat === cat.name ? '#003DA5' : '#0D1B3E' }}>
                {cat.name}
              </span>
              <span className="text-[9px]" style={{ color: '#7A8AAE' }}>{cat.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Customer phone */}
      <div className="bg-white rounded-xl border p-4 anim anim-d5" style={{ borderColor: '#DDE4F2' }}>
        <div className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#0D1B3E' }}>
          <span>📞</span> Customer Phone
        </div>
        <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#7A8AAE' }}>
          Mobile Number (linked to Paytm account)
        </div>
        <div
          className="flex rounded-xl overflow-hidden border-[1.5px] transition-all focus-within:border-[#00BAF2]"
          style={{ borderColor: '#DDE4F2' }}
        >
          <div className="flex items-center gap-1.5 px-3 text-sm font-semibold border-r" style={{ background: '#F5F7FD', borderColor: '#DDE4F2', color: '#7A8AAE' }}>
            🇮🇳 +91
          </div>
          <input
            type="tel"
            value={phone}
            onChange={e => handlePhone(e.target.value)}
            placeholder="98765 43210"
            maxLength={10}
            className="flex-1 px-3 py-2.5 text-sm font-mono outline-none bg-white"
            style={{ color: '#0D1B3E', fontFamily: 'DM Mono, monospace' }}
          />
          <button
            onClick={() => phone.length === 10 && setPhoneVerified(true)}
            className="px-4 text-xs font-bold text-white transition-all"
            style={{ background: '#00BAF2' }}
          >
            Verify →
          </button>
        </div>
        {phoneVerified && (
          <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: '#00C48C' }}>
            <span>✓</span>
            <span>Paytm account found — Rajesh Kumar (Repeat buyer · 4 visits)</span>
          </div>
        )}
      </div>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        className="w-full py-4 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
        style={{ background: '#00BAF2' }}
      >
        ✅ Save to Inventory &amp; CRM
      </button>
      <p className="text-center text-[11px]" style={{ color: '#7A8AAE' }}>
        Calls POST /api/v1/inventory/entry · POST /api/v1/customers/link
      </p>
    </div>
  )
}
