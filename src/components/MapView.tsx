import { useRef } from 'react'
import type { MapNode, School } from '../lib/types'
import type { Route } from '../lib/graph'

export const VIEW_W = 1000
export const VIEW_H = 660

export type NodeStatus = 'waiting' | 'moving' | 'arrived' | 'silent'

interface Props {
  school: School
  floorId: string
  routes?: { route: Route }[]
  hotEdges?: Set<string> // edge ids where queues form, drawn red
  status?: Record<string, NodeStatus>
  badges?: Record<string, string> // node id → small text under the label
  selectedId?: string | null
  pendingId?: string | null
  interactive?: boolean
  onCanvasDown?: (x: number, y: number) => void
  onNodeDown?: (id: string, x: number, y: number) => void
  onEdgeClick?: (id: string) => void
  onMove?: (x: number, y: number) => void
  onUp?: () => void
  scaleLine?: [number, number, number, number] | null
}

const R = { room: 26, junction: 7, stair: 20, exit: 18, assembly: 30 }

function Glyph({ n, sel, pending, status }: { n: MapNode; sel: boolean; pending: boolean; status?: NodeStatus }) {
  const stroke = sel || pending ? 'var(--ink)' : undefined
  const sw = sel || pending ? 3 : 1.5
  if (n.kind === 'junction') return <circle r={R.junction} fill="#fff" stroke={stroke || '#9aa0a6'} strokeWidth={sw} />
  if (n.kind === 'room') {
    let fill = '#fff'
    let st = stroke || '#6b7177'
    let text = 'var(--ink)'
    if (status === 'moving') { fill = '#fff'; st = 'var(--accent)' }
    if (status === 'arrived') { fill = 'var(--accent)'; st = 'var(--accent)'; text = '#fff' }
    if (status === 'silent') { fill = 'var(--alert-soft)'; st = 'var(--alert)' }
    return (
      <g>
        <rect x={-34} y={-22} width={68} height={44} rx={8} fill={fill} stroke={st} strokeWidth={status === 'moving' ? 3.5 : sw} />
        {status === 'moving' && <rect x={-34} y={-22} width={68} height={44} rx={8} fill="none" stroke="var(--accent)" strokeWidth={2} className="pulse" />}
        <text textAnchor="middle" y={5} fontSize={14} fontWeight={650} fill={text} style={{ pointerEvents: 'none' }}>{n.label}</text>
      </g>
    )
  }
  if (n.kind === 'stair')
    return (
      <g>
        <rect x={-20} y={-20} width={40} height={40} rx={6} fill="var(--ink)" stroke={stroke} strokeWidth={sw} />
        <path d="M-11 9h7v-6h7v-6h7v-6" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinejoin="round" />
      </g>
    )
  if (n.kind === 'exit')
    return (
      <g>
        <rect x={-22} y={-16} width={44} height={32} rx={6} fill="var(--accent)" stroke={stroke} strokeWidth={sw} />
        <path d="M-8 -7h9M-8 0h13M-8 7h9M3 -4l4 4-4 4" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    )
  return (
    <g>
      <circle r={R.assembly} fill="var(--accent-soft)" stroke={stroke || 'var(--accent)'} strokeWidth={2} strokeDasharray="5 4" />
      <circle r={6} fill="var(--accent)" />
    </g>
  )
}

