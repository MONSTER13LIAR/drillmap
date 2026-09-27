import { useEffect, useState } from 'react'
import { getSchool, listDrills } from '../lib/api'
import { fmt, settingsOf } from '../lib/graph'
import { analyse } from '../lib/report'
import type { Drill, School } from '../lib/types'
import { useDrill } from '../lib/useDrill'

export function Report({ code }: { code: string }) {
  const { drill, error } = useDrill(code, 10000)
  const [school, setSchool] = useState<School | null>(null)
  const [prev, setPrev] = useState<Drill | null>(null)

  useEffect(() => {
    if (!drill) return
    getSchool(drill.schoolId).then(setSchool).catch(() => {})
    listDrills(drill.schoolId)
      .then((all) => {
        const earlier = all
          .filter((d) => d.code !== drill.code && d.startedAt && d.endedAt && d.startedAt < (drill.startedAt || Infinity))
          .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        setPrev(earlier[0] || null)
      })
      .catch(() => {})
  }, [drill?.code, drill?.schoolId])

  if (error) return <main className="page"><p>Drill not found: {error}</p></main>
  if (!drill) return <main className="page"><p className="muted">Loading…</p></main>
  if (!drill.startedAt) return <main className="page"><p>This drill has not started yet. <a href={`#/d/${code}`}>Open it</a></p></main>

  const st = school ? settingsOf(school) : { targetSec: 180, reactionSec: 20 }
  const prevTotal = prev ? analyse(prev, st.targetSec, st.reactionSec).totalSec : undefined
  const { rows, findings, totalSec, lastSec, complete, plannedTotal } = analyse(drill, st.targetSec, st.reactionSec, prevTotal)
  const counted = rows.reduce((a, r) => a + (r.present ?? 0), 0)
  const total = rows.reduce((a, r) => a + r.headcount, 0)
  const when = new Date(drill.startedAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })

  return (
    <>
      <header className="topbar">
        <a className="brand" href={`#/s/${drill.schoolId}/drills`}>
          <img src="/icon.svg" alt="" />
          Drillmap
        </a>
        <span className="spacer" />
        <button onClick={() => window.print()}>Print report</button>
      </header>
      <main className="page stack">
        <div>
          <div className="small faint">Mock drill report · {when} · code <span className="mono">{code}</span></div>
          <h1>{drill.schoolName}</h1>
        </div>
        <div className="grid3">
          <div className="card kpi">
            <div className="v">{complete && totalSec != null ? fmt(totalSec) : 'incomplete'}</div>
            <div className="l">
              {complete ? `alarm to last class at ${drill.assembly || 'the assembly point'}` : `last report came in at ${lastSec != null ? fmt(lastSec) : '–'}`} · plan said {fmt(plannedTotal)}
            </div>
          </div>
          <div className="card kpi">
            <div className="v">{rows.filter((r) => r.arrivedSec != null).length}<span className="faint">/{rows.length}</span></div>
            <div className="l">classes reported in</div>
          </div>
          <div className="card kpi">
            <div className="v" style={{ color: counted < total ? 'var(--alert)' : undefined }}>{counted}<span className="faint">/{total}</span></div>
            <div className="l">people counted at the assembly point</div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 4 }}>What to fix before the next drill</h2>
          {findings.map((f, i) => (
            <div key={i} className={`finding ${f.level}`}>
              <div className="bar" />
              <div>
                <h3>{f.title}</h3>
                <p className="small muted">{f.detail}</p>
                {f.action && <p className="act"><b>Next time:</b> {f.action}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="card flat">
          <table>
            <thead>
              <tr><th>Class</th><th>Route</th><th className="num">Left room</th><th className="num">Reached</th><th className="num">Plan</th><th className="num">Difference</th><th className="num">Counted</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.roomId}>
                  <td><b>{r.label}</b><div className="small faint">{r.floor}</div></td>
                  <td className="small">{r.via}</td>
                  <td className="num">{r.leftSec != null ? fmt(r.leftSec) : '–'}</td>
                  <td className="num">{r.arrivedSec != null ? fmt(r.arrivedSec) : '–'}</td>
                  <td className="num faint">{fmt(r.expectedSec)}</td>
                  <td className="num" style={{ color: r.deltaSec != null && r.deltaSec > 20 ? 'var(--alert)' : r.deltaSec != null && r.deltaSec < 0 ? 'var(--accent)' : undefined }}>
                    {r.deltaSec != null ? `${r.deltaSec >= 0 ? '+' : '−'}${fmt(Math.abs(r.deltaSec))}` : '–'}
                  </td>
                  <td className="num" style={{ color: r.present != null && r.present < r.headcount ? 'var(--alert)' : undefined }}>{r.present != null ? `${r.present}/${r.headcount}` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small faint">
          Times come from monitors' taps on their phones, stamped by the server. The plan uses common planning figures, so a gap between plan and
          drill is a finding in itself: it shows where this school is slower or faster than the textbook.
        </p>
      </main>
    </>
  )
}
