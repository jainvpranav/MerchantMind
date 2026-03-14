import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { MonitorSmartphone } from 'lucide-react'

export function TopBar() {
  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-zinc-100">Demo Store</h2>
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <span className="size-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
          Live
        </Badge>
      </div>

      <Link 
        href="/terminal" 
        target="_blank"
        className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors border border-zinc-700"
      >
        <MonitorSmartphone className="size-4 text-red-400" />
        Launch POS Terminal
      </Link>
    </header>
  )
}
