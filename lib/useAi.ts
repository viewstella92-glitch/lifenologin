'use client'

import { useEffect, useState } from 'react'

// True when the server has an AI key. Lets the UI hide AI features when it doesn't.
export function useAiEnabled() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    fetch('/api/ai')
      .then((r) => r.json())
      .then((j) => setOn(Boolean(j.enabled)))
      .catch(() => setOn(false))
  }, [])
  return on
}
