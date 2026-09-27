import type { MapEdge, MapNode, School, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'

// A link is a walkable segment: either a drawn edge on one floor, or one storey of a staircase.
export interface Link {
  id: string
  a: string
  b: string
  meters: number
  measured: boolean
  isStair: boolean
  widthM: number
  label: string
  stairKey?: string
}

const DEFAULT_PX_PER_M = 10

export function settingsOf(s: School): Settings {
  const out = { ...DEFAULT_SETTINGS, ...(s.settings || {}) }
  // a half-typed value must never divide by zero
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = out[k]
    if (!(typeof v === 'number' && isFinite(v)) || (k !== 'reactionSec' && v <= 0.01)) out[k] = DEFAULT_SETTINGS[k]
  }
  return out
}

export function nodeLabel(n: MapNode): string {
  if (n.kind === 'stair') return `Staircase ${n.stairKey || n.label || '?'}`
  return n.label || n.kind
}

function edgeLabel(a: MapNode, b: MapNode): string {
  // corridor points are drawing aids, so name the segment after the real place at its end
  const real = [a, b].filter((n) => n.kind !== 'junction')
  if (!real.length) return 'Corridor'
  if (real.length === 1) return real[0].kind === 'room' ? `Doorway of ${real[0].label}` : `Corridor to ${nodeLabel(real[0])}`
  return `${nodeLabel(a)} to ${nodeLabel(b)}`
}

export function edgeMeters(s: School, e: MapEdge): { meters: number; measured: boolean } {
  if (e.meters && e.meters > 0) return { meters: e.meters, measured: true }
  const a = s.nodes.find((n) => n.id === e.a)
  const b = s.nodes.find((n) => n.id === e.b)
  if (!a || !b) return { meters: 0, measured: false }
  const floor = s.floors.find((f) => f.id === a.floorId)
  const ppm = floor?.pxPerMeter || DEFAULT_PX_PER_M
  return { meters: Math.hypot(a.x - b.x, a.y - b.y) / ppm, measured: false }
}

export function buildLinks(s: School): Link[] {
  const st = settingsOf(s)
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  const links: Link[] = []
  for (const e of s.edges) {
    const a = byId.get(e.a)
    const b = byId.get(e.b)
    if (!a || !b) continue
    const { meters, measured } = edgeMeters(s, e)
    links.push({
      id: e.id,
      a: e.a,
      b: e.b,
      meters,
      measured,
      isStair: false,
      widthM: e.widthM || st.defaultCorridorWidth,
      label: edgeLabel(a, b),
    })
  }
  // staircases: same stairKey on adjacent levels are joined by one storey of stair
  const levelOf = new Map(s.floors.map((f) => [f.id, f.level]))
  const stairs = s.nodes.filter((n) => n.kind === 'stair' && n.stairKey)
  const byKey = new Map<string, MapNode[]>()
  for (const n of stairs) {
    const k = n.stairKey!.trim().toUpperCase()
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k)!.push(n)
  }
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((p, q) => (levelOf.get(p.floorId) ?? 0) - (levelOf.get(q.floorId) ?? 0))
    for (let i = 0; i + 1 < sorted.length; i++) {
      const lo = sorted[i]
      const hi = sorted[i + 1]
      const storeys = Math.max(1, (levelOf.get(hi.floorId) ?? 0) - (levelOf.get(lo.floorId) ?? 0))
      links.push({
        id: `stair:${key}:${lo.id}:${hi.id}`,
        a: lo.id,
        b: hi.id,
        meters: storeys * st.stairMetersPerFloor,
        measured: false,
        isStair: true,
        widthM: Math.min(lo.widthM || st.defaultStairWidth, hi.widthM || st.defaultStairWidth),
        label: `Staircase ${key}, ${s.floors.find((f) => f.id === hi.floorId)?.name || 'upper'} down to ${s.floors.find((f) => f.id === lo.floorId)?.name || 'lower'}`,
        stairKey: key,
      })
    }
  }
  return links
}

export function linkSeconds(l: Link, st: Settings): number {
  return l.meters / (l.isStair ? st.stairSpeed : st.walkSpeed)
}

