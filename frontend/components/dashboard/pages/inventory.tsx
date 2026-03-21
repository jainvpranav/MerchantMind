'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { endpoints, fetcher, addCategory as apiAddCategory, deleteCategory as apiDeleteCategory } from '@/lib/api'

const EMOJI_OPTIONS = ['🍬','🥘','🛒','👗','💊','📱','🏠','🍕','☕','🎯','🧴','🐾','🎸','📚','🌿']

export function InventoryPage() {
  const { data: categories = [], mutate } = useSWR<{emoji: string, name: string, desc: string}[]>(endpoints.categories, fetcher)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newEmoji, setNewEmoji] = useState('📦')
  const [showForm, setShowForm] = useState(false)

  const addCategory = async () => {
    if (!newName.trim()) return toast.error('Enter a category name')
    if (categories.find(c => c.name.toLowerCase() === newName.trim().toLowerCase())) {
      return toast.error('Category already exists')
    }
    
    await apiAddCategory({ emoji: newEmoji, name: newName.trim(), desc: newDesc.trim() || newName.trim() })
    await mutate()
    
    setNewName('')
    setNewDesc('')
    setNewEmoji('📦')
    setShowForm(false)
    toast.success(`"${newName.trim()}" category added`)
  }

  const removeCategory = async (name: string) => {
    await apiDeleteCategory(name)
    await mutate()
    toast.success('Category removed')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0D1B3E' }}>Categories</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7A8AAE' }}>Product categories for offer targeting &amp; analytics</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="text-xs font-bold px-3 py-2 rounded-lg text-white transition-all hover:opacity-90 shrink-0"
          style={{ background: '#00BAF2' }}
        >
          + Add
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl border p-4 space-y-3" style={{ borderColor: '#00BAF2', boxShadow: '0 0 0 3px rgba(0,186,242,0.08)' }}>
          <div className="text-sm font-bold" style={{ color: '#0D1B3E' }}>New Category</div>

          {/* Emoji picker */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide block mb-1.5" style={{ color: '#7A8AAE' }}>Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  onClick={() => setNewEmoji(e)}
                  className="w-9 h-9 text-xl rounded-xl border-2 transition-all"
                  style={{ borderColor: newEmoji === e ? '#00BAF2' : '#DDE4F2', background: newEmoji === e ? '#EBF4FF' : 'white' }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#7A8AAE' }}>Name</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Dairy, Beverages…"
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#00BAF2]"
              style={{ borderColor: '#DDE4F2', color: '#0D1B3E', fontFamily: 'DM Sans' }}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#7A8AAE' }}>Description (optional)</label>
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Short description…"
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#00BAF2]"
              style={{ borderColor: '#DDE4F2', color: '#0D1B3E', fontFamily: 'DM Sans' }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={addCategory}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: '#00BAF2' }}
            >
              Add Category
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border transition-all hover:bg-[#F5F7FD]"
              style={{ borderColor: '#DDE4F2', color: '#7A8AAE' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="text-[11px] px-3 py-2 rounded-xl" style={{ background: '#F5F7FD', color: '#7A8AAE' }}>
        💡 Categories are used to target offers and segment basket analytics in MunimAI
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {categories.map(cat => (
          <div
            key={cat.name}
            className="bg-white rounded-xl border p-4 flex flex-col gap-1 group relative transition-all hover:border-[#00BAF2]"
            style={{ borderColor: '#DDE4F2' }}
          >
            <span className="text-2xl">{cat.emoji}</span>
            <div className="text-sm font-semibold" style={{ color: '#0D1B3E' }}>{cat.name}</div>
            <div className="text-[11px]" style={{ color: '#7A8AAE' }}>{cat.desc}</div>
            <button
              onClick={() => removeCategory(cat.name)}
              className="absolute top-2 right-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity font-medium"
              style={{ color: '#E84040' }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
