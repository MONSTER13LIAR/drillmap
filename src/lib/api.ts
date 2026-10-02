import type { Drill, DrillEvent, School } from './types'

const LS = 'drillmap:schools'
const KEYS = 'drillmap:keys'

// The secret edit key of each school made in (or opened with a private link on) this browser.
export function keys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEYS) || '{}')
  } catch {
    return {}
  }
}
export function keyFor(id: string): string | undefined {
  return keys()[id]
}
export function rememberKey(id: string, key: string) {
  try {
    localStorage.setItem(KEYS, JSON.stringify({ ...keys(), [id]: key }))
  } catch {
    /* blocked */
  }
}
function forgetKey(id: string) {
  const k = keys()
  delete k[id]
  try { localStorage.setItem(KEYS, JSON.stringify(k)) } catch { /* blocked */ }
}
// the link that opens a school on another device; everything after # stays in the browser
export function privateLink(id: string): string | null {
  const k = keyFor(id)
  return k ? `${location.origin}/#/s/${id}/map?k=${k}` : null
}
const auth = (id: string | undefined, extra: Record<string, string> = {}): Record<string, string> => {
  const k = id ? keyFor(id) : undefined
  return k ? { ...extra, 'x-edit-key': k } : extra
}

// Does this server keep shared data? Without it, schools live in this browser only and live drills are off.
let storageP: Promise<boolean> | null = null
export function serverStorage(): Promise<boolean> {
  if (!storageP)
    storageP = fetch('/api/health')
      .then((r) => r.json())
      .then((h) => h.storage !== 'none')
      .catch(() => true) // unreachable is a network problem, not a missing database: keep trying the server
  return storageP
}

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
    if (!(await serverStorage())) throw new Error('local')
    const items = Object.entries(keys()).map(([id, key]) => ({ id, key }))
    if (!items.length) return []
    return await j(await fetch('/api/schools/mine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) }))
  } catch (e) {
    const local = Object.values(localAll())
    // on a server with a database, list only what this browser holds a key for
    const mine = (e as Error)?.message === 'local' ? local : local.filter((s) => keyFor(s.id))
    return mine.map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt }))
  }
}

export async function getSchool(id: string): Promise<School> {
  try {
    if (!(await serverStorage())) throw new Error('local')
    const s = await j<School>(await fetch(`/api/schools/${id}`, { headers: auth(id) }))
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
  if (!(await serverStorage())) throw new Error('local')
  const r = await j<{ key?: string }>(await fetch(`/api/schools/${s.id}`, { method: 'PUT', headers: auth(s.id, { 'content-type': 'application/json' }), body: JSON.stringify(s) }))
  if (r.key) rememberKey(s.id, r.key)
}

export async function deleteSchool(id: string): Promise<void> {
  const all = localAll()
  delete all[id]
  try { localStorage.setItem(LS, JSON.stringify(all)) } catch { /* blocked */ }
  if (!(await serverStorage())) return forgetKey(id)
  await fetch(`/api/schools/${id}`, { method: 'DELETE', headers: auth(id) })
  forgetKey(id)
}

export async function createDrill(schoolId: string, expected: Drill['expected'], assembly: string): Promise<Drill> {
  return j(await fetch('/api/drills', { method: 'POST', headers: auth(schoolId, { 'content-type': 'application/json' }), body: JSON.stringify({ schoolId, expected, assembly }) }))
}

export async function ping(code: string, roomId: string): Promise<void> {
  await fetch(`/api/drills/${code}/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomId }) })
}

export async function listDrills(schoolId: string): Promise<Drill[]> {
  if (!(await serverStorage())) return []
  return j(await fetch(`/api/schools/${schoolId}/drills`, { headers: auth(schoolId) }))
}

// which school each drill belongs to, so the coordinator's key goes with every later request
const drillSchool: Record<string, string> = {}
export type DrillView = Drill & { now: number; full: boolean }

// with this school's key: the whole drill; without: the monitor's view (class list, and the taps of `room` only)
export async function getDrill(code: string, room?: string): Promise<DrillView> {
  const q = room ? `?room=${encodeURIComponent(room)}` : ''
  let d = await j<DrillView>(await fetch(`/api/drills/${code}${q}`, { headers: auth(drillSchool[code]) }))
  if (!drillSchool[code]) {
    drillSchool[code] = d.schoolId
    if (!d.full && keyFor(d.schoolId)) d = await j<DrillView>(await fetch(`/api/drills/${code}${q}`, { headers: auth(d.schoolId) }))
  }
  return d
}

export async function drillAction(code: string, action: 'start' | 'end' | 'reset'): Promise<DrillView> {
  return j(await fetch(`/api/drills/${code}/${action}`, { method: 'POST', headers: auth(drillSchool[code]) }))
}

export async function postEvent(code: string, ev: Omit<DrillEvent, 'id' | 'at'> & { at?: number }): Promise<DrillEvent> {
  return j(await fetch(`/api/drills/${code}/events`, { method: 'POST', headers: auth(drillSchool[code], { 'content-type': 'application/json' }), body: JSON.stringify(ev) }))
}

export async function undoLast(code: string, roomId: string): Promise<{ removed: { id: string; type: string } | null }> {
  return j(await fetch(`/api/drills/${code}/undo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomId }) }))
}