export function linkCapacity(l: Link, st: Settings): number {
  return Math.max(0.2, l.widthM * (l.isStair ? st.stairFlow : st.corridorFlow))
}

interface Adj {
  to: string
  link: Link
}

function adjacency(links: Link[]): Map<string, Adj[]> {
  const adj = new Map<string, Adj[]>()
  const push = (k: string, v: Adj) => {
    if (!adj.has(k)) adj.set(k, [])
    adj.get(k)!.push(v)
  }
  for (const l of links) {
    push(l.a, { to: l.b, link: l })
    push(l.b, { to: l.a, link: l })
  }
  return adj
}

// Dijkstra on walking time. `banned` lets us force alternatives.
function shortest(
  adj: Map<string, Adj[]>,
  st: Settings,
  from: string,
  isTarget: (id: string) => boolean,
  banned?: (l: Link) => boolean,
): { nodes: string[]; links: Link[]; sec: number } | null {
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, { node: string; link: Link }>()
  const done = new Set<string>()
  const queue: [number, string][] = [[0, from]]
  while (queue.length) {
    queue.sort((p, q) => p[0] - q[0])
    const [d, u] = queue.shift()!
    if (done.has(u)) continue
    done.add(u)
    if (isTarget(u)) {
      const nodes = [u]
      const links: Link[] = []
      let cur = u
      while (prev.has(cur)) {
        const p = prev.get(cur)!
        links.unshift(p.link)
        nodes.unshift(p.node)
        cur = p.node
      }
      return { nodes, links, sec: d }
    }
    for (const { to, link } of adj.get(u) || []) {
      if (banned && banned(link)) continue
      const nd = d + linkSeconds(link, st)
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd)
        prev.set(to, { node: u, link })
        queue.push([nd, to])
      }
    }
  }
  return null
}

export interface Route {
  nodes: string[]
  links: Link[]
  walkSec: number
  exitId?: string
  stairKeys: string[]
  summary: string
}

function describe(s: School, nodes: string[], links: Link[]): { exitId?: string; stairKeys: string[]; summary: string } {
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  const stairKeys = [...new Set(links.filter((l) => l.isStair).map((l) => l.stairKey!))]
  const exit = nodes.map((id) => byId.get(id)).find((n) => n?.kind === 'exit')
  const assembly = byId.get(nodes[nodes.length - 1])
  const parts: string[] = []
  for (const k of stairKeys) parts.push(`Staircase ${k}`)
  if (exit) parts.push(exit.label || 'Exit')
  if (assembly) parts.push(assembly.label || 'Assembly point')
  return { exitId: exit?.id, stairKeys, summary: parts.join(' → ') }
}

// Candidate routes for one room: plain shortest, then the best route through every other
// staircase and every other exit. Deduplicated by the links they use.
export function candidateRoutes(s: School, roomId: string): Route[] {
  const st = settingsOf(s)
  const links = buildLinks(s)
  const adj = adjacency(links)
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  const isAssembly = (id: string) => byId.get(id)?.kind === 'assembly'
  const out: Route[] = []
  const seen = new Set<string>()
  const add = (r: { nodes: string[]; links: Link[]; sec: number } | null) => {
    if (!r) return
    const key = r.links.map((l) => l.id).join('|')
    if (seen.has(key)) return
    seen.add(key)
    out.push({ nodes: r.nodes, links: r.links, walkSec: r.sec, ...describe(s, r.nodes, r.links) })
  }
  add(shortest(adj, st, roomId, isAssembly))
  const stairKeys = [...new Set(links.filter((l) => l.isStair).map((l) => l.stairKey!))]
  for (const k of stairKeys) add(shortest(adj, st, roomId, isAssembly, (l) => l.isStair && l.stairKey !== k))
  for (const ex of s.nodes.filter((n) => n.kind === 'exit')) {
    // force this exit: reach it first, then go on to assembly
    const toExit = shortest(adj, st, roomId, (id) => id === ex.id, (l) => {
      // do not pass through other exits on the way
      const other = [l.a, l.b].some((id) => id !== ex.id && byId.get(id)?.kind === 'exit')
      return other
    })
    if (!toExit) continue
    const onward = shortest(adj, st, ex.id, isAssembly)
    if (!onward) continue
    add({ nodes: [...toExit.nodes, ...onward.nodes.slice(1)], links: [...toExit.links, ...onward.links], sec: toExit.sec + onward.sec })
  }
  // the room must actually leave through a stair when it is upstairs; drop routes with loops
  return out
    .filter((r) => new Set(r.nodes).size === r.nodes.length)
    .sort((p, q) => p.walkSec - q.walkSec)
}

