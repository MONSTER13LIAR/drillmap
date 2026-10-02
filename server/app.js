import crypto from 'node:crypto'
import express from 'express'
import { makeStore } from './store.js'

const SAFE = /^[A-Za-z0-9_-]{1,64}$/
const TYPES = new Set(['left', 'arrived', 'headcount'])
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const store = makeStore()

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const codeOf = (req) => String(req.params.code || '').toUpperCase()

export const app = express()
app.use(express.json({ limit: '4mb' }))
app.use((req, res, next) => {
  res.set('cache-control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => res.json({ ok: true, now: Date.now(), storage: store.kind }))

// Privacy: each school has a secret edit key, made here when the school is first saved and kept only as a hash.
// Every read or change of a school, its drill list, and the coordinator's view of a drill needs that key.
// Monitors' phones need only the 5-letter drill code and see only the class list and their own class's taps.
export const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex')
export const newKey = () => crypto.randomBytes(24).toString('base64url')
const keyOf = (req) => String(req.get('x-edit-key') || '')
async function keyOk(schoolId, key) {
  if (!key || !SAFE.test(String(schoolId || ''))) return false
  const h = await store.keyHash(schoolId)
  if (!h) return false // no such school, or an old school that was never given a key
  const a = Buffer.from(h, 'hex')
  const b = Buffer.from(hashKey(key), 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
// the same answer for "no such school" and "wrong key", so ids cannot be probed
const guard = (fn) => wrap(async (req, res, next) => {
  if (!(await keyOk(req.params.id, keyOf(req)))) return res.status(403).send('This school needs its private edit link')
  return fn(req, res, next)
})

// the schools this browser holds keys for: [{ id, key }] in, [{ id, name, updatedAt }] out
app.post('/api/schools/mine', wrap(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 100) : []
  const out = []
  for (const it of items) {
    if (!(await keyOk(it?.id, it?.key))) continue
    const s = await store.getSchool(it.id)
    if (s) out.push({ id: s.id, name: s.name, updatedAt: s.updatedAt })
  }
  res.json(out)
}))
app.get('/api/schools/:id', guard(async (req, res) => res.json(await store.getSchool(req.params.id))))
app.put('/api/schools/:id', wrap(async (req, res) => {
  const s = req.body
  if (!SAFE.test(req.params.id) || s?.id !== req.params.id || !Array.isArray(s.nodes) || !Array.isArray(s.edges) || !Array.isArray(s.floors))
    return res.status(400).send('Bad school')
  s.updatedAt = Date.now()
  if ((await store.keyHash(s.id)) === null) {
    // a new school: make its key and hand it back once
    const key = newKey()
    if (await store.createSchool(s, hashKey(key))) return res.json({ ok: true, updatedAt: s.updatedAt, key })
  }
  if (!(await keyOk(s.id, keyOf(req)))) return res.status(403).send('This school needs its private edit link')
  await store.putSchool(s)
  res.json({ ok: true, updatedAt: s.updatedAt })
}))
app.delete('/api/schools/:id', guard(async (req, res) => {
  await store.deleteSchool(req.params.id)
  res.json({ ok: true })
}))
app.get('/api/schools/:id/drills', guard(async (req, res) => res.json(await store.listDrills(req.params.id))))

app.post('/api/drills', wrap(async (req, res) => {
  const { schoolId, expected, assembly } = req.body || {}
  if (!(await keyOk(schoolId, keyOf(req)))) return res.status(403).send('This school needs its private edit link')
  const s = await store.getSchool(schoolId)
  if (!s) return res.status(404).send('No such school')
  if (!expected || typeof expected !== 'object' || !Object.keys(expected).length) return res.status(400).send('Plan has no classes')
  for (let tries = 0; tries < 8; tries++) {
    let code = ''
    for (let i = 0; i < 5; i++) code += ALPHA[Math.floor(Math.random() * ALPHA.length)]
    const d = { code, schoolId, schoolName: s.name, assembly: String(assembly || ''), createdAt: Date.now(), events: [], presence: {}, expected }
    if (await store.createDrill(d)) return res.json(d)
  }
  res.status(503).send('Try again')
}))

app.get('/api/drills/:code', wrap(async (req, res) => {
  const d = await store.getDrill(codeOf(req))
  if (!d) return res.status(404).send('No such drill')
  if (await keyOk(d.schoolId, keyOf(req))) return res.json({ ...d, full: true, now: Date.now() })
  // a monitor's view: the class list and routes, and only the taps of the class asked for
  const room = String(req.query.room || '')
  res.json({
    code: d.code, schoolId: d.schoolId, schoolName: d.schoolName, assembly: d.assembly, createdAt: d.createdAt, startedAt: d.startedAt, endedAt: d.endedAt,
    expected: d.expected, events: room ? d.events.filter((e) => e.roomId === room) : [], presence: {}, full: false, now: Date.now(),
  })
}))

app.post('/api/drills/:code/presence', wrap(async (req, res) => {
  const code = codeOf(req)
  const d = await store.getDrill(code)
  if (!d) return res.status(404).send('No such drill')
  if (!d.expected[req.body?.roomId]) return res.status(400).send('Unknown class')
  await store.touch(code, req.body.roomId, Date.now())
  res.json({ ok: true })
}))

app.post('/api/drills/:code/events', wrap(async (req, res) => {
  const code = codeOf(req)
  const d = await store.getDrill(code)
  if (!d) return res.status(404).send('No such drill')
  const { type, roomId, at, present, by } = req.body || {}
  if (!TYPES.has(type) || !d.expected[roomId]) return res.status(400).send('Bad event')
  if (!d.startedAt) return res.status(409).send('The drill has not started')
  const now = Date.now()
  // a tap queued offline carries the phone's estimate of server time; trust it only inside the drill window
  const stamp = typeof at === 'number' && at >= d.startedAt && at <= now + 2000 ? Math.round(Math.min(at, now)) : now
  const ev = { id: Math.random().toString(36).slice(2, 12), type, roomId, at: stamp, ...(by === 'coordinator' && (await keyOk(d.schoolId, keyOf(req))) ? { by } : {}) }
  if (type === 'headcount') {
    const n = Number(present)
    if (!Number.isFinite(n) || n < 0 || n > 500) return res.status(400).send('Bad headcount')
    ev.present = Math.round(n)
  }
  await store.addEvent(code, ev)
  res.json(ev)
}))

// take back the latest step of one class (a mistaken tap), from the monitor's phone or the coordinator
app.post('/api/drills/:code/undo', wrap(async (req, res) => {
  const code = codeOf(req)
  const d = await store.getDrill(code)
  if (!d) return res.status(404).send('No such drill')
  if (!d.expected[req.body?.roomId]) return res.status(400).send('Unknown class')
  if (d.endedAt) return res.status(409).send('The drill has ended')
  res.json({ removed: await store.undoLast(code, req.body.roomId) })
}))

app.post('/api/drills/:code/:action', wrap(async (req, res, next) => {
  const a = req.params.action
  if (!['start', 'end', 'reset'].includes(a)) return next()
  const code = codeOf(req)
  const d = await store.getDrill(code)
  if (!d) return res.status(404).send('No such drill')
  if (!(await keyOk(d.schoolId, keyOf(req)))) return res.status(403).send('Only the coordinator can do that')
  const now = Date.now()
  await store.setTimes(code, a === 'start' ? { startedAt: now } : a === 'end' ? { endedAt: now } : { reset: true })
  res.json({ ...(await store.getDrill(code)), full: true, now: Date.now() })
}))

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).send(err.status ? err.message : 'Server error')
})
