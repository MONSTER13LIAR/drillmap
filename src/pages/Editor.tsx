import { useEffect, useMemo, useRef, useState } from 'react'
import { MapView } from '../components/MapView'
import { WalkModal } from '../components/WalkModal'
import { edgeMeters, nodeLabel, settingsOf, validate } from '../lib/graph'
import { uid } from '../lib/id'
import type { MapNode, NodeKind, School } from '../lib/types'
import { useSchool } from '../lib/useSchool'

type Tool = 'select' | NodeKind | 'connect' | 'scale' | 'delete'

const TOOLS: [Tool, string, string, string][] = [
  ['select', 'Move / select', 'V', 'Drag things around. Click to edit.'],
  ['room', 'Classroom', 'R', 'Click where the classroom door is.'],
  ['junction', 'Corridor point', 'J', 'Click corners and junctions of corridors.'],
  ['stair', 'Staircase', 'S', 'Same letter on every floor = same staircase.'],
  ['exit', 'Exit / gate', 'E', 'Doors and gates people leave the building through.'],
  ['assembly', 'Assembly point', 'A', 'Where everyone gathers. Usually the ground or playground.'],
  ['connect', 'Connect', 'C', 'Click one point, then the next. Keeps chaining until Esc.'],
  ['scale', 'Set scale', 'M', 'Click two points you know the distance between.'],
  ['delete', 'Delete', 'X', 'Click a point or a connection to remove it.'],
]

const I = (d: string) => (
  <svg className="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
)
const ICON: Record<Tool, React.ReactNode> = {
  select: I('M5 3l6 16 2.2-6.8L20 10z'),
  room: I('M4 6h16v12H4zM9 18v-5h6v5'),
  junction: I('M12 4v16M4 12h16M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'),
  stair: I('M4 19h5v-5h5V9h5V4'),
  exit: I('M10 4H5v16h5M14 8l4 4-4 4M18 12H9'),
  assembly: I('M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0'),
  connect: I('M6 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M18 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.5 16.5l9-9'),
  scale: I('M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2'),
  delete: I('M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'),
}
const SHORT: Record<Tool, string> = { select: 'Move', room: 'Class', junction: 'Corridor', stair: 'Stairs', exit: 'Exit', assembly: 'Assembly', connect: 'Connect', scale: 'Scale', delete: 'Delete' }

async function compress(file: File): Promise<string> {
  const img = await createImageBitmap(file)
  const max = 1400
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k)
  c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.72)
}

function nextStairKey(s: School, floorId: string) {
  const used = new Set(s.nodes.filter((n) => n.kind === 'stair' && n.floorId === floorId).map((n) => n.stairKey))
  for (const c of 'ABCDEFGHJK') if (!used.has(c)) return c
  return 'Z'
}

