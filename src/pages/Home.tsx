import { useEffect, useMemo, useState } from 'react'
import { MapView } from '../components/MapView'
import { usePlan } from '../lib/usePlan'
import { deleteSchool, listSchools, saveSchool } from '../lib/api'
import { demoSchool } from '../lib/demo'
import { uid } from '../lib/id'
import { DEFAULT_SETTINGS, type School } from '../lib/types'

export function Home() {
  const [schools, setSchools] = useState<{ id: string; name: string; updatedAt: number }[] | null>(null)
  const [name, setName] = useState('')
  const demo = useMemo(() => demoSchool(), [])
  const demoPlan = usePlan(demo)
  const ground = [...demo.floors].sort((a, b) => a.level - b.level)[0]

  useEffect(() => {
    listSchools().then(setSchools)
  }, [])

  const create = async (s: School) => {
    await saveSchool(s).catch(() => {})
    location.hash = `#/s/${s.id}/map`
  }

  const blank = (): School => ({
    id: uid('s'),
    name: name.trim() || 'My school',
    floors: [{ id: uid('f'), name: 'Ground floor', level: 0 }],
    nodes: [],
    edges: [],
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: Date.now(),
  })

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/">
          <img src="/icon.svg" alt="" />
          Drillmap
        </a>
      </header>
      <main className="page">
        <section className="hero">
          <div className="hero-text">
          <h1>Every class knows its way out. Then you prove it with a timed drill.</h1>
          <p>
            Walk your school once with a phone. Drillmap works out each class's route and the order classes take each staircase, prints the
            evacuation map for every floor, and times a real mock drill from the monitors' phones.
          </p>
          </div>
          {demoPlan && (
            <figure className="hero-map">
              <MapView school={demo} floorId={ground.id} routes={demoPlan.current.groups.map((g) => ({ route: g.route }))} />
              <figcaption className="small faint">The demo school's ground floor. Arrows are each class's worked-out way to the playground.</figcaption>
            </figure>
          )}
          <div className="steps4">
            <div><div className="n">01</div><h3>Map</h3><p className="small muted">Photo of the floor plan, tap rooms, stairs and exits, walk each corridor to measure it.</p></div>
            <div><div className="n">02</div><h3>Plan</h3><p className="small muted">Plain arithmetic: walking speed, stair width, who queues behind whom.</p></div>
            <div><div className="n">03</div><h3>Print</h3><p className="small muted">A floor-wise map for each notice board and a route card for each classroom door.</p></div>
            <div><div className="n">04</div><h3>Drill</h3><p className="small muted">Monitors tap on their phones. You get times, missing heads and the jam.</p></div>
          </div>
        </section>

        <div className="grid2">
          <div className="card stack">
            <h2>Start mapping</h2>
            <label className="field">
              School name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kendriya Vidyalaya No. 2" />
            </label>
            <div className="row">
              <button className="primary" onClick={() => create(blank())}>Create school</button>
              <button onClick={() => create(demoSchool())}>Open the demo school</button>
            </div>
            <p className="small faint">The demo is a made-up three-storey school. Its corridor lengths come from the drawing, not a walk.</p>
          </div>
          <div className="card stack">
            <h2>Your schools</h2>
            {!schools && <p className="muted">Loading…</p>}
            {schools && !schools.length && <p className="muted">None yet.</p>}
            {schools?.sort((a, b) => b.updatedAt - a.updatedAt).map((s) => (
              <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
                <a href={`#/s/${s.id}/map`} style={{ fontWeight: 500 }}>{s.name}</a>
                <div className="row">
                  <span className="small faint">{new Date(s.updatedAt).toLocaleDateString()}</span>
                  <button
                    className="ghost small"
                    onClick={async () => {
                      if (!confirm(`Delete ${s.name}? Drills stay in the record.`)) return
                      await deleteSchool(s.id)
                      setSchools((x) => x?.filter((y) => y.id !== s.id) || null)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card stack" style={{ marginTop: 16 }}>
          <h3>Why this exists</h3>
          <p className="quote">
            "It is recommended to prepare a floor wise evacuation plan and display it prominently at the notice board on each of the floors…
            The mock drill on earthquake, fire etc. may [be] conducted at periodic interval preferably once in every six months and the deficiencies
            may be assessed for updation of the plan."
          </p>
          <p className="small faint">National Disaster Management Authority, School Safety Policy Guidelines (2016), Annexure 8.</p>
        </div>
      </main>
    </>
  )
}
