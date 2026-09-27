import { MapView } from '../components/MapView'
import { fmt } from '../lib/graph'
import { usePlan } from '../lib/usePlan'
import { useSchool } from '../lib/useSchool'

export function PrintPlan({ id }: { id: string }) {
  const { school } = useSchool(id)
  const plan = usePlan(school)
  if (!school || !plan) return <main className="page"><p className="muted">Preparing…</p></main>
  const sim = plan.current
  const assembly = school.nodes.find((n) => n.kind === 'assembly')?.label || 'Assembly point'
  const floors = [...school.floors].sort((a, b) => b.level - a.level)
  const floorName = (roomId: string) => school.floors.find((f) => f.id === school.nodes.find((n) => n.id === roomId)?.floorId)?.name || ''
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <main className="page">
      <div className="row no-print" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Print</h1>
          <p className="muted">One A4 sheet per floor for the notice board, then route cards to stick on each classroom door.</p>
        </div>
        <button className="primary" onClick={() => window.print()}>Print</button>
      </div>

      {floors.map((f) => {
        const roomsHere = sim.groups.filter((g) => school.nodes.find((n) => n.id === g.roomId)?.floorId === f.id)
        const passes = sim.groups.filter((g) => g.route.nodes.some((nid) => school.nodes.find((n) => n.id === nid)?.floorId === f.id))
        const stairsHere = [...new Set(roomsHere.flatMap((g) => g.route.stairKeys.slice(0, 1)))]
        return (
          <section key={f.id} className="sheet">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
              <div>
                <div className="small faint">{school.name} · Evacuation plan</div>
                <h2 style={{ fontSize: 30 }}>{f.name}</h2>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="small faint">Assembly point</div>
                <div style={{ fontWeight: 650, fontSize: 18 }}>{assembly}</div>
              </div>
            </div>
            <MapView school={school} floorId={f.id} routes={passes.map((g) => ({ route: g.route }))} />
            <div className="row" style={{ marginTop: 12, alignItems: 'flex-start', gap: 28 }}>
              <div className="small" style={{ flex: 1 }}>
                <b>When the alarm rings:</b> leave bags, teacher at the door, walk in a line, no running, do not use the lift, follow the green arrows.
              </div>
              {stairsHere.map((k) => (
                <div key={k} className="small">
                  <b>Staircase {k} order</b>
                  <div>{(sim.stairOrder[k] || []).filter((l) => roomsHere.some((g) => g.label === l)).join(' → ')}</div>
                </div>
              ))}
            </div>
            <div className="small faint" style={{ marginTop: 8 }}>Prepared {today} with Drillmap.</div>
          </section>
        )
      })}

      <section className="sheet">
        <div className="small faint" style={{ marginBottom: 10 }}>Route cards · cut and stick inside each classroom door</div>
        <div className="cards6">
          {[...sim.groups].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })).map((g) => {
            const key = g.route.stairKeys[0]
            const order = key ? sim.stairOrder[key] || [] : []
            const pos = order.indexOf(g.label)
            return (
              <div key={g.roomId} className="routecard">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="cls">{g.label}</div>
                  <div className="small faint">{floorName(g.roomId)}</div>
                </div>
                <div className="go">{g.route.summary}</div>
                {key && pos >= 0 && (
                  <div className="small" style={{ marginTop: 6 }}>
                    Staircase {key}: you are <b>{pos + 1}{['st', 'nd', 'rd'][pos] || 'th'}</b>
                    {pos > 0 && <>, after {order.slice(Math.max(0, pos - 2), pos).join(', ')}</>}
                  </div>
                )}
                <div className="meta">Planned: all out by <span className="mono">{fmt(g.doneSec)}</span> · {g.headcount} people · Assembly: {assembly}</div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
