import { useEffect, useMemo, useState } from 'react'
import { MapView } from '../components/MapView'
import { deleteSchool, listSchools, saveSchool } from '../lib/api'
import { demoSchool } from '../lib/demo'
import { fmt } from '../lib/graph'
import { uid } from '../lib/id'
import { DEFAULT_SETTINGS, type School } from '../lib/types'
import { usePlan } from '../lib/usePlan'

export function Home() {
  const [schools, setSchools] = useState<{ id: string; name: string; updatedAt: number }[] | null>(null)
  const [name, setName] = useState('')
  const demo = useMemo(() => demoSchool(), [])
  const plan = usePlan(demo)
  const floors = useMemo(() => [...demo.floors].sort((a, b) => a.level - b.level), [demo])
  const [floorId, setFloorId] = useState(floors[0].id)

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

  const toStart = () => document.getElementById('start')?.scrollIntoView({ behavior: 'smooth' })

  // every number on this page comes from the demo school's worked-out plan
  const groups = plan?.current.groups || []
  const byLabel = (l: string) => groups.find((g) => g.label === l) || groups[0]
  const slowest = [...groups].sort((a, b) => b.doneSec - a.doneSec)[0]
  const stairs = Object.entries(plan?.current.stairOrder || {})
  const queues = plan ? [...plan.current.links.values()].filter((u) => u.queueSec > 5).sort((a, b) => b.queueSec - a.queueSec).slice(0, 3) : []
  const floorName = (roomId: string) => demo.floors.find((f) => f.id === demo.nodes.find((n) => n.id === roomId)?.floorId)?.name || ''
  const passes = groups.filter((g) => g.route.nodes.some((nid) => demo.nodes.find((n) => n.id === nid)?.floorId === floorId))
  const badges: Record<string, string> = {}
  for (const g of groups) badges[g.roomId] = `clear ${fmt(g.doneSec)}`
  const card = byLabel('7A')
  const mon = byLabel('8A')

  return (
    <div className="home">
      <header className="home-nav">
        <a className="brand" href="#/">
          <img src="/icon.svg" alt="" />
          Drillmap
        </a>
        <nav>
          <a href="#how" onClick={(e) => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }) }}>How it works</a>
          <a href="#why" onClick={(e) => { e.preventDefault(); document.getElementById('why')?.scrollIntoView({ behavior: 'smooth' }) }}>Why</a>
          <a href="#start" onClick={(e) => { e.preventDefault(); toStart() }}>Your schools</a>
        </nav>
      </header>

      <section className="h-hero">
        <div className="h-dots" aria-hidden />
        {plan && card && mon && slowest && (
          <div className="floaters" aria-hidden>
            <div className="fl fl-1 routecard">
              <div className="small faint">{floorName(card.roomId)}</div>
              <div className="cls">{card.label}</div>
              <div className="go">{card.route.summary}</div>
              <div className="meta mono">clear by {fmt(card.doneSec)} · {card.headcount} people</div>
            </div>
            <div className="fl fl-2 fl-kpi">
              <div className="mono v">{fmt(plan.current.totalSec)}</div>
              <div className="small muted">until the last person reaches the playground</div>
            </div>
            <div className="fl fl-3 fl-phone">
              <div className="small faint">Monitor · {mon.label}</div>
              <div className="mono clock">{fmt(mon.doneSec)}</div>
              <div className="fl-btn">Reached the playground</div>
              <div className="small faint">planned, {mon.headcount} heads</div>
            </div>
            {stairs[0] && (
              <div className="fl fl-4 fl-stair">
                <div className="small faint">Staircase {stairs[0][0]} · order</div>
                <ol>{stairs[0][1].slice(0, 4).map((l) => <li key={l}>{l}</li>)}</ol>
              </div>
            )}
          </div>
        )}
        <div className="h-center">
          <span className="eyebrow">Evacuation maps and mock drills for schools</span>
          <h1>
            Every class knows
            <br />
            its way <span className="script">out.</span>
          </h1>
          <p>Map your school once with a phone. Drillmap works out each class's route and staircase order, prints the floor maps, then times the real drill.</p>
          <div className="h-cta">
            <button className="pill-btn" onClick={() => create(demoSchool())}>Open the demo school</button>
            <button className="link-btn" onClick={toStart}>Map your own</button>
          </div>
        </div>
      </section>

      {plan && (
        <section className="h-show">
          <div className="show-head">
            <div>
              <h2>Worked out, not <span className="scribble">guessed.</span></h2>
              <p className="muted">The demo school, three floors, {groups.length} classes. Each arrow is a class's way out, and red is where a queue forms.</p>
            </div>
            <div className="segs">
              {[...floors].reverse().map((f) => (
                <button key={f.id} className={`seg ${f.id === floorId ? 'on' : ''}`} onClick={() => setFloorId(f.id)}>{f.name}</button>
              ))}
            </div>
          </div>
          <div className="show-map">
            <MapView school={demo} floorId={floorId} routes={passes.map((g) => ({ route: g.route }))} badges={badges} flow />
          </div>
        </section>
      )}

      <section className="h-facts" id="why">
        <p className="lead">NDMA's School Safety Policy asks every school for <span className="hl">a floor-wise evacuation plan and a mock drill.</span></p>
        <dl>
          <div><dt>6 months</dt><dd>The longest gap it recommends between two mock drills.</dd></div>
          <div><dt>Every floor</dt><dd>An evacuation plan on the notice board of each one.</dd></div>
          <div><dt>{plan ? fmt(plan.current.totalSec) : '—'}</dt><dd>The demo school's planned time to get everyone out, from walking speed, stair width and headcount.</dd></div>
        </dl>
        <p className="note">National Disaster Management Authority, School Safety Policy Guidelines (2016), Annexure 8.</p>
      </section>

      <section className="h-steps" id="how">
        <h2>From a floor plan to a timed drill</h2>
        <p className="muted sub">Four steps, all on the phone or laptop the school already has.</p>

        <Step n="01" title="Map" items={['Photo of the floor plan as the background.', 'Tap rooms, staircases, exits and the assembly point.', 'Walk a corridor with the phone to measure it.']}>
          {plan && <MapView school={demo} floorId={floors[1]?.id || floors[0].id} />}
        </Step>

        <Step n="02" title="Plan" items={['Each class gets its fastest route.', 'Classes are spread across staircases so no one waits long.', 'You see exactly where queues form.']}>
          <div className="mini-cards">
            {stairs.slice(0, 2).map(([k, order]) => (
              <div key={k} className="mini">
                <div className="small faint">Staircase {k}</div>
                <ol>{order.slice(0, 5).map((l) => <li key={l}>{l}</li>)}</ol>
              </div>
            ))}
            <div className="mini wide">
              <div className="small faint">Where queues form</div>
              {queues.map((u) => (
                <div key={u.link.id} className="qrow"><span>{u.link.label}</span><span className="mono">{fmt(u.queueSec)}</span></div>
              ))}
            </div>
          </div>
        </Step>

        <Step n="03" title="Print" items={['An A4 map for every floor\'s notice board.', 'A route card for every classroom door.', 'Plain words: which staircase, which gate, in what order.']}>
          <div className="cards-fan">
            {['6A', '9B', '12 Sci'].map((l) => {
              const g = byLabel(l)
              return g ? (
                <div key={l} className="routecard">
                  <div className="small faint">{floorName(g.roomId)}</div>
                  <div className="cls">{g.label}</div>
                  <div className="go">{g.route.summary}</div>
                  <div className="meta mono">clear by {fmt(g.doneSec)}</div>
                </div>
              ) : null
            })}
          </div>
        </Step>

        <Step n="04" title="Drill" items={['One monitor per class opens a link on a phone.', 'Two taps: left the room, reached the ground. Then a headcount.', 'The report shows the slow classes, missing heads and the jam.']}>
          <div className="drill-demo">
            {groups.slice(0, 6).map((g, i) => (
              <div key={g.roomId} className="dd-row">
                <span className="dd-cls">{g.label}</span>
                <span className="dd-bar"><i style={{ width: `${Math.round((g.doneSec / (slowest?.doneSec || 1)) * 100)}%`, animationDelay: `${i * 0.25}s` }} /></span>
                <span className="mono small">{fmt(g.doneSec)}</span>
              </div>
            ))}
            <p className="small faint">Planned times from the demo plan. A real drill fills these in from the monitors' taps.</p>
          </div>
        </Step>
      </section>

      <section className="h-start" id="start">
        <div className="start-card">
          <h2>Start with your school</h2>
          <label className="field">
            School name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kendriya Vidyalaya No. 2" onKeyDown={(e) => e.key === 'Enter' && create(blank())} />
          </label>
          <div className="row">
            <button className="pill-btn" onClick={() => create(blank())}>Create school</button>
            <button className="link-btn" onClick={() => create(demoSchool())}>or open the demo</button>
          </div>
          <p className="small faint">The demo is a made-up three-storey school. Its corridor lengths come from the drawing, not a walk.</p>
        </div>
        <div className="start-list">
          <h3>Your schools</h3>
          {!schools && <p className="muted">Loading…</p>}
          {schools && !schools.length && <p className="muted">None yet.</p>}
          {schools?.sort((a, b) => b.updatedAt - a.updatedAt).map((s) => (
            <div key={s.id} className="school-row">
              <a href={`#/s/${s.id}/map`}>{s.name}</a>
              <span className="small faint">{new Date(s.updatedAt).toLocaleDateString('en-IN')}</span>
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
          ))}
        </div>
      </section>

      <footer className="h-foot">
        <p className="quote">
          "It is recommended to prepare a floor wise evacuation plan and display it prominently at the notice board on each of the floors… The mock drill on
          earthquake, fire etc. may [be] conducted at periodic interval preferably once in every six months and the deficiencies may be assessed for updation of the plan."
        </p>
        <p className="small faint">NDMA, School Safety Policy Guidelines (2016), Annexure 8 · Drillmap</p>
      </footer>
    </div>
  )
}

function Step({ n, title, items, children }: { n: string; title: string; items: string[]; children: React.ReactNode }) {
  return (
    <div className="step">
      <div className="step-n mono">{n}</div>
      <div className="step-text">
        <h3>{title}</h3>
        <ul>{items.map((t, i) => <li key={t} className={i === 0 ? 'on' : ''}>{t}</li>)}</ul>
      </div>
      <div className="step-vis">{children}</div>
    </div>
  )
}
