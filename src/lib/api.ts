import type { Drill, DrillEvent, School } from './types'

const LS = 'drillmap:schools'

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.text()) || res.statusText)
  return res.json() as Promise<T>
}

function localAll(): Record<string, School> {
  try {
    return JSON.parse(localStorage.getItem(LS) || '{}')
  } catch {
    return {}
  }
}
function localPut(s: School) {
  try {
    const all = localAll()
    all[s.id] = s
    localStorage.setItem(LS, JSON.stringify(all))
  } catch {
    /* storage full or blocked: server copy still exists */
  }
}

export async function listSchools(): Promise<{ id: string; name: string; updatedAt: number }[]> {
  try {
    return await j(await fetch('/api/schools'))
  } catch {
    return Object.values(localAll()).map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt }))
  }
}

export async function getSchool(id: string): Promise<School> {
  try {
    const s = await j<School>(await fetch(`/api/schools/${id}`))
    localPut(s)
    return s
  } catch (e) {
    const s = localAll()[id]
    if (s) return s
    throw e
  }
}

export async function saveSchool(s: School): Promise<void> {
  s.updatedAt = Date.now()
  localPut(s)
  await j(await fetch(`/api/schools/${s.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) }))
}

export async function deleteSchool(id: string): Promise<void> {
  const all = localAll()
  delete all[id]
  localStorage.setItem(LS, JSON.stringify(all))
  await fetch(`/api/schools/${id}`, { method: 'DELETE' })
}

export async function createDrill(schoolId: string, expected: Drill['expected'], assembly: string): Promise<Drill> {
  return j(await fetch('/api/drills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schoolId, expected, assembly }) }))
}

export async function ping(code: string, roomId: string): Promise<void> {
  await fetch(`/api/drills/${code}/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomId }) })
}

export async function listDrills(schoolId: string): Promise<Drill[]> {
  return j(await fetch(`/api/schools/${schoolId}/drills`))
}

export async function getDrill(code: string): Promise<Drill & { now: number }> {
  return j(await fetch(`/api/drills/${code}`))
}

export async function drillAction(code: string, action: 'start' | 'end' | 'reset'): Promise<Drill> {
  return j(await fetch(`/api/drills/${code}/${action}`, { method: 'POST' }))
}

export async function postEvent(code: string, ev: Omit<DrillEvent, 'id' | 'at'> & { at?: number }): Promise<DrillEvent> {
  return j(await fetch(`/api/drills/${code}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) }))
}