export interface GroupResult {
  roomId: string
  label: string
  headcount: number
  route: Route
  routeIndex: number
  startSec: number // when the first person leaves
  frontArriveSec: number // first person reaches assembly
  doneSec: number // last person reaches assembly
  waitSec: number // total time spent queueing
  waits: { linkId: string; label: string; sec: number; behind: string[] }[]
}

export interface LinkUse {
  link: Link
  groups: { roomId: string; label: string; enter: number; leave: number }[]
  queueSec: number
}

export interface Simulation {
  groups: GroupResult[]
  totalSec: number
  unreachable: string[]
  links: Map<string, LinkUse>
  stairOrder: Record<string, string[]> // stairKey → room labels in the order they enter
}

// Deterministic flow model. Each class moves as one group of N people.
// A link lets `capacity` people per second in; a group needs N / capacity seconds to get through its door.
// If another group is still entering, the newcomer waits. Events are processed in time order.
export function allCandidates(s: School): Map<string, Route[]> {
  const m = new Map<string, Route[]>()
  for (const r of s.nodes.filter((n) => n.kind === 'room' && (n.headcount ?? 0) > 0)) m.set(r.id, candidateRoutes(s, r.id))
  return m
}

export function simulate(s: School, choice: Record<string, number> = {}, cache?: Map<string, Route[]>): Simulation {
  const st = settingsOf(s)
  const rooms = s.nodes.filter((n) => n.kind === 'room' && (n.headcount ?? 0) > 0)
  const groups: GroupResult[] = []
  const unreachable: string[] = []
  const candMap = cache || allCandidates(s)
  for (const r of rooms) {
    const cands = candMap.get(r.id) || []
    if (!cands.length) {
      unreachable.push(r.id)
      continue
    }
    const idx = Math.min(choice[r.id] ?? 0, cands.length - 1)
    groups.push({
      roomId: r.id,
      label: r.label || 'Room',
      headcount: r.headcount || 0,
      route: cands[idx],
      routeIndex: idx,
      startSec: st.reactionSec,
      frontArriveSec: 0,
      doneSec: 0,
      waitSec: 0,
      waits: [],
    })
  }
  const freeAt = new Map<string, number>()
  const uses = new Map<string, LinkUse>()
  const lastIn = new Map<string, string[]>()
  // event: group index, step index, time the group's front reaches the link
  type Ev = { t: number; g: number; step: number }
  const events: Ev[] = groups.map((g, i) => ({ t: g.startSec, g: i, step: 0 }))
  const bottleneck = groups.map(() => Infinity)
  while (events.length) {
    // earliest first; ties: the group with more people still ahead of it goes first (stable by index)
    events.sort((p, q) => p.t - q.t || p.g - q.g)
    const ev = events.shift()!
    const g = groups[ev.g]
    const link = g.route.links[ev.step]
    if (!link) {
      g.frontArriveSec = ev.t
      g.doneSec = ev.t + g.headcount / bottleneck[ev.g]
      continue
    }
    const cap = linkCapacity(link, st)
    bottleneck[ev.g] = Math.min(bottleneck[ev.g], cap)
    const enter = Math.max(ev.t, freeAt.get(link.id) ?? 0)
    const wait = enter - ev.t
    const through = g.headcount / cap
    freeAt.set(link.id, enter + through)
    if (!uses.has(link.id)) uses.set(link.id, { link, groups: [], queueSec: 0 })
    const u = uses.get(link.id)!
    u.groups.push({ roomId: g.roomId, label: g.label, enter, leave: enter + through })
    u.queueSec += wait
    if (wait > 0.5) {
      g.waitSec += wait
      g.waits.push({ linkId: link.id, label: link.label, sec: wait, behind: [...(lastIn.get(link.id) || [])] })
    }
    lastIn.set(link.id, [...(lastIn.get(link.id) || []), g.label])
    events.push({ t: enter + linkSeconds(link, st), g: ev.g, step: ev.step + 1 })
  }
  const stairOrder: Record<string, string[]> = {}
  for (const u of uses.values()) {
    if (!u.link.isStair || !u.link.stairKey) continue
    const key = u.link.stairKey
    const order = [...u.groups].sort((p, q) => p.enter - q.enter).map((x) => x.label)
    const prevOrder = stairOrder[key] || []
    for (const lab of order) if (!prevOrder.includes(lab)) prevOrder.push(lab)
    stairOrder[key] = prevOrder
  }
  const totalSec = groups.reduce((m, g) => Math.max(m, g.doneSec), 0)
  return { groups, totalSec, unreachable, links: uses, stairOrder }
}

