import type { Floor, MapEdge, MapNode, School } from './types'
import { DEFAULT_SETTINGS } from './types'
import { uid } from './id'

// A three-storey demo school so the app can be tried before mapping a real one.
// Every length here is estimated from the drawing (10 px = 1 m), none is walked.
export function demoSchool(): School {
  const floors: Floor[] = [
    { id: uid('f'), name: 'Ground floor', level: 0, pxPerMeter: 10 },
    { id: uid('f'), name: 'First floor', level: 1, pxPerMeter: 10 },
    { id: uid('f'), name: 'Second floor', level: 2, pxPerMeter: 10 },
  ]
  const nodes: MapNode[] = []
  const edges: MapEdge[] = []
  const link = (a: MapNode, b: MapNode) => edges.push({ id: uid('e'), a: a.id, b: b.id })
  const rooms: [string, number][][] = [
    [['6A', 36], ['6B', 38], ['Library', 20], ['7A', 40], ['7B', 39], ['Office', 8]],
    [['8A', 42], ['8B', 41], ['8C', 40], ['9A', 44], ['9B', 43], ['9C', 41]],
    [['10A', 45], ['10B', 44], ['11 Sci', 38], ['11 Com', 35], ['12 Sci', 37], ['12 Com', 33]],
  ]
  const xs = [250, 420, 580, 750]
  floors.forEach((f, fi) => {
    const mk = (kind: MapNode['kind'], x: number, y: number, label: string, extra: Partial<MapNode> = {}) => {
      const n: MapNode = { id: uid('n'), floorId: f.id, kind, x, y, label, ...extra }
      nodes.push(n)
      return n
    }
    const sa = mk('stair', 90, 330, 'A', { stairKey: 'A', widthM: 1.5 })
    const sb = mk('stair', 910, 330, 'B', { stairKey: 'B', widthM: 1.2 })
    const js = xs.map((x, i) => mk('junction', x, 330, `C${i + 1}`))
    link(sa, js[0])
    for (let i = 0; i + 1 < js.length; i++) link(js[i], js[i + 1])
    link(js[3], sb)
    const list = rooms[fi]
    // top row over junctions 0,1,3 ; bottom row over 0,2,3 → uneven like real buildings
    const slots: [number, number][] = [[0, 190], [1, 190], [3, 190], [0, 470], [2, 470], [3, 470]]
    list.forEach(([label, head], i) => {
      const [j, y] = slots[i]
      const r = mk('room', xs[j] + (y < 330 ? -40 : 40), y, label, { headcount: head })
      link(r, js[j])
    })
    if (fi === 0) {
      const gate1 = mk('exit', 90, 560, 'Main gate', { widthM: 2.4 })
      const gate2 = mk('exit', 910, 560, 'Side gate', { widthM: 1.5 })
      const ground = mk('assembly', 500, 600, 'Playground')
      link(sa, gate1)
      link(sb, gate2)
      link(gate1, ground)
      link(gate2, ground)
    }
  })
  return {
    id: uid('s'),
    name: 'Demo Public School',
    floors,
    nodes,
    edges,
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: Date.now(),
  }
}