export function MapView(p: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const floor = p.school.floors.find((f) => f.id === p.floorId)
  const nodes = p.school.nodes.filter((n) => n.floorId === p.floorId)
  const ids = new Set(nodes.map((n) => n.id))
  const byId = new Map(p.school.nodes.map((n) => [n.id, n]))
  const edges = p.school.edges.filter((e) => ids.has(e.a) && ids.has(e.b))

  const toLocal = (e: React.PointerEvent) => {
    const svg = ref.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const m = svg.getScreenCTM()!.inverse()
    const q = pt.matrixTransform(m)
    return [Math.round(q.x), Math.round(q.y)] as const
  }

  // route segments on this floor, drawn in travel order
  // one line per corridor segment, with a single arrow at its middle pointing the way out
  const segMap = new Map<string, { d: string; hot: boolean }>()
  for (const { route } of p.routes || []) {
    for (let i = 0; i + 1 < route.nodes.length; i++) {
      const a = byId.get(route.nodes[i])
      const b = byId.get(route.nodes[i + 1])
      if (!a || !b || a.floorId !== p.floorId || b.floorId !== p.floorId) continue
      const k = `${a.id}>${b.id}`
      if (segMap.has(k)) continue
      const hot = !!p.hotEdges?.has(route.links[i]?.id)
      segMap.set(k, { d: `M${a.x} ${a.y}L${(a.x + b.x) / 2} ${(a.y + b.y) / 2}L${b.x} ${b.y}`, hot })
    }
  }
  const routeLines = [...segMap.entries()].map(([key, v]) => ({ key, ...v }))

  return (
    <div className="mapwrap">
      <svg
        ref={ref}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        onPointerDown={(e) => {
          if (!p.interactive) return
          if ((e.target as Element).closest('[data-node],[data-edge]')) return
          const [x, y] = toLocal(e)
          p.onCanvasDown?.(x, y)
        }}
        onPointerMove={(e) => p.onMove && p.onMove(...toLocal(e))}
        onPointerUp={() => p.onUp?.()}
        onPointerLeave={() => p.onUp?.()}
      >
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" className="map-grid" strokeWidth="1" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="var(--accent)" />
          </marker>
          <marker id="arrowhot" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="var(--alert)" />
          </marker>
        </defs>
        <rect width={VIEW_W} height={VIEW_H} fill="url(#grid)" />
        {floor?.image && <image href={floor.image} x={0} y={0} width={VIEW_W} height={VIEW_H} preserveAspectRatio="xMidYMid meet" opacity={0.55} />}
        {edges.map((e) => {
          const a = byId.get(e.a)!
          const b = byId.get(e.b)!
          return (
            <g key={e.id} data-edge onClick={() => p.onEdgeClick?.(e.id)}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge ${e.meters ? '' : 'est'} ${p.selectedId === e.id ? 'sel' : ''}`} />
              {p.interactive && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="edge-hit" />}
            </g>
          )
        })}
        {routeLines.map((s) => (
          <path key={s.key} d={s.d} className={`route ${s.hot ? 'hot' : ''}`} markerMid={s.hot ? 'url(#arrowhot)' : 'url(#arrow)'} />
        ))}
        {p.scaleLine && <line x1={p.scaleLine[0]} y1={p.scaleLine[1]} x2={p.scaleLine[2]} y2={p.scaleLine[3]} stroke="var(--alert)" strokeWidth={3} strokeDasharray="4 4" />}
        {nodes.map((n) => (
          <g
            key={n.id}
            data-node
            transform={`translate(${n.x} ${n.y})`}
            style={{ cursor: p.interactive ? 'pointer' : 'default' }}
            onPointerDown={(e) => {
              if (!p.interactive) return
              e.stopPropagation()
              ;(e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture?.(e.pointerId)
              const [x, y] = toLocal(e)
              p.onNodeDown?.(n.id, x, y)
            }}
          >
            <Glyph n={n} sel={p.selectedId === n.id} pending={p.pendingId === n.id} status={p.status?.[n.id]} />
            {n.kind !== 'room' && n.kind !== 'junction' && (
              <text className="node-label" textAnchor="middle" y={n.kind === 'assembly' ? 48 : 38}>
                {n.kind === 'stair' ? `Staircase ${n.stairKey || n.label}` : n.label}
              </text>
            )}
            {n.kind === 'room' && n.headcount != null && !p.badges?.[n.id] && (
              <text className="node-sub" textAnchor="middle" y={38}>{n.headcount} people</text>
            )}
            {p.badges?.[n.id] && (
              <text className="node-sub" textAnchor="middle" y={n.kind === 'room' ? 38 : 56}>{p.badges[n.id]}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}
