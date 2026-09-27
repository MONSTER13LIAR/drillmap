import { useEffect, useRef, useState } from 'react'
import { getDrill } from './api'
import type { Drill } from './types'

// Live drill state by polling (works on serverless hosting), plus the offset between this device's clock and the server's.
export function useDrill(code: string, everyMs = 1500) {
  const [drill, setDrill] = useState<Drill | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const offset = useRef(0)

  useEffect(() => {
    let live = true
    let timer: number | undefined
    let first = true
    const load = async () => {
      try {
        const t0 = Date.now()
        const d = await getDrill(code)
        if (!live) return
        // server time at the midpoint of the request
        offset.current = d.now - (t0 + Date.now()) / 2
        setDrill(d)
        setOnline(true)
        setError(null)
      } catch (e: any) {
        if (!live) return
        if (first) setError(String(e?.message || e))
        else setOnline(false)
      } finally {
        first = false
        if (live) timer = window.setTimeout(load, document.hidden ? everyMs * 4 : everyMs)
      }
    }
    load()
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [code, everyMs])

  const serverNow = () => Date.now() + offset.current
  return { drill, setDrill, error, online, serverNow }
}

export function useTick(ms = 250) {
  const [, set] = useState(0)
  useEffect(() => {
    const i = window.setInterval(() => set((x) => x + 1), ms)
    return () => window.clearInterval(i)
  }, [ms])
}