export function Editor({ id }: { id: string }) {
  const { school, update, error, saving } = useSchool(id)
  const [floorId, setFloorId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [scalePts, setScalePts] = useState<number[] | null>(null)
  const [scaleAsk, setScaleAsk] = useState<number | null>(null)
  const [walkEdge, setWalkEdge] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (school && !floorId) setFloorId(school.floors[0]?.id || null)
  }, [school, floorId])

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'Escape') {
        setPending(null)
        setScalePts(null)
        setSel(null)
        return
      }
      const t = TOOLS.find((x) => x[2].toLowerCase() === e.key.toLowerCase())
      if (t) {
        setTool(t[0])
        setPending(null)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  const checks = useMemo(() => (school ? validate(school) : []), [school])

  if (error) return <main className="page"><p>Could not load this school: {error}</p></main>
  if (!school || !floorId) return <main className="page"><p className="muted">Loading…</p></main>
  const floor = school.floors.find((f) => f.id === floorId) || school.floors[0]
  const st = settingsOf(school)
  const selNode = school.nodes.find((n) => n.id === sel)
  const selEdge = school.edges.find((e) => e.id === sel)

  const addEdge = (a: string, b: string) => {
    if (a === b) return
    update((s) => {
      if (!s.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) s.edges.push({ id: uid('e'), a, b })
      return s
    })
  }

  const removeNode = (nid: string) =>
    update((s) => {
      s.nodes = s.nodes.filter((n) => n.id !== nid)
      s.edges = s.edges.filter((e) => e.a !== nid && e.b !== nid)
      return s
    })

  const onCanvasDown = (x: number, y: number) => {
    if (tool === 'scale') {
      if (!scalePts) setScalePts([x, y])
      else {
        const d = Math.hypot(x - scalePts[0], y - scalePts[1])
        setScalePts([...scalePts.slice(0, 2), x, y])
        setScaleAsk(d)
      }
      return
    }
    if (tool === 'select' || tool === 'connect' || tool === 'delete') {
      setSel(null)
      return
    }
    const kind = tool as NodeKind
    const count = school.nodes.filter((n) => n.kind === kind).length + 1
    const n: MapNode = {
      id: uid('n'),
      floorId: floor.id,
      kind,
      x,
      y,
      label:
        kind === 'room' ? `Room ${count}` : kind === 'junction' ? `C${count}` : kind === 'exit' ? `Gate ${count}` : kind === 'assembly' ? 'Assembly point' : '',
    }
    if (kind === 'room') n.headcount = 40
    if (kind === 'stair') {
      n.stairKey = nextStairKey(school, floor.id)
      n.label = n.stairKey
      n.widthM = st.defaultStairWidth
    }
    if (kind === 'exit') n.widthM = 1.5
    update((s) => {
      s.nodes.push(n)
      // quick chaining: if something was pending in connect mode, join to it
      return s
    })
    setSel(n.id)
  }

  const onNodeDown = (nid: string) => {
    if (tool === 'delete') return removeNode(nid)
    if (tool === 'connect') {
      if (pending) addEdge(pending, nid)
      setPending(nid)
      return
    }
    setSel(nid)
    if (tool === 'select') setDrag(nid)
  }

  const onEdgeClick = (eid: string) => {
    if (tool === 'delete') {
      update((s) => {
        s.edges = s.edges.filter((e) => e.id !== eid)
        return s
      })
      return
    }
    setSel(eid)
  }

  const setNode = (nid: string, patch: Partial<MapNode>) =>
    update((s) => {
      const n = s.nodes.find((x) => x.id === nid)
      if (n) Object.assign(n, patch)
      return s
    })

  const copyStairs = () =>
    update((s) => {
      const src = s.nodes.filter((n) => n.floorId === floor.id && n.kind === 'stair')
      for (const f of s.floors) {
        if (f.id === floor.id) continue
        for (const st2 of src) {
          if (s.nodes.some((n) => n.floorId === f.id && n.kind === 'stair' && n.stairKey === st2.stairKey)) continue
          s.nodes.push({ ...st2, id: uid('n'), floorId: f.id })
        }
      }
      return s
    })

  const hint = TOOLS.find((t) => t[0] === tool)![3]

  return (
    <div className="editor">
      <aside className="stack left">
        <div className="card stack schoolcard" style={{ padding: 12 }}>
          <label className="field">
            School
            <input value={school.name} onChange={(e) => update((s) => ({ ...s, name: e.target.value }))} />
          </label>
        </div>
        <div className="card dock" style={{ padding: 8 }}>
          <div className="toolbar">
            {TOOLS.map(([t, l, k]) => (
              <button key={t} title={`${l} (${k})`} className={`tool ${tool === t ? 'on' : ''}`} onClick={() => { setTool(t); setPending(null); setScalePts(null) }}>
                {ICON[t]}
                <span className="tl">{l}</span>
                <span className="ts">{SHORT[t]}</span>
                <span className="k">{k}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="canvas">
        <div className="floorbar">
          <div className="segs" role="tablist" aria-label="Floors">
            {[...school.floors].sort((a, b) => b.level - a.level).map((f) => (
              <button key={f.id} role="tab" aria-selected={f.id === floor.id} className={`seg ${f.id === floor.id ? 'on' : ''}`} onClick={() => { setFloorId(f.id); setSel(null); setPending(null) }}>
                {f.name}
                <span className="n">{school.nodes.filter((n) => n.floorId === f.id && n.kind === 'room').length}</span>
              </button>
            ))}
          <button
            className="seg add" title="Add a floor above"
            onClick={() => {
              const level = Math.max(...school.floors.map((f) => f.level)) + 1
              const nf = { id: uid('f'), name: level === 1 ? 'First floor' : level === 2 ? 'Second floor' : level === 3 ? 'Third floor' : `Floor ${level}`, level, pxPerMeter: floor.pxPerMeter }
              update((s) => {
                s.floors.push(nf)
                // staircases continue upward: copy them to the new floor at the same spot
                for (const n of s.nodes.filter((n) => n.floorId === floor.id && n.kind === 'stair')) s.nodes.push({ ...n, id: uid('n'), floorId: nf.id })
                return s
              })
              setFloorId(nf.id)
            }}
          >
            + Floor
          </button>
          </div>
          <span className="small faint save">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : saving === 'local' ? 'Saved in this browser' : saving === 'offline' ? 'Server unreachable, saved in this browser' : ''}</span>
        </div>
        <div className="hint">
          <b>{floor.name}</b> · {hint}
          {tool === 'connect' && pending && <> · from <b>{nodeLabel(school.nodes.find((n) => n.id === pending)!)}</b></>}
        </div>
        <MapView
          school={school}
          floorId={floor.id}
          interactive
          selectedId={sel}
          pendingId={pending}
          scaleLine={scalePts && scalePts.length === 4 ? (scalePts as [number, number, number, number]) : null}
          onCanvasDown={onCanvasDown}
          onNodeDown={onNodeDown}
          onEdgeClick={onEdgeClick}
          onMove={(x, y) => {
            if (!drag) return
            setNode(drag, { x: Math.max(10, Math.min(990, x)), y: Math.max(10, Math.min(650, y)) })
          }}
          onUp={() => setDrag(null)}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const data = await compress(f)
            update((s) => {
              s.floors.find((x) => x.id === floor.id)!.image = data
              return s
            })
            e.target.value = ''
          }} />
          <button onClick={() => fileRef.current?.click()}>{floor.image ? 'Replace plan photo' : 'Add a photo of the floor plan'}</button>
          {floor.image && <button className="ghost" onClick={() => update((s) => { delete s.floors.find((x) => x.id === floor.id)!.image; return s })}>Remove photo</button>}
          <button className="ghost" onClick={copyStairs}>Copy these staircases to every floor</button>
          <span className="small faint">Scale: {floor.pxPerMeter ? `${floor.pxPerMeter.toFixed(1)} px per metre` : 'not set (assuming 10 px per metre)'}</span>
        </div>
      </section>

      <aside className="stack right">
        {selNode && (
          <div className="card stack">
            <h3>{selNode.kind === 'room' ? 'Classroom' : selNode.kind === 'stair' ? 'Staircase' : selNode.kind === 'exit' ? 'Exit' : selNode.kind === 'assembly' ? 'Assembly point' : 'Corridor point'}</h3>
            {selNode.kind !== 'stair' && (
              <label className="field">
                Name
                <input value={selNode.label} onChange={(e) => setNode(selNode.id, { label: e.target.value })} autoFocus={matchMedia("(pointer: fine)").matches} />
              </label>
            )}
            {selNode.kind === 'room' && (
              <label className="field">
                People who leave from here
                <input type="number" min={0} value={selNode.headcount ?? 0} onChange={(e) => setNode(selNode.id, { headcount: parseInt(e.target.value) || 0 })} />
              </label>
            )}
            {selNode.kind === 'stair' && (
              <label className="field">
                Staircase letter (same on every floor)
                <input value={selNode.stairKey || ''} onChange={(e) => setNode(selNode.id, { stairKey: e.target.value.toUpperCase(), label: e.target.value.toUpperCase() })} />
              </label>
            )}
            {(selNode.kind === 'stair' || selNode.kind === 'exit') && (
              <label className="field">
                Clear width (m)
                <input type="number" step={0.1} min={0.5} value={selNode.widthM ?? ''} onChange={(e) => setNode(selNode.id, { widthM: parseFloat(e.target.value) || undefined })} />
              </label>
            )}
            <p className="small faint">{school.edges.filter((e) => e.a === selNode.id || e.b === selNode.id).length} connection(s)</p>
            <button className="danger" onClick={() => { removeNode(selNode.id); setSel(null) }}>Delete</button>
          </div>
        )}
        {selEdge && (() => {
          const a = school.nodes.find((n) => n.id === selEdge.a)!
          const b = school.nodes.find((n) => n.id === selEdge.b)!
          const m = edgeMeters(school, selEdge)
          return (
            <div className="card stack">
              <h3>Connection</h3>
              <p className="small muted">{nodeLabel(a)} – {nodeLabel(b)}</p>
              <div className="kpi">
                <div className="v">{m.meters.toFixed(1)} m</div>
                <div className="l">{m.measured ? (selEdge.source === 'walk' ? 'walked' : 'typed in') : 'estimated from the drawing'}</div>
              </div>
              <button className="primary" onClick={() => setWalkEdge(selEdge.id)}>Walk it to measure</button>
              <label className="field">
                Corridor clear width (m)
                <input type="number" step={0.1} min={0.5} placeholder={String(st.defaultCorridorWidth)} value={selEdge.widthM ?? ''} onChange={(e) => update((s) => { s.edges.find((x) => x.id === selEdge.id)!.widthM = parseFloat(e.target.value) || undefined; return s })} />
              </label>
              {m.measured && <button className="ghost" onClick={() => update((s) => { const x = s.edges.find((y) => y.id === selEdge.id)!; delete x.meters; delete x.source; return s })}>Back to estimate</button>}
              <button className="danger" onClick={() => { update((s) => { s.edges = s.edges.filter((x) => x.id !== selEdge.id); return s }); setSel(null) }}>Delete connection</button>
            </div>
          )
        })()}
        {!selNode && !selEdge && (
          <div className="card stack">
            <h3>This floor</h3>
            <label className="field">
              Name
              <input value={floor.name} onChange={(e) => update((s) => { s.floors.find((f) => f.id === floor.id)!.name = e.target.value; return s })} />
            </label>
            <label className="field">
              Level (0 = ground)
              <input type="number" value={floor.level} onChange={(e) => update((s) => { s.floors.find((f) => f.id === floor.id)!.level = parseInt(e.target.value) || 0; return s })} />
            </label>
            {school.floors.length > 1 && (
              <button className="danger" onClick={() => {
                if (!confirm(`Delete ${floor.name} and everything on it?`)) return
                update((s) => {
                  const gone = new Set(s.nodes.filter((n) => n.floorId === floor.id).map((n) => n.id))
                  s.nodes = s.nodes.filter((n) => !gone.has(n.id))
                  s.edges = s.edges.filter((e) => !gone.has(e.a) && !gone.has(e.b))
                  s.floors = s.floors.filter((f) => f.id !== floor.id)
                  return s
                })
                setFloorId(null)
              }}>Delete floor</button>
            )}
          </div>
        )}
        <div className="card stack">
          <h3>Checks</h3>
          {checks.map((c, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <span className={`pill ${c.level === 'error' ? 'bad' : c.level === 'warn' ? 'warn' : 'ok'}`}>{c.level === 'error' ? 'Fix' : c.level === 'warn' ? 'Check' : 'OK'}</span>
              <span className="small">{c.text}</span>
            </div>
          ))}
          {!checks.some((c) => c.level === 'error') && <a className="btn primary" href={`#/s/${school.id}/plan`}>See the plan →</a>}
        </div>
      </aside>

      {scaleAsk != null && (
        <ScaleModal
          px={scaleAsk}
          onClose={() => { setScaleAsk(null); setScalePts(null) }}
          onSave={(m) => {
            update((s) => { s.floors.find((f) => f.id === floor.id)!.pxPerMeter = scaleAsk / m; return s })
            setScaleAsk(null)
            setScalePts(null)
            setTool('select')
          }}
        />
      )}
      {walkEdge && (() => {
        const e = school.edges.find((x) => x.id === walkEdge)!
        const a = school.nodes.find((n) => n.id === e.a)!
        const b = school.nodes.find((n) => n.id === e.b)!
        return (
          <WalkModal
            label={`${nodeLabel(a)} to ${nodeLabel(b)}`}
            strideM={st.strideM}
            onClose={() => setWalkEdge(null)}
            onDone={(m) => {
              update((s) => { const x = s.edges.find((y) => y.id === walkEdge)!; x.meters = m; x.source = 'walk'; return s })
              setWalkEdge(null)
            }}
          />
        )
      })()}
    </div>
  )
}

function ScaleModal({ px, onSave, onClose }: { px: number; onSave: (m: number) => void; onClose: () => void }) {
  const [v, setV] = useState('')
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>How far apart are these two points?</h2>
        <p className="small muted">Pick something you know or can pace out, like the length of one classroom wall.</p>
        <input autoFocus inputMode="decimal" placeholder="metres" value={v} onChange={(e) => setV(e.target.value)} />
        <div className="row">
          <button className="primary" disabled={!(parseFloat(v) > 0)} onClick={() => onSave(parseFloat(v))}>Set scale</button>
          <span className="small faint mono">{px.toFixed(0)} px on the drawing</span>
        </div>
      </div>
    </div>
  )
}
