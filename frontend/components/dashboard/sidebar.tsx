'use client'

import { LayoutDashboard, ShoppingCart, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface SidebarProps {
  currentPage: string
  onPageChange: (page: string) => void
  pendingDrafts: number
}

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'patterns', label: 'Basket Patterns', icon: ShoppingCart },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'actions', label: 'Agent Actions', icon: Zap },
]

export function Sidebar({ currentPage, onPageChange, pendingDrafts }: SidebarProps) {
  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-zinc-950 border-r border-zinc-800 h-screen fixed left-0 top-0">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-bold text-zinc-100">
            <span className="text-red-500">Merchant</span>Mind
          </h1>
        </div>
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.id
              const showBadge = item.id === 'actions' && pendingDrafts > 0

              return (
                <li key={item.id}>
                  <button
                    onClick={() => onPageChange(item.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                    )}
                  >
                    <Icon className="size-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {showBadge && (
                      <Badge className="bg-red-500 text-white border-0 text-xs px-1.5">
                        {pendingDrafts}
                      </Badge>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 z-50">
        <ul className="flex justify-around py-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            const showBadge = item.id === 'actions' && pendingDrafts > 0

            return (
              <li key={item.id}>
                <button
                  onClick={() => onPageChange(item.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 px-4 py-2 text-xs transition-colors relative',
                    isActive ? 'text-red-500' : 'text-zinc-400'
                  )}
                >
                  <Icon className="size-5" />
                  <span>{item.label.split(' ')[0]}</span>
                  {showBadge && (
                    <span className="absolute -top-1 right-2 bg-red-500 text-white text-xs rounded-full size-5 flex items-center justify-center">
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
