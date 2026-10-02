// One-off: give every school that has no edit key a new one, and print its private edit link.
// Usage: DATABASE_URL=... node server/migrate-keys.js [https://drillmap.vercel.app]
import { makeStore } from './store.js'
import { hashKey, newKey } from './app.js'

const origin = process.argv[2] || 'http://localhost:8787'
const store = makeStore()
for (const id of await store.allIds()) {
  if (await store.keyHash(id)) continue
  const key = newKey()
  await store.setKeyHash(id, hashKey(key))
  const s = await store.getSchool(id)
  console.log(`${s?.name || id}\t${origin}/#/s/${id}/map?k=${key}`)
}
process.exit(0)
