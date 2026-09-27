import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DATA = process.env.DATA_DIR || path.join(root, 'data')
const PORT = Number(process.env.PORT || 8787)
fs.mkdirSync(path.join(DATA, 'schools'), { recursive: true })
fs.mkdirSync(path.join(DATA, 'drills'), { recursive: true })

const SAFE = /^[A-Za-z0-9_-]{1,64}$/
const schools = new Map()
const drills = new Map()
for (const f of fs.readdirSync(path.join(DATA, 'schools'))) {
  try { const s = JSON.parse(fs.readFileSync(path.join(DATA, 'schools', f), 'utf8')); schools.set(s.id, s) } catch { /* skip broken file */ }
}
for (const f of fs.readdirSync(path.join(DATA, 'drills'))) {
  try { const d = JSON.parse(fs.readFileSync(path.join(DATA, 'drills', f), 'utf8')); drills.set(d.code, d) } catch { /* skip broken file */ }
}

function writeJson(dir, id, obj) {
  const file = path.join(DATA, dir, `${id}.json`)
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(obj))
  fs.renameSync(tmp, file)
}

// live subscribers per drill code
const subs = new Map()
function publish(d) {
  writeJson('drills', d.code, d)
  const frame = `data: ${JSON.stringify({ ...d, now: Date.now() })}\n\n`
  for (const res of subs.get(d.code) || []) res.write(frame)
}

const app = express()
app.use(express.json({ limit: '20mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true, now: Date.now() }))

app.get('/api/schools', (_req, res) => {
  res.json([...schools.values()].map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt })))
})
app.get('/api/schools/:id', (req, res) => {
  const s = schools.get(req.params.id)
  if (!s) return res.status(404).send('No such school')
  res.json(s)
})
app.put('/api/schools/:id', (req, res) => {
  const s = req.body
  if (!SAFE.test(req.params.id) || s?.id !== req.params.id || !Array.isArray(s.nodes) || !Array.isArray(s.edges) || !Array.isArray(s.floors))
    return res.status(400).send('Bad school')
  s.updatedAt = Date.now()
  schools.set(s.id, s)
  writeJson('schools', s.id, s)
  res.json({ ok: true, updatedAt: s.updatedAt })
})
app.delete('/api/schools/:id', (req, res) => {
  if (!SAFE.test(req.params.id)) return res.status(400).end()
  schools.delete(req.params.id)
  fs.rmSync(path.join(DATA, 'schools', `${req.params.id}.json`), { force: true })
  res.json({ ok: true })
})
app.get('/api/schools/:id/drills', (req, res) => {
  res.json([...drills.values()].filter((d) => d.schoolId === req.params.id).sort((a, b) => b.createdAt - a.createdAt))
})

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function newCode() {
  for (;;) {
    let c = ''
    for (let i = 0; i < 5; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]
    if (!drills.has(c)) return c
  }
}

app.post('/api/drills', (req, res) => {
  const { schoolId, expected, assembly } = req.body || {}
  const s = schools.get(schoolId)
  if (!s) return res.status(404).send('No such school')
  if (!expected || typeof expected !== 'object' || !Object.keys(expected).length) return res.status(400).send('Plan has no classes')
  const d = { code: newCode(), schoolId, schoolName: s.name, assembly: String(assembly || ''), createdAt: Date.now(), events: [], presence: {}, expected }
  drills.set(d.code, d)
  writeJson('drills', d.code, d)
  res.json(d)
})

const getD = (req, res) => {
  const d = drills.get(String(req.params.code).toUpperCase())
  if (!d) res.status(404).send('No such drill')
  return d
}

app.get('/api/drills/:code', (req, res) => {
  const d = getD(req, res)
  if (d) res.json({ ...d, now: Date.now() })
})

app.get('/api/drills/:code/stream', (req, res) => {
  const d = getD(req, res)
  if (!d) return
  res.set({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' })
  res.flushHeaders()
  res.write(`data: ${JSON.stringify({ ...d, now: Date.now() })}\n\n`)
  if (!subs.has(d.code)) subs.set(d.code, new Set())
  subs.get(d.code).add(res)
  const beat = setInterval(() => res.write(': beat\n\n'), 20000)
  req.on('close', () => {
    clearInterval(beat)
    subs.get(d.code)?.delete(res)
  })
})

app.post('/api/drills/:code/presence', (req, res) => {
  const d = getD(req, res)
  if (!d) return
  const roomId = req.body?.roomId
  if (!d.expected[roomId]) return res.status(400).send('Unknown class')
  const first = !d.presence?.[roomId]
  d.presence = { ...(d.presence || {}), [roomId]: Date.now() }
  if (first) publish(d)
  else writeJson('drills', d.code, d)
  res.json({ ok: true })
})

const TYPES = new Set(['left', 'arrived', 'headcount'])
app.post('/api/drills/:code/events', (req, res) => {
  const d = getD(req, res)
  if (!d) return
  const { type, roomId, at, present } = req.body || {}
  if (!TYPES.has(type) || !d.expected[roomId]) return res.status(400).send('Bad event')
  if (!d.startedAt) return res.status(409).send('The drill has not started')
  // same tap sent twice (retry after a dropped connection): keep the first
  if (type !== 'headcount' && d.events.some((e) => e.roomId === roomId && e.type === type)) return res.json(d.events.find((e) => e.roomId === roomId && e.type === type))
  const now = Date.now()
  // a tap queued offline carries the phone's estimate of server time; trust it only inside the drill window
  const stamp = typeof at === 'number' && at >= d.startedAt && at <= now + 2000 ? Math.min(at, now) : now
  const ev = { id: Math.random().toString(36).slice(2, 10), type, roomId, at: stamp }
  if (type === 'headcount') {
    const n = Number(present)
    if (!Number.isFinite(n) || n < 0 || n > 500) return res.status(400).send('Bad headcount')
    ev.present = Math.round(n)
  }
  d.events.push(ev)
  publish(d)
  res.json(ev)
})

app.post('/api/drills/:code/:action', (req, res, next) => {
  const a = req.params.action
  if (!['start', 'end', 'reset'].includes(a)) return next()
  const d = getD(req, res)
  if (!d) return
  if (a === 'start' && !d.startedAt) d.startedAt = Date.now()
  if (a === 'end' && d.startedAt && !d.endedAt) d.endedAt = Date.now()
  if (a === 'reset') { delete d.startedAt; delete d.endedAt; d.events = [] }
  publish(d)
  res.json(d)
})

const dist = path.join(root, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, () => console.log(`drillmap on :${PORT}`))
