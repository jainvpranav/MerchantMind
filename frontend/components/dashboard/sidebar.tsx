'use client'

import { cn } from '@/lib/utils'

interface SidebarProps {
  currentPage: string
  onPageChange: (page: string) => void
  pendingDrafts: number
}

// 4 focused screens
const navItems = [
  { id: 'overview',   label: 'Analytics',  icon: '📊', section: 'Dashboard' },
  { id: 'actions',    label: 'Insights',   icon: '🧠', section: 'AI Agent'  },
  { id: 'offers',     label: 'Offers',     icon: '🎁', section: 'Paytm PG'  },
  { id: 'inventory',  label: 'Categories', icon: '🗂️', section: null         },
  { id: 'customers',  label: 'Customers',  icon: '👥', section: 'CRM'        },
]

export function Sidebar({ currentPage, onPageChange, pendingDrafts }: SidebarProps) {
  const sections: { title: string | null; items: typeof navItems }[] = []
  let cur: { title: string | null; items: typeof navItems } | null = null
  for (const item of navItems) {
    if (item.section !== null) {
      cur = { title: item.section, items: [item] }
      sections.push(cur)
    } else if (cur) {
      cur.items.push(item)
    }
  }

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside
        className="hidden md:flex w-[220px] flex-col h-screen fixed left-0 top-0 border-r"
        style={{ background: '#FFFFFF', borderColor: '#DDE4F2' }}
      >
        {/* Logo row matching topbar height */}
        <div className="h-[52px] flex items-center px-4 gap-2" style={{ background: '#002970' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-xs" style={{ background: '#00BAF2' }}>M</div>
          <span className="text-white font-semibold text-sm">Munim<span style={{ color: '#00BAF2' }}>AI</span></span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {sections.map(({ title, items }) => (
            <div key={title}>
              <div className="px-4 py-2 text-[9.5px] font-bold uppercase tracking-widest" style={{ color: '#7A8AAE' }}>
                {title}
              </div>
              {items.map((item) => {
                const isActive = currentPage === item.id
                const showBadge = item.id === 'actions' && pendingDrafts > 0
                return (
                  <button
                    key={item.id}
                    onClick={() => onPageChange(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-all border-l-[3px]',
                      isActive
                        ? 'border-l-[#00BAF2] bg-[#EBF4FF] text-[#003DA5] font-semibold'
                        : 'border-l-transparent text-[#7A8AAE] hover:bg-[#F5F7FD] hover:text-[#0D1B3E]'
                    )}
                  >
                    <span className="text-sm w-5 text-center">{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {showBadge && (
                      <span className="text-[9px] font-bold text-white w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#E84040' }}>
                        {pendingDrafts}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer: MID display */}
        <div className="p-4 border-t" style={{ borderColor: '#DDE4F2' }}>
          <div className="rounded-lg px-3 py-2" style={{ background: '#F5F7FD', fontFamily: 'DM Mono, monospace' }}>
            <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: '#7A8AAE' }}>Merchant ID</div>
            <div className="text-[10px] font-medium" style={{ color: '#002970' }}>PTM_MERCH_9847221</div>
            <div className="text-[9px] mt-1" style={{ color: '#7A8AAE' }}>
              Paytm PG: <span style={{ color: '#00C48C' }}>LIVE</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t" style={{ background: '#FFFFFF', borderColor: '#DDE4F2' }}>
        <ul className="flex justify-around py-1">
          {navItems.map((item) => {
            const isActive = currentPage === item.id
            const showBadge = item.id === 'offers' && pendingDrafts > 0
            return (
              <li key={item.id} className="relative">
                <button
                  onClick={() => onPageChange(item.id)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-medium transition-colors',
                    isActive ? 'text-[#003DA5]' : 'text-[#7A8AAE]'
                  )}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="leading-none">{item.label}</span>
                  {isActive && (
                    <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ background: '#00BAF2' }} />
                  )}
                  {showBadge && (
                    <span className="absolute top-1 right-1 text-[8px] font-bold text-white w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: '#E84040' }}>
                      {pendingDrafts}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
