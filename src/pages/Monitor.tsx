import { useEffect, useRef, useState } from 'react'
import { ping, postEvent } from '../lib/api'
import { fmt } from '../lib/graph'
import type { DrillEventType } from '../lib/types'
import { useDrill, useTick } from '../lib/useDrill'

type Queued = { type: DrillEventType; roomId: string; at: number; present?: number }

// The monitor's phone. Big buttons, works one-handed, keeps taps if the network drops.
export function Monitor({ code }: { code: string }) {
  const { drill, error, online, serverNow } = useDrill(code)
  const key = `drillmap:m:${code}`
  const [roomId, setRoomId] = useState<string | null>(() => localStorage.getItem(key))
  const [present, setPresent] = useState<number | null>(null)
  const [queue, setQueue] = useState<Queued[]>(() => {
    try { return JSON.parse(localStorage.getItem(key + ':q') || '[]') } catch { return [] }
  })
  const flushing = useRef(false)
  useTick(250)

  useEffect(() => {
    if (roomId) localStorage.setItem(key, roomId)
    else localStorage.removeItem(key)
  }, [roomId, key])
  useEffect(() => {
    localStorage.setItem(key + ':q', JSON.stringify(queue))
  }, [queue, key])

  // tell the coordinator this class has a monitor
  useEffect(() => {
    if (!roomId) return
    ping(code, roomId).catch(() => {})
    const i = window.setInterval(() => ping(code, roomId).catch(() => {}), 10_000)
    return () => window.clearInterval(i)
  }, [code, roomId])

  // send queued taps; keep retrying until the server has them
  useEffect(() => {
    const flush = async () => {
      if (flushing.current || !queue.length) return
      flushing.current = true
      try {
        let rest = [...queue]
        while (rest.length) {
          await postEvent(code, rest[0])
          rest = rest.slice(1)
          setQueue(rest)
        }
      } catch {
        /* offline: try again shortly */
      } finally {
        flushing.current = false
      }
    }
    flush()
    const i = window.setInterval(flush, 3000)
    return () => window.clearInterval(i)
  }, [queue, code])

  if (error) return <div className="phone"><h2>Drill not found</h2><p className="muted">Check the code with your teacher: {code}</p></div>
  if (!drill) return <div className="phone"><p className="muted">Connecting…</p></div>

  const classes = Object.entries(drill.expected).sort((a, b) => a[1].label.localeCompare(b[1].label, undefined, { numeric: true }))
  if (!roomId || !drill.expected[roomId]) {
    const byFloor = new Map<string, [string, (typeof classes)[number][1]][]>()
    for (const c of classes) byFloor.set(c[1].floor, [...(byFloor.get(c[1].floor) || []), c])
    return (
      <div className="phone">
        <div>
          <div className="small faint">{drill.schoolName} · drill {code}</div>
          <h1 style={{ fontSize: 28 }}>Which class are you the monitor for?</h1>
        </div>
        {[...byFloor.entries()].map(([floor, list]) => (
          <div key={floor} className="stack" style={{ gap: 8 }}>
            <div className="small muted">{floor}</div>
            <div className="classpick">
              {list.map(([id, c]) => <button key={id} onClick={() => setRoomId(id)}>{c.label}</button>)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const me = drill.expected[roomId]
  const mine = [...drill.events.filter((e) => e.roomId === roomId), ...queue.filter((q) => q.roomId === roomId)]
  const has = (t: DrillEventType) => mine.some((e) => e.type === t)
  const at = (t: DrillEventType) => [...mine].reverse().find((e) => e.type === t)?.at
  const now = serverNow()
  const elapsed = drill.startedAt ? (now - drill.startedAt) / 1000 : 0

  const tap = (type: DrillEventType, extra: { present?: number } = {}) => {
    if (navigator.vibrate) navigator.vibrate(60)
    const q: Queued = { type, roomId, at: serverNow(), ...extra }
    setQueue((x) => [...x, q])
  }

  const header = (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <div>
        <div className="small faint">{drill.schoolName}</div>
        <h2 style={{ fontSize: 30 }}>{me.label}</h2>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span className={`pill ${online && !queue.length ? 'ok' : 'warn'}`}>{online && !queue.length ? 'connected' : queue.length ? `${queue.length} tap(s) waiting to send` : 'offline'}</span>
        {!drill.startedAt && <div><button className="ghost small" onClick={() => setRoomId(null)}>change class</button></div>}
      </div>
    </div>
  )

  if (drill.endedAt && !has('arrived'))
    return <div className="phone">{header}<div className="card"><h3>The drill has ended.</h3><p className="muted small">Your class was not marked as reaching the assembly point.</p></div></div>

  if (!drill.startedAt)
    return (
      <div className="phone">
        {header}
        <div className="card stack" style={{ textAlign: 'center', padding: 28 }}>
          <div className="done-tick" style={{ background: 'var(--ink)' }}>✓</div>
          <h2>You're in. Wait for the alarm.</h2>
          <p className="muted">Keep this screen open. When the alarm rings, the clock starts here by itself.</p>
        </div>
        <div className="card small">
          <b>Your route:</b> {me.via}
        </div>
      </div>
    )

  const leftAt = at('left')
  const arrivedAt = at('arrived')
  return (
    <div className="phone">
      {header}
      <div className="clock">{fmt(elapsed)}</div>
      <p className="small muted" style={{ textAlign: 'center', marginTop: -8 }}>since the alarm</p>

      {!has('left') && (
        <>
          <div className="card small"><b>Route:</b> {me.via}</div>
          <button className="primary big" style={{ padding: 32, fontSize: 22 }} onClick={() => tap('left')}>
            Our class has left the room
          </button>
        </>
      )}

      {has('left') && !has('arrived') && (
        <>
          <div className="card small">
            Left at <span className="mono">{fmt(((leftAt || 0) - drill.startedAt) / 1000)}</span> · <b>Go:</b> {me.via}
          </div>
          <button className="primary big" style={{ padding: 32, fontSize: 22 }} onClick={() => tap('arrived')}>
            We reached {drill.assembly || 'the assembly point'}
          </button>
        </>
      )}

      {has('arrived') && !has('headcount') && (
        <div className="card stack">
          <p>
            Reached in <b className="mono">{fmt(((arrivedAt || 0) - drill.startedAt) / 1000)}</b>. Now count your class.
          </p>
          <div className="stepper">
            <button onClick={() => setPresent((p) => Math.max(0, (p ?? me.headcount) - 1))}>−</button>
            <div className="n">{present ?? me.headcount}</div>
            <button onClick={() => setPresent((p) => (p ?? me.headcount) + 1)}>+</button>
          </div>
          <p className="small muted" style={{ textAlign: 'center' }}>of {me.headcount} on the list</p>
          <button className="primary big" onClick={() => tap('headcount', { present: present ?? me.headcount })}>
            Send headcount
          </button>
        </div>
      )}

      {has('headcount') && (() => {
        const p = [...mine].reverse().find((e) => e.type === 'headcount')?.present ?? 0
        return (
          <div className="card stack" style={{ textAlign: 'center', padding: 28 }}>
            <div className="done-tick">✓</div>
            <h2>Done</h2>
            <p className="muted">
              Out in <span className="mono">{fmt(((arrivedAt || 0) - drill.startedAt) / 1000)}</span> · {p} of {me.headcount} counted
            </p>
            {p < me.headcount && <p style={{ color: 'var(--alert)' }}>Tell your teacher now: {me.headcount - p} not counted.</p>}
          </div>
        )
      })()}
    </div>
  )
}
