// Storage behind one interface: Postgres (Neon) when DATABASE_URL is set, JSON files otherwise.
import fs from 'node:fs'
import path from 'node:path'

const SCHEMA = [
  `create table if not exists schools (id text primary key, data jsonb not null, updated_at bigint not null)`,
  `alter table schools add column if not exists key_hash text`,
  `create table if not exists drills (code text primary key, school_id text not null, data jsonb not null, created_at bigint not null, started_at bigint, ended_at bigint)`,
  `create index if not exists drills_school on drills (school_id)`,
  `create table if not exists drill_events (id text primary key, code text not null, type text not null, room_id text not null, at bigint not null, present int)`,
  `create unique index if not exists drill_events_once on drill_events (code, room_id, type) where type <> 'headcount'`,
  `alter table drill_events add column if not exists by text`,
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
    const events = await q.query(`select id, type, room_id, at, present, by from drill_events where code = $1 order by at, id`, [row.code])
    const pres = await q.query(`select room_id, seen_at from drill_presence where code = $1`, [row.code])
    return {
      ...row.data,
      code: row.code,
      schoolId: row.school_id,
      createdAt: Number(row.created_at),
      startedAt: row.started_at == null ? undefined : Number(row.started_at),
      endedAt: row.ended_at == null ? undefined : Number(row.ended_at),
      events: events.map((e) => ({ id: e.id, type: e.type, roomId: e.room_id, at: Number(e.at), ...(e.present == null ? {} : { present: e.present }), ...(e.by ? { by: e.by } : {}) })),
      presence: Object.fromEntries(pres.map((p) => [p.room_id, Number(p.seen_at)])),
    }
  }
  return {
    async keyHash(id) {
      const q = await sql()
      const rows = await q.query(`select key_hash from schools where id = $1`, [id])
      return rows.length ? rows[0].key_hash || '' : null
    },
    async setKeyHash(id, hash) {
      const q = await sql()
      await q.query(`update schools set key_hash = $2 where id = $1`, [id, hash])
    },
    async allIds() {
      const q = await sql()
      return (await q.query(`select id from schools`)).map((r) => r.id)
    },
    async getSchool(id) {
      const q = await sql()
      const rows = await q.query(`select data from schools where id = $1`, [id])
      return rows[0]?.data || null
    },
    async createSchool(s, hash) {
      const q = await sql()
      const r = await q.query(`insert into schools (id, data, updated_at, key_hash) values ($1, $2, $3, $4) on conflict do nothing returning id`, [s.id, JSON.stringify(s), s.updatedAt, hash])
      return r.length > 0
    },
    async putSchool(s) {
      const q = await sql()
      await q.query(`update schools set data = $2, updated_at = $3 where id = $1`, [s.id, JSON.stringify(s), s.updatedAt])
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
      await q.query(`insert into drill_events (id, code, type, room_id, at, present, by) values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing`, [ev.id, code, ev.type, ev.roomId, ev.at, ev.present ?? null, ev.by ?? null])
    },
    async undoLast(code, roomId) {
      const q = await sql()
      // the latest step of this class: headcount, then reached, then left
      const r = await q.query(`delete from drill_events where id = (select id from drill_events where code = $1 and room_id = $2 order by case type when 'headcount' then 3 when 'arrived' then 2 else 1 end desc, at desc, id desc limit 1) returning id, type`, [code, roomId])
      return r[0] || null
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
  fs.mkdirSync(path.join(dir, 'keys'), { recursive: true })
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
    async keyHash(id) { return read('schools', id) ? read('keys', id)?.hash || '' : null },
    async setKeyHash(id, hash) { write('keys', id, { hash }) },
    async allIds() { return all('schools').map((s) => s.id) },
    async getSchool(id) { return read('schools', id) },
    async createSchool(s, hash) { if (read('schools', s.id)) return false; write('keys', s.id, { hash }); write('schools', s.id, s); return true },
    async putSchool(s) { write('schools', s.id, s) },
    async deleteSchool(id) {
      fs.rmSync(path.join(dir, 'schools', `${id}.json`), { force: true })
      fs.rmSync(path.join(dir, 'keys', `${id}.json`), { force: true })
    },
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
    async undoLast(code, roomId) {
      const d = read('drills', code)
      if (!d) return null
      const rank = { headcount: 3, arrived: 2, left: 1 }
      const mine = d.events.filter((e) => e.roomId === roomId).sort((a, b) => rank[b.type] - rank[a.type] || b.at - a.at)
      if (!mine.length) return null
      d.events = d.events.filter((e) => e.id !== mine[0].id)
      write('drills', code, d)
      return { id: mine[0].id, type: mine[0].type }
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
  if (url) return Object.assign(pgStore(url), { kind: 'postgres' })
  if (process.env.VERCEL) {
    // serverless disks are read-only and wiped between requests: refuse rather than lose a drill
    const fail = async () => { throw Object.assign(new Error('Database not connected'), { status: 503 }) }
    return new Proxy({ kind: 'none' }, { get: (t, k) => (k === 'kind' ? 'none' : fail) })
  }
  return Object.assign(fileStore(process.env.DATA_DIR || path.join(process.cwd(), 'data')), { kind: 'files' })
}
