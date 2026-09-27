import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { MapView, type NodeStatus } from '../components/MapView'
import { drillAction, getSchool } from '../lib/api'
import { fmt } from '../lib/graph'
import type { School } from '../lib/types'
import { useDrill, useTick } from '../lib/useDrill'
import { classRows } from '../lib/report'

export function Coordinator({ code }: { code: string }) {
  const { drill, setDrill, error, serverNow } = useDrill(code)
  const [school, setSchool] = useState<School | null>(null)
  const [qr, setQr] = useState('')
  useTick(500)
  const joinUrl = `${location.origin}/#/m/${code}`

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: '#16181a', light: '#ffffff' } }).then(setQr)
  }, [joinUrl])
  useEffect(() => {
    if (drill && !school) getSchool(drill.schoolId).then(setSchool).catch(() => {})
  }, [drill, school])

  if (error) return <main className="page"><p>Drill not found: {error}</p></main>
  if (!drill) return <main className="page"><p className="muted">Loading drill…</p></main>

  const rows = classRows(drill)
  const now = serverNow()
  const elapsed = drill.startedAt ? ((drill.endedAt || now) - drill.startedAt) / 1000 : 0
  const left = rows.filter((r) => r.leftSec != null).length
  const arrived = rows.filter((r) => r.arrivedSec != null).length
  const counted = rows.reduce((a, r) => a + (r.present ?? 0), 0)
  const total = rows.reduce((a, r) => a + r.headcount, 0)
  const joined = Object.entries(drill.presence || {}).filter(([, t]) => now - t < 30_000).map(([r]) => r)

  const status: Record<string, NodeStatus> = {}
  const badges: Record<string, string> = {}
  for (const r of rows) {
    if (!drill.startedAt) {
      status[r.roomId] = joined.includes(r.roomId) ? 'arrived' : 'waiting'
      badges[r.roomId] = joined.includes(r.roomId) ? 'monitor ready' : 'no monitor yet'
    } else if (r.arrivedSec != null) {
      status[r.roomId] = 'arrived'
      badges[r.roomId] = `out ${fmt(r.arrivedSec)}`
    } else if (r.leftSec != null) {
      status[r.roomId] = 'moving'
      badges[r.roomId] = `moving ${fmt(elapsed - r.leftSec)}`
    } else {
      status[r.roomId] = elapsed > 90 ? 'silent' : 'waiting'
      badges[r.roomId] = 'not left'
    }
  }

  const act = async (a: 'start' | 'end') => {
    if (a === 'end' && !confirm('End the drill and see the report?')) return
    const d = await drillAction(code, a)
    setDrill(d)
    if (a === 'end') location.hash = `#/d/${code}/report`
  }

  const floors = school ? [...school.floors].sort((a, b) => b.level - a.level) : []

  return (
    <>
      <header className="topbar">
        <a className="brand" href={school ? `#/s/${school.id}/drills` : '#/'}>
          <img src="/icon.svg" alt="" />
          Drillmap
        </a>
        <span className="muted small">{drill.schoolName} · drill <span className="mono">{code}</span></span>
        <span className="spacer" />
        {!drill.startedAt && <button className="primary" onClick={() => act('start')}>Alarm rung: start the clock</button>}
        {drill.startedAt && !drill.endedAt && <button onClick={() => act('end')}>End drill</button>}
        {drill.endedAt && <a className="btn primary" href={`#/d/${code}/report`}>Report</a>}
      </header>
      <main className="page stack">
        {!drill.startedAt ? (
          <div className="grid2">
            <div className="card stack">
              <h2>Monitors, join here</h2>
              <p className="muted">One monitor per class opens this on their phone and picks their class. When everyone is ready, ring the alarm and press start.</p>
              <div className="mono" style={{ fontSize: 44, letterSpacing: '0.12em' }}>{code}</div>
              <p className="small mono muted" style={{ wordBreak: 'break-all' }}>{joinUrl}</p>
              <p className="small">
                <b>{joined.length}</b> of {rows.length} classes have a monitor ready
                {rows.length - joined.length > 0 && <span className="muted"> · waiting on {rows.filter((r) => !joined.includes(r.roomId)).map((r) => r.label).join(', ')}</span>}
              </p>
            </div>
            <div className="card" style={{ display: 'grid', placeItems: 'center' }}>{qr && <img src={qr} alt="Join code" style={{ width: '100%', maxWidth: 320 }} />}</div>
          </div>
        ) : (
          <div className="grid3">
            <div className="card kpi"><div className="v" style={{ fontSize: 44 }}>{fmt(elapsed)}</div><div className="l">since the alarm{drill.endedAt ? ' (ended)' : ''}</div></div>
            <div className="card kpi"><div className="v">{arrived}<span className="faint">/{rows.length}</span></div><div className="l">classes at {drill.assembly || 'the assembly point'} · {left - arrived} on the way</div></div>
            <div className="card kpi"><div className="v">{counted}<span className="faint">/{total}</span></div><div className="l">people counted</div></div>
          </div>
        )}

        {school && (
          <div className="grid2">
            {floors.map((f) => (
              <div key={f.id} className="stack" style={{ gap: 6 }}>
                <h3>{f.name}</h3>
                <MapView school={school} floorId={f.id} status={status} badges={badges} />
              </div>
            ))}
          </div>
        )}

        {drill.startedAt && (
          <div className="card flat">
            <table>
              <thead>
                <tr><th>Class</th><th>Route</th><th className="num">Left</th><th className="num">Reached</th><th className="num">Plan</th><th className="num">Counted</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.roomId}>
                    <td><b>{r.label}</b> <span className="small faint">{r.floor}</span></td>
                    <td className="small">{r.via}</td>
                    <td className="num">{r.leftSec != null ? fmt(r.leftSec) : '–'}</td>
                    <td className="num" style={{ color: r.deltaSec != null && r.deltaSec > 30 ? 'var(--alert)' : undefined }}>{r.arrivedSec != null ? fmt(r.arrivedSec) : '–'}</td>
                    <td className="num faint">{fmt(r.expectedSec)}</td>
                    <td className="num" style={{ color: r.present != null && r.present < r.headcount ? 'var(--alert)' : undefined }}>{r.present != null ? `${r.present}/${r.headcount}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  )
}
