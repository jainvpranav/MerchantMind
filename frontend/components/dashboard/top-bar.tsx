import Link from 'next/link'
import { MonitorSmartphone } from 'lucide-react'

export function TopBar() {
  return (
    <header
      className="h-[52px] flex items-center justify-between px-4 sticky top-0 z-50"
      style={{ background: '#002970' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-xs"
          style={{ background: '#00BAF2' }}
        >
          M
        </div>
        <span className="text-white font-semibold text-sm leading-tight">
          Munim<span style={{ color: '#00BAF2' }}>AI</span>
        </span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide hidden sm:block"
          style={{ background: 'rgba(0,186,242,0.15)', color: '#00BAF2' }}
        >
          by Paytm
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] hidden sm:block" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Mono, monospace' }}>
          MID: <span style={{ color: 'rgba(255,255,255,0.55)' }}>PTM_9847221</span>
        </span>

        {/* Merchant chip */}
        <div
          className="flex items-center gap-2 rounded-full px-2.5 py-1 border"
          style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}
        >
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold"
            style={{ background: '#00BAF2', fontSize: '9px' }}
          >
            RS
          </div>
          <span className="text-xs font-medium hidden sm:block" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Raj Mart
          </span>
        </div>

        <Link
          href="/terminal"
          target="_blank"
          className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-all"
          style={{ background: 'rgba(0,186,242,0.15)', color: '#00BAF2', border: '1px solid rgba(0,186,242,0.25)' }}
        >
          <MonitorSmartphone className="size-3.5" />
          <span className="hidden sm:block">POS</span>
        </Link>
      </div>
    </header>
  )
}