function score(sim: Simulation): number {
  return sim.totalSec * 1000 + sim.groups.reduce((a, g) => a + g.doneSec, 0)
}

// Local search: move one class at a time to another candidate route while total time falls.
export function optimise(s: School, maxRounds = 6): { choice: Record<string, number>; before: Simulation; after: Simulation } {
  const cache = allCandidates(s)
  const before = simulate(s, {}, cache)
  const choice: Record<string, number> = {}
  let best = before
  const options = new Map<string, number>()
  for (const g of before.groups) options.set(g.roomId, cache.get(g.roomId)!.length)
  for (let round = 0; round < maxRounds; round++) {
    let improved = false
    for (const [roomId, n] of options) {
      for (let k = 0; k < n; k++) {
        if ((choice[roomId] ?? 0) === k) continue
        const trial = { ...choice, [roomId]: k }
        const sim = simulate(s, trial, cache)
        if (score(sim) < score(best) - 1e-6) {
          best = sim
          choice[roomId] = k
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return { choice, before, after: best }
}

export interface Check {
  level: 'error' | 'warn' | 'ok'
  text: string
}

export function validate(s: School): Check[] {
  const out: Check[] = []
  const rooms = s.nodes.filter((n) => n.kind === 'room')
  if (!s.nodes.some((n) => n.kind === 'assembly')) out.push({ level: 'error', text: 'No assembly point yet. Add one where everyone gathers.' })
  if (!s.nodes.some((n) => n.kind === 'exit')) out.push({ level: 'warn', text: 'No exit marked. Mark the gates or doors people leave the building through.' })
  if (!rooms.length) out.push({ level: 'warn', text: 'No classrooms yet.' })
  const noHead = rooms.filter((r) => !r.headcount)
  if (noHead.length) out.push({ level: 'warn', text: `${noHead.length} room(s) have no headcount: ${noHead.map((r) => r.label).join(', ')}` })
  if (s.nodes.some((n) => n.kind === 'assembly')) {
    const cache = allCandidates(s)
    const stuck = rooms.filter((r) => (r.headcount ?? 0) > 0 && !(cache.get(r.id) || []).length)
    if (stuck.length) out.push({ level: 'error', text: `No route to the assembly point from: ${stuck.map((r) => r.label).join(', ')}` })
  }
  const upper = s.floors.filter((f) => f.level > 0)
  for (const f of upper) {
    const stairs = s.nodes.filter((n) => n.floorId === f.id && n.kind === 'stair')
    if (!stairs.length && s.nodes.some((n) => n.floorId === f.id)) out.push({ level: 'error', text: `${f.name} has no staircase marked.` })
  }
  const est = s.edges.filter((e) => !(e.meters && e.meters > 0)).length
  if (est) out.push({ level: 'warn', text: `${est} of ${s.edges.length} connections are estimated from the drawing, not walked.` })
  if (!out.length) out.push({ level: 'ok', text: 'Map is complete. Every class has a route.' })
  return out
}

export function fmt(sec: number): string {
  if (!isFinite(sec)) return '–'
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
