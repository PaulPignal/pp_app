'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { fetchJson } from '@/shared/lib/fetch-json'
import type { JsonOk } from '@/shared/lib/http'

type ReactionPayload = JsonOk<{
  reaction: {
    id: string
    status: string
  }
}>

export default function LikeActions({ workId }: { workId: string }) {
  const router = useRouter()
  const [pendingStatus, setPendingStatus] = useState<'SEEN' | 'DISLIKE' | null>(null)

  async function submit(status: 'SEEN' | 'DISLIKE') {
    setPendingStatus(status)
    try {
      await fetchJson<ReactionPayload>('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workId, status }),
      })
      router.refresh()
    } finally {
      setPendingStatus(null)
    }
  }

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      <button
        className="btn btn-secondary min-w-[5.75rem] px-3 py-2 text-sm disabled:opacity-50"
        onClick={() => void submit('SEEN')}
        title="Marquer comme vu"
        disabled={pendingStatus !== null}
      >
        {pendingStatus === 'SEEN' ? '...' : 'Vu'}
      </button>
      <button
        className="btn min-w-[6.5rem] border-[rgba(160,74,65,0.18)] bg-[rgba(249,236,233,0.7)] px-3 py-2 text-sm text-[color:var(--color-danger)] disabled:opacity-50"
        onClick={() => void submit('DISLIKE')}
        title="Retirer le like"
        disabled={pendingStatus !== null}
      >
        {pendingStatus === 'DISLIKE' ? '...' : 'Retirer'}
      </button>
    </div>
  )
}
