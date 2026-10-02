import { useCallback, useEffect, useRef, useState } from 'react'
import type { School } from './types'
import { getSchool, saveSchool } from './api'

export function useSchool(id: string) {
  const [school, setSchool] = useState<School | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'offline' | 'local'>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let live = true
    getSchool(id).then((s) => live && setSchool(s)).catch((e) => live && setError(String(e.message || e)))
    return () => { live = false }
  }, [id])

  const update = useCallback((fn: (s: School) => School) => {
    setSchool((prev) => {
      if (!prev) return prev
      const next = fn(structuredClone(prev))
      window.clearTimeout(timer.current)
      setSaving('saving')
      timer.current = window.setTimeout(() => {
        saveSchool(next).then(() => setSaving('saved')).catch((e) => setSaving(e?.message === 'local' ? 'local' : 'offline'))
      }, 500)
      return next
    })
  }, [])

  return { school, update, error, saving }
}
