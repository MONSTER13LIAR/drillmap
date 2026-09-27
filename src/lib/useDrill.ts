import { useEffect, useRef, useState } from 'react'
import { getDrill, subscribe } from './api'
import type { Drill } from './types'

// Live drill state over server-sent events, with the offset between this device's clock and the server's.
export function useDrill(code: string) {
  const [drill, setDrill] = useState<Drill | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const offset = useRef(0)

  useEffect(() => {
    let live = true
    getDrill(code)
      .then((d) => {
        if (!live) return
        offset.current = d.now - Date.now()
        setDrill(d)
      })
      .catch((e) => live && setError(String(e.message || e)))
    const stop = subscribe(code, (d) => {
      if (!live) return
      if (d.now) offset.current = d.now - Date.now()
      setOnline(true)
      setDrill(d)
    })
    const off = () => setOnline(false)
    const on = () => setOnline(true)
    window.addEventListener('offline', off)
    window.addEventListener('online', on)
    return () => {
      live = false
      stop()
      window.removeEventListener('offline', off)
      window.removeEventListener('online', on)
    }
  }, [code])

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
