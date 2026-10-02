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

app.get('/api/schools', wrap(async (_req, res) => res.json(await store.listSchools())))
app.get('/api/schools/:id', wrap(async (req, res) => {
  const s = await store.getSchool(req.params.id)
  if (!s) return res.status(404).send('No such school')
  res.json(s)
}))
app.put('/api/schools/:id', wrap(async (req, res) => {
  const s = req.body
  if (!SAFE.test(req.params.id) || s?.id !== req.params.id || !Array.isArray(s.nodes) || !Array.isArray(s.edges) || !Array.isArray(s.floors))
    return res.status(400).send('Bad school')
  s.updatedAt = Date.now()
  await store.putSchool(s)
  res.json({ ok: true, updatedAt: s.updatedAt })
}))
app.delete('/api/schools/:id', wrap(async (req, res) => {
  if (!SAFE.test(req.params.id)) return res.status(400).end()
  await store.deleteSchool(req.params.id)
  res.json({ ok: true })
}))
app.get('/api/schools/:id/drills', wrap(async (req, res) => res.json(await store.listDrills(req.params.id))))

app.post('/api/drills', wrap(async (req, res) => {
  const { schoolId, expected, assembly } = req.body || {}
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
  res.json({ ...d, now: Date.now() })
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
  const { type, roomId, at, present } = req.body || {}
  if (!TYPES.has(type) || !d.expected[roomId]) return res.status(400).send('Bad event')
  if (!d.startedAt) return res.status(409).send('The drill has not started')
  const now = Date.now()
  // a tap queued offline carries the phone's estimate of server time; trust it only inside the drill window
  const stamp = typeof at === 'number' && at >= d.startedAt && at <= now + 2000 ? Math.round(Math.min(at, now)) : now
  const ev = { id: Math.random().toString(36).slice(2, 12), type, roomId, at: stamp }
  if (type === 'headcount') {
    const n = Number(present)
    if (!Number.isFinite(n) || n < 0 || n > 500) return res.status(400).send('Bad headcount')
    ev.present = Math.round(n)
  }
  await store.addEvent(code, ev)
  res.json(ev)
}))

app.post('/api/drills/:code/:action', wrap(async (req, res, next) => {
  const a = req.params.action
  if (!['start', 'end', 'reset'].includes(a)) return next()
  const code = codeOf(req)
  if (!(await store.getDrill(code))) return res.status(404).send('No such drill')
  const now = Date.now()
  await store.setTimes(code, a === 'start' ? { startedAt: now } : a === 'end' ? { endedAt: now } : { reset: true })
  res.json({ ...(await store.getDrill(code)), now: Date.now() })
}))

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).send(err.status ? err.message : 'Server error')
})
