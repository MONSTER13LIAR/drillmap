// Local server: the API plus the built frontend. On Vercel, api/index.js serves the same API.
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from './app.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}
const PORT = Number(process.env.PORT || 8787)
app.listen(PORT, () => console.log(`drillmap on :${PORT}`))
