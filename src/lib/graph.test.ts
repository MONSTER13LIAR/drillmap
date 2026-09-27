import { expect, test } from 'vitest'
import { demoSchool } from './demo'
import { buildLinks, candidateRoutes, fmt, optimise, simulate, validate } from './graph'
import { analyse } from './report'
import type { Drill } from './types'

test('demo school is complete and every class has a route', () => {
  const s = demoSchool()
  const checks = validate(s)
  expect(checks.filter((c) => c.level === 'error')).toEqual([])
  const sim = simulate(s)
  expect(sim.unreachable).toEqual([])
  expect(sim.groups.length).toBe(18)
})

test('stairs join adjacent floors only', () => {
  const s = demoSchool()
  const stairs = buildLinks(s).filter((l) => l.isStair)
  expect(stairs.length).toBe(4) // A: G-1, 1-2 ; B: G-1, 1-2
})

test('upstairs rooms get a choice of staircase', () => {
  const s = demoSchool()
  const r = s.nodes.find((n) => n.label === '10A')!
  const c = candidateRoutes(s, r.id)
  const keys = new Set(c.flatMap((x) => x.stairKeys))
  expect(keys.has('A') && keys.has('B')).toBe(true)
})

test('queueing is exact: one group alone never waits', () => {
  const s = demoSchool()
  const keep = s.nodes.find((n) => n.label === '6A')!
  s.nodes.forEach((n) => { if (n.kind === 'room' && n.id !== keep.id) n.headcount = 0 })
  const sim = simulate(s)
  expect(sim.groups.length).toBe(1)
  expect(sim.groups[0].waitSec).toBe(0)
})

test('optimiser never makes it worse', () => {
  const s = demoSchool()
  const { before, after } = optimise(s)
  console.log('before', fmt(before.totalSec), 'after', fmt(after.totalSec))
  for (const [k, v] of Object.entries(after.stairOrder)) console.log('stair', k, v.join(' > '))
  expect(after.totalSec).toBeLessThanOrEqual(before.totalSec)
})

test('report finds a jammed staircase and missing heads', () => {
  const s = demoSchool()
  const sim = simulate(s)
  const expected: Drill['expected'] = {}
  for (const g of sim.groups) expected[g.roomId] = { sec: g.doneSec, via: g.route.summary, stairKey: g.route.stairKeys[0], label: g.label, headcount: g.headcount, floor: '' }
  const t0 = 1_000_000
  const d: Drill = { code: 'X', schoolId: s.id, schoolName: s.name, createdAt: t0, startedAt: t0, events: [], expected }
  let i = 0
  for (const g of sim.groups) {
    const extra = g.route.stairKeys[0] === 'B' ? 90 : 0
    d.events.push({ id: String(i++), type: 'left', roomId: g.roomId, at: t0 + 20_000 })
    d.events.push({ id: String(i++), type: 'arrived', roomId: g.roomId, at: t0 + (g.doneSec + extra) * 1000 })
    d.events.push({ id: String(i++), type: 'headcount', roomId: g.roomId, at: t0 + (g.doneSec + extra + 30) * 1000, present: g.label === '9A' ? g.headcount - 2 : g.headcount })
  }
  const { findings } = analyse(d, 180, 20)
  const titles = findings.map((f) => f.title)
  console.log(titles)
  expect(titles.some((t) => t.includes('Staircase B likely jammed'))).toBe(true)
  expect(titles.some((t) => t.startsWith('2 people not counted'))).toBe(true)
})
