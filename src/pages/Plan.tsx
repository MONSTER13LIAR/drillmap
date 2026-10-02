import { useState } from 'react'
import { MapView } from '../components/MapView'
import { fmt, settingsOf } from '../lib/graph'
import type { Settings } from '../lib/types'
import { usePlan } from '../lib/usePlan'
import { useSchool } from '../lib/useSchool'

const FIELDS: [keyof Settings, string, string][] = [
  ['walkSpeed', 'Walking speed on the flat', 'm/s'],
  ['stairSpeed', 'Speed going down stairs', 'm/s'],
  ['corridorFlow', 'Corridor flow', 'people per metre width per second'],
  ['stairFlow', 'Stair flow', 'people per metre width per second'],
  ['reactionSec', 'Alarm to first step', 'seconds'],
  ['stairMetersPerFloor', 'Stair walking length per storey', 'm'],
  ['defaultCorridorWidth', 'Corridor width if not set', 'm'],
  ['defaultStairWidth', 'Stair width if not set', 'm'],
  ['targetSec', "School's own target for everyone out", 'seconds'],
  ['strideM', 'Step length for walk measuring', 'm'],
]

export function Plan({ id }: { id: string }) {
  const { school, update } = useSchool(id)
  const plan = usePlan(school)
  const [showSettings, setShowSettings] = useState(false)
  if (!school || !plan) return <main className="page"><p className="muted">Working out routes…</p></main>
  const st = settingsOf(school)
  const { current, suggestion } = plan
  const people = current.groups.reduce((a, g) => a + g.headcount, 0)
  const saving = current.totalSec - suggestion.totalSec
  const floors = [...school.floors].sort((a, b) => b.level - a.level)
  const floorOf = (roomId: string) => school.floors.find((f) => f.id === school.nodes.find((n) => n.id === roomId)?.floorId)?.name || ''
  const queues = [...current.links.values()].filter((u) => u.queueSec > 5).sort((a, b) => b.queueSec - a.queueSec).slice(0, 5)
  // red on the map only where real queues form: the worst few corridor segments or staircase heads.
  // A stair link has no line of its own on any floor, so its queue is shown at the top of that flight (where classes wait to step on).
  const worst = [...current.links.values()].filter((u) => u.queueSec >= 60).sort((a, b) => b.queueSec - a.queueSec).slice(0, 4)
  const hotEdges = new Set(worst.filter((u) => !u.link.isStair).map((u) => u.link.id))
  const hotNodes = new Set(worst.filter((u) => u.link.isStair).map((u) => u.link.b))

  if (!current.groups.length)
    return (
      <main className="page">
        <div className="card stack">
          <h2>No routes yet</h2>
          <p className="muted">Add classrooms with headcounts, an assembly point, and connect them on the Map tab.</p>
          <a className="btn" href={`#/s/${id}/map`}>Back to the map</a>
        </div>
      </main>
    )

  return (
    <main className="page stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>{school.name}</h1>
          <p className="muted">Evacuation plan worked out from the map. No guessing: walking time, stair width and who queues behind whom.</p>
        </div>
        <div className="row">
          <a className="btn" href={`#/s/${id}/print`}>Print maps</a>
          <a className="btn primary" href={`#/s/${id}/drills`}>Run a drill</a>
        </div>
      </div>

      <div className="grid3">
        <div className="card kpi">
          <div className="v">{fmt(current.totalSec)}</div>
          <div className="l">planned time until the last person reaches {school.nodes.find((n) => n.kind === 'assembly')?.label || 'the assembly point'}</div>
        </div>
        <div className="card kpi">
          <div className="v">{people}</div>
          <div className="l">people in {current.groups.length} rooms</div>
        </div>
        <div className="card kpi">
          <div className="v" style={{ color: current.totalSec > st.targetSec ? 'var(--alert)' : 'var(--accent)' }}>{fmt(st.targetSec)}</div>
          <div className="l">school's target · {current.totalSec > st.targetSec ? `${fmt(current.totalSec - st.targetSec)} over` : 'met'}</div>
        </div>
      </div>

      {current.unreachable.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--alert)' }}>
          <b>No route out from:</b> {current.unreachable.map((r) => school.nodes.find((n) => n.id === r)?.label).join(', ')}. Connect them on the map.
        </div>
      )}

      {saving > 1 && (
        <div className="card stack" style={{ borderColor: 'var(--accent)' }}>
          <h3>Faster plan found: {fmt(suggestion.totalSec)} instead of {fmt(current.totalSec)}</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {plan.changes.map((c) => (
              <li key={c.label} className="small">
                <b>{c.label}</b> goes via {c.to}
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="primary" onClick={() => update((s) => ({ ...s, plan: { choice: plan.suggestionChoice } }))}>Use this plan</button>
          </div>
        </div>
      )}
      {school.plan && Object.keys(school.plan.choice).length > 0 && saving <= 1 && (
        <div className="row small muted">
          Using the adjusted plan. <button className="ghost small" onClick={() => update((s) => { delete s.plan; return s })}>Reset to shortest routes</button>
        </div>
      )}

      {Object.keys(current.stairOrder).length > 0 && (
        <div className="grid2">
          {Object.entries(current.stairOrder).map(([k, order]) => (
            <div key={k} className="card stack">
              <h3>Staircase {k}: order classes step onto it</h3>
              <ol style={{ margin: 0, paddingLeft: 20, columns: order.length > 6 ? 2 : 1 }}>
                {order.map((l) => <li key={l}>{l}</li>)}
              </ol>
            </div>
          ))}
        </div>
      )}

      {queues.length > 0 && (
        <div className="card stack">
          <h3>Where queues form</h3>
          {queues.map((u) => (
            <div key={u.link.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{u.link.label}</span>
              <span className="small muted">
                {u.groups.length} classes pass · <span className="mono">{fmt(u.queueSec)}</span> of waiting in total
              </span>
            </div>
          ))}
        </div>
      )}

      {floors.map((f) => {
        const onFloor = current.groups.filter((g) => school.nodes.find((n) => n.id === g.roomId)?.floorId === f.id)
        const passes = current.groups.filter((g) => g.route.nodes.some((nid) => school.nodes.find((n) => n.id === nid)?.floorId === f.id))
        const badges: Record<string, string> = {}
        for (const g of onFloor) badges[g.roomId] = `clear ${fmt(g.doneSec)}`
        return (
          <div key={f.id} className="stack">
            <h2>{f.name}</h2>
            <MapView school={school} floorId={f.id} routes={passes.map((g) => ({ route: g.route }))} hotEdges={hotEdges} hotNodes={hotNodes} badges={badges} />
            {f.id === floors[floors.length - 1].id && hotEdges.size + hotNodes.size > 0 && <p className="small muted">Red: where queues build up. A red ring on a staircase means classes wait there to step on.</p>}
          </div>
        )
      })}

      <div className="card flat">
        <table>
          <thead>
            <tr>
              <th>Class</th>
              <th>Floor</th>
              <th>Route</th>
              <th>Waits</th>
              <th className="num">People</th>
              <th className="num">All out by</th>
            </tr>
          </thead>
          <tbody>
            {[...current.groups].sort((a, b) => b.doneSec - a.doneSec).map((g) => (
              <tr key={g.roomId}>
                <td><b>{g.label}</b></td>
                <td className="muted">{floorOf(g.roomId)}</td>
                <td>{g.route.summary}</td>
                <td className="small">
                  {g.waits.length ? g.waits.map((w, i) => (
                    <div key={i}>
                      <span className="mono">{fmt(w.sec)}</span> at {w.label}
                      {w.behind.length > 0 && <span className="muted"> behind {w.behind.slice(-3).join(', ')}</span>}
                    </div>
                  )) : <span className="faint">none</span>}
                </td>
                <td className="num">{g.headcount}</td>
                <td className="num" style={{ color: g.waitSec > 30 ? 'var(--alert)' : undefined }}>{fmt(g.doneSec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Planning figures</h3>
          <button className="ghost" onClick={() => setShowSettings((x) => !x)}>{showSettings ? 'Hide' : 'Edit'}</button>
        </div>
        <p className="small muted">
          These are common fire-safety planning values, not measurements of your school. After a real drill, compare the report with the plan and
          adjust them.
        </p>
        {showSettings && (
          <div className="grid2">
            {FIELDS.map(([k, l, u]) => (
              <label key={k} className="field">
                {l} <span className="faint">({u})</span>
                <input type="number" step="0.1" value={st[k]} onChange={(e) => update((s) => ({ ...s, settings: { ...st, [k]: parseFloat(e.target.value) || 0 } }))} />
              </label>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
