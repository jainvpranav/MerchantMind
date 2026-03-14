'use client'

import useSWR from 'swr'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { endpoints, fetcher, getCategoryColor } from '@/lib/api'
import type { PatternsResponse } from '@/lib/types'
import { cn } from '@/lib/utils'

function CategoryPill({ category }: { category: string }) {
  const colorClass = getCategoryColor(category)
  
  return (
    <span className={cn('px-3 py-1.5 rounded-full text-sm font-medium text-white', colorClass)}>
      {category}
    </span>
  )
}

function PatternCard({
  antecedent,
  consequent,
  confidence,
  support,
}: {
  antecedent: string
  consequent: string
  confidence: number
  support: number
}) {
  const confidencePercent = Math.round(confidence * 100)
  const supportPercent = Math.round(support * 100)

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-6">
        <div className="flex items-center justify-center gap-4 mb-6">
          <CategoryPill category={antecedent} />
          <ArrowRight className="size-5 text-zinc-500" />
          <CategoryPill category={consequent} />
        </div>
        
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-zinc-400 text-sm">Confidence</span>
              <span className="text-3xl font-bold text-zinc-100">{confidencePercent}%</span>
            </div>
            <Progress 
              value={confidencePercent} 
              className="h-2 bg-zinc-800 [&>div]:bg-red-500" 
            />
          </div>
          
          <div className="text-sm text-zinc-500">
            Support: {supportPercent}%
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PatternSkeleton() {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-6">
        <div className="flex items-center justify-center gap-4 mb-6">
          <Skeleton className="h-8 w-24 rounded-full bg-zinc-800" />
          <Skeleton className="size-5 bg-zinc-800" />
          <Skeleton className="h-8 w-24 rounded-full bg-zinc-800" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-10 bg-zinc-800" />
          <Skeleton className="h-2 bg-zinc-800" />
          <Skeleton className="h-4 w-24 bg-zinc-800" />
        </div>
      </CardContent>
    </Card>
  )
}

export function PatternsPage() {
  const { data, isLoading, error } = useSWR<PatternsResponse>(endpoints.patterns, fetcher)

  const sortedPatterns = data?.patterns
    .sort((a, b) => b.confidence - a.confidence) || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">What customers buy together</h1>
        <p className="text-zinc-400 mt-1">Powered by FP-Growth market basket analysis</p>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          Error loading basket patterns
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <PatternSkeleton key={i} />
            ))}
          </>
        ) : (
          sortedPatterns.map((pattern, index) => (
            <PatternCard
              key={index}
              antecedent={pattern.antecedent}
              consequent={pattern.consequent}
              confidence={pattern.confidence}
              support={pattern.support}
            />
          ))
        )}
      </div>
    </div>
  )
}
