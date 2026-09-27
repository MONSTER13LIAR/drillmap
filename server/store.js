// Storage behind one interface: Postgres (Neon) when DATABASE_URL is set, JSON files otherwise.
import fs from 'node:fs'
import path from 'node:path'

const SCHEMA = [
  `create table if not exists schools (id text primary key, data jsonb not null, updated_at bigint not null)`,
  `create table if not exists drills (code text primary key, school_id text not null, data jsonb not null, created_at bigint not null, started_at bigint, ended_at bigint)`,
  `create index if not exists drills_school on drills (school_id)`,
  `create table if not exists drill_events (id text primary key, code text not null, type text not null, room_id text not null, at bigint not null, present int)`,
  `create unique index if not exists drill_events_once on drill_events (code, room_id, type) where type <> 'headcount'`,
  `create table if not exists drill_presence (code text not null, room_id text not null, seen_at bigint not null, primary key (code, room_id))`,
]

function pgStore(url) {
  let sqlP
  let ready
  const sql = async () => {
    if (!sqlP) sqlP = import('@neondatabase/serverless').then((m) => m.neon(url))
    const q = await sqlP
    if (!ready) ready = (async () => { for (const s of SCHEMA) await q.query(s) })()
    await ready
    return q
  }
  const assemble = async (q, row) => {
    if (!row) return null
    const events = await q.query(`select id, type, room_id, at, present from drill_events where code = $1 order by at, id`, [row.code])
    const pres = await q.query(`select room_id, seen_at from drill_presence where code = $1`, [row.code])
    return {
      ...row.data,
      code: row.code,
      schoolId: row.school_id,
      createdAt: Number(row.created_at),
      startedAt: row.started_at == null ? undefined : Number(row.started_at),
      endedAt: row.ended_at == null ? undefined : Number(row.ended_at),
      events: events.map((e) => ({ id: e.id, type: e.type, roomId: e.room_id, at: Number(e.at), ...(e.present == null ? {} : { present: e.present }) })),
      presence: Object.fromEntries(pres.map((p) => [p.room_id, Number(p.seen_at)])),
    }
  }
  return {
    async listSchools() {
      const q = await sql()
      const rows = await q.query(`select id, data->>'name' as name, updated_at from schools order by updated_at desc`)
      return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: Number(r.updated_at) }))
    },
    async getSchool(id) {
      const q = await sql()
      const rows = await q.query(`select data from schools where id = $1`, [id])
      return rows[0]?.data || null
    },
    async putSchool(s) {
      const q = await sql()
      await q.query(`insert into schools (id, data, updated_at) values ($1, $2, $3) on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at`, [s.id, JSON.stringify(s), s.updatedAt])
    },
    async deleteSchool(id) {
      const q = await sql()
      await q.query(`delete from schools where id = $1`, [id])
    },
    async createDrill(d) {
      const q = await sql()
      const { code, schoolId, createdAt, events, presence, startedAt, endedAt, ...data } = d
      const r = await q.query(`insert into drills (code, school_id, data, created_at) values ($1, $2, $3, $4) on conflict do nothing returning code`, [code, schoolId, JSON.stringify(data), createdAt])
      return r.length > 0
    },
    async getDrill(code) {
      const q = await sql()
      const rows = await q.query(`select * from drills where code = $1`, [code])
      return assemble(q, rows[0])
    },
    async listDrills(schoolId) {
      const q = await sql()
      const rows = await q.query(`select * from drills where school_id = $1 order by created_at desc limit 50`, [schoolId])
      return Promise.all(rows.map((r) => assemble(q, r)))
    },
    async setTimes(code, patch) {
      const q = await sql()
      if (patch.reset) {
        await q.query(`update drills set started_at = null, ended_at = null where code = $1`, [code])
        await q.query(`delete from drill_events where code = $1`, [code])
        return
      }
      if (patch.startedAt) await q.query(`update drills set started_at = $2 where code = $1 and started_at is null`, [code, patch.startedAt])
      if (patch.endedAt) await q.query(`update drills set ended_at = $2 where code = $1 and ended_at is null and started_at is not null`, [code, patch.endedAt])
    },
    async addEvent(code, ev) {
      const q = await sql()
      // the unique index keeps only the first left / arrived tap per class
      await q.query(`insert into drill_events (id, code, type, room_id, at, present) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`, [ev.id, code, ev.type, ev.roomId, ev.at, ev.present ?? null])
    },
    async touch(code, roomId, at) {
      const q = await sql()
      await q.query(`insert into drill_presence (code, room_id, seen_at) values ($1, $2, $3) on conflict (code, room_id) do update set seen_at = excluded.seen_at`, [code, roomId, at])
    },
  }
}

function fileStore(dir) {
  fs.mkdirSync(path.join(dir, 'schools'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'drills'), { recursive: true })
  const read = (sub, id) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, sub, `${id}.json`), 'utf8')) } catch { return null }
  }
  const write = (sub, id, obj) => {
    const f = path.join(dir, sub, `${id}.json`)
    fs.writeFileSync(f + '.tmp', JSON.stringify(obj))
    fs.renameSync(f + '.tmp', f)
  }
  const all = (sub) => fs.readdirSync(path.join(dir, sub)).filter((f) => f.endsWith('.json')).map((f) => read(sub, f.slice(0, -5))).filter(Boolean)
  return {
    async listSchools() { return all('schools').map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt })) },
    async getSchool(id) { return read('schools', id) },
    async putSchool(s) { write('schools', s.id, s) },
    async deleteSchool(id) { fs.rmSync(path.join(dir, 'schools', `${id}.json`), { force: true }) },
    async createDrill(d) { if (read('drills', d.code)) return false; write('drills', d.code, d); return true },
    async getDrill(code) { return read('drills', code) },
    async listDrills(schoolId) { return all('drills').filter((d) => d.schoolId === schoolId).sort((a, b) => b.createdAt - a.createdAt) },
    async setTimes(code, patch) {
      const d = read('drills', code)
      if (!d) return
      if (patch.reset) { delete d.startedAt; delete d.endedAt; d.events = [] }
      if (patch.startedAt && !d.startedAt) d.startedAt = patch.startedAt
      if (patch.endedAt && d.startedAt && !d.endedAt) d.endedAt = patch.endedAt
      write('drills', code, d)
    },
    async addEvent(code, ev) {
      const d = read('drills', code)
      if (!d) return
      if (ev.type !== 'headcount' && d.events.some((e) => e.roomId === ev.roomId && e.type === ev.type)) return
      d.events.push(ev)
      write('drills', code, d)
    },
    async touch(code, roomId, at) {
      const d = read('drills', code)
      if (!d) return
      d.presence = { ...(d.presence || {}), [roomId]: at }
      write('drills', code, d)
    },
  }
}

export function makeStore() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (url) return pgStore(url)
  if (process.env.VERCEL) {
    // serverless disks are read-only and wiped between requests: refuse rather than lose a drill
    const fail = async () => { throw Object.assign(new Error('Database not connected'), { status: 503 }) }
    return new Proxy({}, { get: () => fail })
  }
  return fileStore(process.env.DATA_DIR || path.join(process.cwd(), 'data'))
}
