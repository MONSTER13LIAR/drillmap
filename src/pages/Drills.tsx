import { useEffect, useState } from 'react'
import { createDrill, listDrills, serverStorage } from '../lib/api'
import { fmt } from '../lib/graph'
import { analyse } from '../lib/report'
import type { Drill } from '../lib/types'
import { usePlan } from '../lib/usePlan'
import { useSchool } from '../lib/useSchool'
import { settingsOf } from '../lib/graph'

export function Drills({ id }: { id: string }) {
  const { school } = useSchool(id)
  const plan = usePlan(school)
  const [drills, setDrills] = useState<Drill[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shared, setShared] = useState(true)
  useEffect(() => { serverStorage().then(setShared) }, [])

  useEffect(() => {
    listDrills(id).then(setDrills).catch(() => setDrills([]))
  }, [id])

  if (!school || !plan) return <main className="page"><p className="muted">Loading…</p></main>
  const st = settingsOf(school)

  const start = async () => {
    setBusy(true)
    setErr(null)
    try {
      const expected: Drill['expected'] = {}
      for (const g of plan.current.groups) {
        const floor = school.floors.find((f) => f.id === school.nodes.find((n) => n.id === g.roomId)?.floorId)
        expected[g.roomId] = { sec: g.doneSec, via: g.route.summary, stairKey: g.route.stairKeys[0], label: g.label, headcount: g.headcount, floor: floor?.name || '' }
      }
      const assembly = school.nodes.find((n) => n.kind === 'assembly')?.label || 'the assembly point'
      const d = await createDrill(school.id, expected, assembly)
      location.hash = `#/d/${d.code}`
    } catch (e) {
      const m = String((e as Error)?.message || '')
      setErr(/school/i.test(m) ? 'The server has no copy of this school yet. Make one edit on the map so it saves, then try again.' : 'Could not reach the server. A drill needs a connection so monitors’ phones can report in.')
      setBusy(false)
    }
  }

  return (
    <main className="page stack">
      <div>
        <h1>Mock drill</h1>
        <p className="muted">Each class sends one monitor with a phone. They open a link, pick their class, and tap twice: when the class leaves the room and when it reaches {school.nodes.find((n) => n.kind === 'assembly')?.label || 'the assembly point'}. Then they count heads.</p>
      </div>
      <div className="card stack">
        <h2>New drill</h2>
        <p className="small muted">Uses the current plan: {plan.current.groups.length} classes, planned {fmt(plan.current.totalSec)}.</p>
        <div className="row">
          <button className="primary" disabled={busy || !shared || !plan.current.groups.length} onClick={start}>Set up a drill</button>
        </div>
        {!shared && <p className="small" style={{ color: 'var(--alert)' }}>Live drills are switched off on this site for now: monitors’ phones need a shared database to report to, and it is not connected yet. Your map and plan are saved in this browser.</p>}
        {!plan.current.groups.length && <p className="small muted">Add classes on the map first.</p>}
        {err && <p className="small" style={{ color: 'var(--alert)' }}>{err}</p>}
      </div>
      <div className="card stack">
        <h2>Past drills</h2>
        {!drills && <p className="muted">Loading…</p>}
        {drills && !drills.length && <p className="muted">No drills yet.</p>}
        {drills?.map((d) => {
          const a = d.startedAt ? analyse(d, st.targetSec, st.reactionSec) : null
          return (
            <div key={d.code} className="row" style={{ justifyContent: 'space-between' }}>
              <a href={`#/d/${d.code}${d.endedAt ? '/report' : ''}`}>
                {new Date(d.startedAt || d.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · <span className="mono">{d.code}</span>
              </a>
              <span className="small muted">
                {!d.startedAt ? 'not started' : !d.endedAt ? 'running' : a?.totalSec != null ? `everyone out ${fmt(a.totalSec)}` : 'ended, no arrivals'}
              </span>
            </div>
          )
        })}
      </div>
    </main>
  )
}
