import type { Drill } from './types'
import { fmt } from './graph'

export interface ClassRow {
  roomId: string
  label: string
  floor: string
  via: string
  stairKey?: string
  headcount: number
  leftSec?: number
  arrivedSec?: number
  tookSec?: number
  expectedSec: number
  deltaSec?: number
  present?: number
}

export interface Finding {
  level: 'bad' | 'warn' | 'good'
  title: string
  detail: string
  action?: string
}

export function classRows(d: Drill): ClassRow[] {
  const start = d.startedAt
  const rows: ClassRow[] = []
  for (const [roomId, ex] of Object.entries(d.expected)) {
    const evs = d.events.filter((e) => e.roomId === roomId)
    const last = (t: string) => [...evs].reverse().find((e) => e.type === t)
    const left = last('left')
    const arrived = last('arrived')
    const head = last('headcount')
    const leftSec = start && left ? (left.at - start) / 1000 : undefined
    const arrivedSec = start && arrived ? (arrived.at - start) / 1000 : undefined
    rows.push({
      roomId,
      label: ex.label,
      floor: ex.floor,
      via: ex.via,
      stairKey: ex.stairKey,
      headcount: ex.headcount,
      leftSec,
      arrivedSec,
      tookSec: arrivedSec,
      expectedSec: ex.sec,
      deltaSec: arrivedSec != null ? arrivedSec - ex.sec : undefined,
      present: head?.present,
    })
  }
  return rows.sort((a, b) => (a.arrivedSec ?? Infinity) - (b.arrivedSec ?? Infinity))
}

export function analyse(d: Drill, targetSec: number, reactionSec: number, previousTotal?: number) {
  const rows = classRows(d)
  const findings: Finding[] = []
  const arrived = rows.filter((r) => r.arrivedSec != null)
  const totalSec = arrived.length ? Math.max(...arrived.map((r) => r.arrivedSec!)) : undefined
  const plannedTotal = rows.length ? Math.max(...rows.map((r) => r.expectedSec)) : 0

  const silent = rows.filter((r) => r.arrivedSec == null)
  if (silent.length)
    findings.push({
      level: 'bad',
      title: `${silent.length} class${silent.length > 1 ? 'es' : ''} never reported reaching the assembly point`,
      detail: silent.map((r) => r.label).join(', '),
      action: 'Before the next drill, confirm one monitor per class has the join link open.',
    })

  const missing = rows.filter((r) => r.present != null && r.present < r.headcount)
  if (missing.length) {
    const n = missing.reduce((a, r) => a + (r.headcount - (r.present || 0)), 0)
    findings.push({
      level: 'bad',
      title: `${n} ${n === 1 ? 'person' : 'people'} not counted at the assembly point`,
      detail: missing.map((r) => `${r.label}: ${r.present} of ${r.headcount}`).join(' · '),
      action: 'Check the attendance register for these classes: absent today, or left behind?',
    })
  }

  const late = rows.filter((r) => r.leftSec != null && r.leftSec > reactionSec + 30)
  if (late.length)
    findings.push({
      level: 'warn',
      title: `Slow to leave the room: ${late.map((r) => r.label).join(', ')}`,
      detail: late.map((r) => `${r.label} left ${fmt(r.leftSec!)} after the alarm`).join(' · '),
      action: 'Practise the first 30 seconds with these classes: teacher at the door, bags stay behind.',
    })

  // staircase jam: two or more classes on the same stair each overran their planned time
  const byStair = new Map<string, ClassRow[]>()
  for (const r of rows) if (r.stairKey && r.deltaSec != null) byStair.set(r.stairKey, [...(byStair.get(r.stairKey) || []), r])
  const jams = [...byStair.entries()]
    .map(([k, list]) => {
      const over = list.filter((r) => r.deltaSec! > 20 && r.deltaSec! > r.expectedSec * 0.25)
      const avg = over.length ? over.reduce((a, r) => a + r.deltaSec!, 0) / over.length : 0
      return { k, list, over, avg }
    })
    .filter((x) => x.over.length >= 2)
    .sort((a, b) => b.avg - a.avg)
  for (const jam of jams) {
    const otherStairs = [...byStair.keys()].filter((k) => k !== jam.k)
    findings.push({
      level: 'bad',
      title: `Staircase ${jam.k} likely jammed`,
      detail: `${jam.over.map((r) => r.label).join(', ')} each took about ${fmt(jam.avg)} longer than planned on this staircase.`,
      action: otherStairs.length
        ? `Move one of these classes to Staircase ${otherStairs[0]} in the Plan tab, or send them down in the planned order and hold the rest at the landing.`
        : 'Send classes down in the planned order and hold the rest at the landing until the one ahead has cleared.',
    })
  }

  const slow = rows.filter(
    (r) => r.deltaSec != null && r.deltaSec > 20 && r.deltaSec > r.expectedSec * 0.25 && !jams.some((j) => j.over.includes(r)) && !late.includes(r),
  )
  if (slow.length)
    findings.push({
      level: 'warn',
      title: `Slower than planned: ${slow.map((r) => r.label).join(', ')}`,
      detail: slow.map((r) => `${r.label}: ${fmt(r.arrivedSec!)} vs ${fmt(r.expectedSec)} planned`).join(' · '),
      action: 'Walk this route with the class teacher once: look for locked doors, furniture or a missed turn.',
    })

  if (totalSec != null && silent.length) {
    findings.push({
      level: 'warn',
      title: `Not a complete drill: ${arrived.length} of ${rows.length} classes reported`,
      detail: `The last class that did report arrived at ${fmt(totalSec)}. The whole-school time cannot be known until every class reports.`,
    })
  } else if (totalSec != null) {
    if (totalSec <= targetSec)
      findings.push({ level: 'good', title: `Whole school out in ${fmt(totalSec)}`, detail: `Inside the school's target of ${fmt(targetSec)}.` })
    else
      findings.push({
        level: 'warn',
        title: `Whole school out in ${fmt(totalSec)}`,
        detail: `${fmt(totalSec - targetSec)} over the school's target of ${fmt(targetSec)}.`,
      })
    if (previousTotal != null) {
      const diff = totalSec - previousTotal
      findings.push({
        level: diff <= 0 ? 'good' : 'warn',
        title: diff <= 0 ? `${fmt(-diff)} faster than the last drill` : `${fmt(diff)} slower than the last drill`,
        detail: `Last drill: ${fmt(previousTotal)}.`,
      })
    }
  }
  return { rows, findings, totalSec: silent.length ? undefined : totalSec, lastSec: totalSec, complete: !silent.length, plannedTotal }
}
