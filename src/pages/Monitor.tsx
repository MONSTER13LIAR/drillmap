import { useEffect, useRef, useState } from 'react'
import { getDrill, ping, postEvent, undoLast } from '../lib/api'
import { LangToggle, routeText, T, useLang } from '../lib/i18n'
import { fmt } from '../lib/graph'
import type { DrillEventType } from '../lib/types'
import { useDrill, useTick } from '../lib/useDrill'

type Queued = { type: DrillEventType; roomId: string; at: number; present?: number }

// The monitor's phone. Big buttons, works one-handed, keeps taps if the network drops.
export function Monitor({ code }: { code: string }) {
  const { drill, setDrill, error, online, serverNow } = useDrill(code)
  const [lang, setLang] = useLang()
  const t = T[lang]
  const [undoing, setUndoing] = useState(false)
  const key = `drillmap:m:${code}`
  const [roomId, setRoomId] = useState<string | null>(() => localStorage.getItem(key))
  const [present, setPresent] = useState<number | null>(null)
  const [queue, setQueue] = useState<Queued[]>(() => {
    try { return JSON.parse(localStorage.getItem(key + ':q') || '[]') } catch { return [] }
  })
  const [sent, setSent] = useState<Queued[]>([]) // accepted by the server, maybe not in the last poll yet
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
          const done = rest[0]
          setSent((x) => [...x, done])
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

  if (error) return <div className="phone"><LangToggle lang={lang} set={setLang} /><h2>{t.notFound}</h2><p className="muted">{t.checkCode} {code}</p></div>
  if (!drill) return <div className="phone"><p className="muted">{t.connecting}</p></div>

  const classes = Object.entries(drill.expected).sort((a, b) => a[1].label.localeCompare(b[1].label, undefined, { numeric: true }))
  if (!roomId || !drill.expected[roomId]) {
    const byFloor = new Map<string, [string, (typeof classes)[number][1]][]>()
    for (const c of classes) byFloor.set(c[1].floor, [...(byFloor.get(c[1].floor) || []), c])
    return (
      <div className="phone">
        <LangToggle lang={lang} set={setLang} />
        <div>
          <div className="small faint">{drill.schoolName} · {t.drill} {code}</div>
          <h1 style={{ fontSize: 28 }}>{t.pickClass}</h1>
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
  const mine = [...drill.events.filter((e) => e.roomId === roomId), ...sent.filter((q) => q.roomId === roomId), ...queue.filter((q) => q.roomId === roomId)]
  const has = (t: DrillEventType) => mine.some((e) => e.type === t)
  const at = (t: DrillEventType) => [...mine].reverse().find((e) => e.type === t)?.at
  const now = serverNow()
  const elapsed = drill.startedAt ? (now - drill.startedAt) / 1000 : 0

  const tap = (type: DrillEventType, extra: { present?: number } = {}) => {
    if (navigator.vibrate) navigator.vibrate(60)
    const q: Queued = { type, roomId, at: serverNow(), ...extra }
    setQueue((x) => [...x, q])
  }

  // take back the latest step: drop it from the send queue if it never left this phone, else ask the server
  const lastStep = (['headcount', 'arrived', 'left'] as DrillEventType[]).find((ty) => has(ty))
  const undo = async () => {
    if (!lastStep || undoing) return
    const queued = queue.filter((q) => q.roomId === roomId && q.type === lastStep)
    if (queued.length) {
      setQueue((x) => x.filter((q) => !(q.roomId === roomId && q.type === lastStep)))
      return
    }
    setUndoing(true)
    try {
      await undoLast(code, roomId)
      setSent((x) => x.filter((q) => !(q.roomId === roomId && q.type === lastStep)))
      setDrill(await getDrill(code))
      if (lastStep === 'headcount') setPresent(null)
    } catch {
      alert(lang === 'hi' ? 'अभी रद्द नहीं हो सका। नेटवर्क जाँचें।' : 'Could not undo right now. Check the network.')
    } finally {
      setUndoing(false)
    }
  }
  const undoBtn = lastStep && !drill.endedAt && (
    <button className="ghost undo" disabled={undoing} onClick={undo}>↶ {t.undo}</button>
  )

  const header = (
    <>
    <LangToggle lang={lang} set={setLang} />
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <div>
        <div className="small faint">{drill.schoolName}</div>
        <h2 style={{ fontSize: 30 }}>{me.label}</h2>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span className={`pill ${online && !queue.length ? 'ok' : 'warn'}`}>{online && !queue.length ? t.connected : queue.length ? t.waiting(queue.length) : t.offline}</span>
        {!drill.startedAt && <div><button className="ghost small" onClick={() => setRoomId(null)}>{t.changeClass}</button></div>}
      </div>
    </div>
    </>
  )

  if (drill.endedAt && !has('arrived'))
    return <div className="phone">{header}<div className="card"><h3>{t.ended}</h3><p className="muted small">{t.notReached}</p></div></div>

  if (!drill.startedAt)
    return (
      <div className="phone">
        {header}
        <div className="card stack" style={{ textAlign: 'center', padding: 28 }}>
          <div className="done-tick" style={{ background: 'var(--ink)' }}>✓</div>
          <h2>{t.youreIn}</h2>
          <p className="muted">{t.keepOpen}</p>
        </div>
        <div className="card small">
          <b>{t.yourRoute}</b> {routeText(me.via, lang)}
        </div>
      </div>
    )

  const leftAt = at('left')
  const arrivedAt = at('arrived')
  return (
    <div className="phone">
      {header}
      <div className="clock">{fmt(elapsed)}</div>
      <p className="small muted" style={{ textAlign: 'center', marginTop: -8 }}>{t.sinceAlarm}</p>

      {!has('left') && (
        <>
          <div className="card small"><b>{t.route}</b> {routeText(me.via, lang)}</div>
          <button className="primary big" style={{ padding: 32, fontSize: 22 }} onClick={() => tap('left')}>
            {t.left}
          </button>
        </>
      )}

      {has('left') && !has('arrived') && (
        <>
          <div className="card small">
            {t.leftAt} <span className="mono">{fmt(((leftAt || 0) - drill.startedAt) / 1000)}</span> · <b>{t.go}</b> {routeText(me.via, lang)}
          </div>
          <button className="primary big" style={{ padding: 32, fontSize: 22 }} onClick={() => tap('arrived')}>
            {t.reached(drill.assembly && drill.assembly !== 'the assembly point' ? drill.assembly : t.assemblyDefault)}
          </button>
        </>
      )}

      {has('arrived') && !has('headcount') && (
        <div className="card stack">
          <p>
            {t.reachedIn} <b className="mono">{fmt(((arrivedAt || 0) - drill.startedAt) / 1000)}</b>. {t.countNow}
          </p>
          <div className="stepper">
            <button onClick={() => setPresent((p) => Math.max(0, (p ?? me.headcount) - 1))}>−</button>
            <div className="n">{present ?? me.headcount}</div>
            <button onClick={() => setPresent((p) => (p ?? me.headcount) + 1)}>+</button>
          </div>
          <p className="small muted" style={{ textAlign: 'center' }}>{t.ofList(me.headcount)}</p>
          <button className="primary big" onClick={() => tap('headcount', { present: present ?? me.headcount })}>
            {t.sendCount}
          </button>
        </div>
      )}

      {has('headcount') && (() => {
        const p = [...mine].reverse().find((e) => e.type === 'headcount')?.present ?? 0
        return (
          <div className="card stack" style={{ textAlign: 'center', padding: 28 }}>
            <div className="done-tick">✓</div>
            <h2>{t.done}</h2>
            <p className="muted">
              {t.outIn} <span className="mono">{fmt(((arrivedAt || 0) - drill.startedAt) / 1000)}</span> · {t.counted(p, me.headcount)}
            </p>
            {p < me.headcount && <p style={{ color: 'var(--alert)' }}>{t.tellTeacher(me.headcount - p)}</p>}
          </div>
        )
      })()}
      {undoBtn}
    </div>
  )
}
