import { useEffect, useState } from 'react'
import { createDrill, listDrills } from '../lib/api'
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
      setErr('Could not reach the server. A drill needs a connection so monitors’ phones can report in.')
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
          <button className="primary" disabled={busy || !plan.current.groups.length} onClick={start}>Set up a drill</button>
        </div>
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
