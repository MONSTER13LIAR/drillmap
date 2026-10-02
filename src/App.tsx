import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Editor } from './pages/Editor'
import { Plan } from './pages/Plan'
import { PrintPlan } from './pages/PrintPlan'
import { Drills } from './pages/Drills'
import { Coordinator } from './pages/Coordinator'
import { Monitor } from './pages/Monitor'
import { Report } from './pages/Report'
import { keyFor, privateLink, rememberKey, serverStorage } from './lib/api'

function useHash() {
  const [hash, setHash] = useState(location.hash.slice(1) || '/')
  useEffect(() => {
    const on = () => {
      setHash(location.hash.slice(1) || '/')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

// a private edit link (#/s/<id>/map?k=<key>): keep the key in this browser, then drop it from the address bar
function takeKey(hash: string) {
  const m = hash.match(/^\/s\/([A-Za-z0-9_-]+)(\/[a-z]*)?\?(?:.*&)?k=([A-Za-z0-9_-]{16,})/)
  if (!m) return
  rememberKey(m[1], m[3])
  history.replaceState(null, '', `#/s/${m[1]}${m[2] || '/map'}`)
}

export function App() {
  const hash = useHash()
  takeKey(hash)
  const path = hash.split('?')[0]
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 's' && parts[1]) {
    const id = parts[1]
    const tab = parts[2] || 'map'
    return (
      <SchoolShell id={id} tab={tab}>
        {tab === 'map' && <Editor id={id} />}
        {tab === 'plan' && <Plan id={id} />}
        {tab === 'print' && <PrintPlan id={id} />}
        {tab === 'drills' && <Drills id={id} />}
      </SchoolShell>
    )
  }
  if (parts[0] === 'd' && parts[1]) return parts[2] === 'report' ? <Report code={parts[1]} /> : <Coordinator code={parts[1]} />
  if (parts[0] === 'm' && parts[1]) return <Monitor code={parts[1]} />
  return <Home />
}

function KeyBar({ id }: { id: string }) {
  const link = privateLink(id)
  const [copied, setCopied] = useState(false)
  if (!link) return null
  return (
    <div className="keybar no-print">
      <span className="small"><b>Private edit link</b> · anyone with it can see and change this school. Keep it private.</span>
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Private edit link" />
      <button
        className="ghost small"
        onClick={async () => {
          try { await navigator.clipboard.writeText(link) } catch { prompt('Copy this link', link) }
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function SchoolShell({ id, tab, children }: { id: string; tab: string; children: React.ReactNode }) {
  const [shared, setShared] = useState<boolean | null>(null)
  useEffect(() => { serverStorage().then(setShared) }, [])
  const locked = shared && !keyFor(id)
  const tabs: [string, string][] = [
    ['map', '1 · Map'],
    ['plan', '2 · Plan'],
    ['print', '3 · Print'],
    ['drills', '4 · Drill'],
  ]
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/">
          <img src="/icon.svg" alt="" />
          Drillmap
        </a>
        <nav className="tabs">
          {tabs.map(([k, l]) => (
            <a key={k} className={`tab ${tab === k ? 'on' : ''}`} href={`#/s/${id}/${k}`}>
              {l}
            </a>
          ))}
        </nav>
      </header>
      {locked ? (
        <main className="page stack">
          <h1>This school is private</h1>
          <p className="muted">Only someone with its private edit link can open it. Ask whoever made it to send you the link, or <a href="#/">start your own</a>.</p>
        </main>
      ) : shared === null ? null : (
        <>
          <KeyBar id={id} />
          {children}
        </>
      )}
    </>
  )
}
