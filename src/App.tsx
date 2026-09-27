import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Editor } from './pages/Editor'
import { Plan } from './pages/Plan'
import { PrintPlan } from './pages/PrintPlan'
import { Drills } from './pages/Drills'
import { Coordinator } from './pages/Coordinator'
import { Monitor } from './pages/Monitor'
import { Report } from './pages/Report'

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

export function App() {
  const path = useHash().split('?')[0]
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

function SchoolShell({ id, tab, children }: { id: string; tab: string; children: React.ReactNode }) {
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
      {children}
    </>
  )
}
