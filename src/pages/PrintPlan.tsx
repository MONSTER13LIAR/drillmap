import { MapView } from '../components/MapView'
import { fmt } from '../lib/graph'
import { usePlan } from '../lib/usePlan'
import { useSchool } from '../lib/useSchool'
import { LangToggle, routeText, T, useLang } from '../lib/i18n'

export function PrintPlan({ id }: { id: string }) {
  const { school } = useSchool(id)
  const plan = usePlan(school)
  const [lang, setLang] = useLang()
  const t = T[lang]
  if (!school || !plan) return <main className="page"><p className="muted">Preparing…</p></main>
  const sim = plan.current
  const assembly = school.nodes.find((n) => n.kind === 'assembly')?.label || t.assemblyPoint
  const floors = [...school.floors].sort((a, b) => b.level - a.level)
  const floorName = (roomId: string) => school.floors.find((f) => f.id === school.nodes.find((n) => n.id === roomId)?.floorId)?.name || ''
  const today = new Date().toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <main className="page">
      <div className="row no-print" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Print</h1>
          <p className="muted">One A4 sheet per floor for the notice board, then route cards to stick on each classroom door.</p>
        </div>
        <div className="row">
          <LangToggle lang={lang} set={setLang} />
          <button className="primary" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {floors.map((f) => {
        const roomsHere = sim.groups.filter((g) => school.nodes.find((n) => n.id === g.roomId)?.floorId === f.id)
        const passes = sim.groups.filter((g) => g.route.nodes.some((nid) => school.nodes.find((n) => n.id === nid)?.floorId === f.id))
        const stairsHere = [...new Set(roomsHere.flatMap((g) => g.route.stairKeys.slice(0, 1)))]
        return (
          <section key={f.id} className="sheet" lang={lang}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
              <div>
                <div className="small faint">{school.name} · {t.evacPlan}</div>
                <h2 style={{ fontSize: 30 }}>{f.name}</h2>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="small faint">{t.assemblyPoint}</div>
                <div style={{ fontWeight: 650, fontSize: 18 }}>{assembly}</div>
              </div>
            </div>
            <MapView school={school} floorId={f.id} routes={passes.map((g) => ({ route: g.route }))} words={{ staircase: t.staircase, people: t.people }} />
            <div className="row" style={{ marginTop: 12, alignItems: 'flex-start', gap: 28 }}>
              <div className="small" style={{ flex: 1 }}>
                <b>{t.whenAlarm}</b> {t.rules}
              </div>
              {stairsHere.map((k) => (
                <div key={k} className="small">
                  <b>{t.stairOrder(k)}</b>
                  <div>{(sim.stairOrder[k] || []).filter((l) => roomsHere.some((g) => g.label === l)).join(' → ')}</div>
                </div>
              ))}
            </div>
            <div className="small faint" style={{ marginTop: 8 }}>{t.prepared(today)}</div>
          </section>
        )
      })}

      <section className="sheet" lang={lang}>
        <div className="small faint" style={{ marginBottom: 10 }}>{t.cardsHead}</div>
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
                <div className="go">{routeText(g.route.summary, lang)}</div>
                {key && pos >= 0 && (
                  <div className="small" style={{ marginTop: 6 }}>
                    {t.yourTurn(key, pos + 1)}
                    {pos > 0 && t.after(order.slice(Math.max(0, pos - 2), pos).join(', '))}
                  </div>
                )}
                <div className="meta">{t.planned(fmt(g.doneSec), g.headcount, assembly)}</div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
