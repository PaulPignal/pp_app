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
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        className="rounded-xl border px-3 py-1 text-sm disabled:opacity-50"
        onClick={() => void submit('SEEN')}
        title="Marquer comme vu"
        disabled={pendingStatus !== null}
      >
        {pendingStatus === 'SEEN' ? '...' : 'Vu'}
      </button>
      <button
        className="rounded-xl border px-3 py-1 text-sm disabled:opacity-50"
        onClick={() => void submit('DISLIKE')}
        title="Retirer le like"
        disabled={pendingStatus !== null}
      >
        {pendingStatus === 'DISLIKE' ? '...' : 'Retirer'}
      </button>
    </div>
  )
}
