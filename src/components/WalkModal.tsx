import { useEffect, useRef, useState } from 'react'
import { requestMotion, startSteps, type StepCounter } from '../lib/steps'

// Measure a corridor by walking it: counts steps from the accelerometer and times the walk.
export function WalkModal({ label, strideM, onDone, onClose }: { label: string; strideM: number; onDone: (m: number) => void; onClose: () => void }) {
  const [phase, setPhase] = useState<'ready' | 'walking' | 'done'>('ready')
  const [steps, setSteps] = useState(0)
  const [sec, setSec] = useState(0)
  const [noSensor, setNoSensor] = useState(false)
  const [manual, setManual] = useState('')
  const counter = useRef<StepCounter | null>(null)
  const t0 = useRef(0)

  useEffect(() => {
    if (phase !== 'walking') return
    const iv = window.setInterval(() => setSec((performance.now() - t0.current) / 1000), 200)
    return () => window.clearInterval(iv)
  }, [phase])
  useEffect(() => () => counter.current?.stop(), [])

  const start = async () => {
    const ok = await requestMotion()
    setNoSensor(!ok)
    setSteps(0)
    t0.current = performance.now()
    setSec(0)
    if (ok) counter.current = startSteps(setSteps)
    setPhase('walking')
  }
  const stop = () => {
    counter.current?.stop()
    setPhase('done')
  }
  const byStepsM = steps * strideM
  // no step data (laptop, sensor blocked): fall back to time at a normal walking pace
  const byTimeM = sec * 1.2
  const result = steps > 3 ? byStepsM : byTimeM

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Walk it</h2>
        <p className="muted small">{label}. Stand at one end, press start, walk at a normal pace, press stop at the other end.</p>
        <div className="grid2">
          <div className="kpi"><div className="v">{steps}</div><div className="l">steps × {strideM} m</div></div>
          <div className="kpi"><div className="v">{sec.toFixed(1)}s</div><div className="l">walking time</div></div>
        </div>
        {phase === 'ready' && <button className="primary big" onClick={start}>Start walking</button>}
        {phase === 'walking' && <button className="primary big" onClick={stop}>Stop here</button>}
        {phase === 'done' && (
          <>
            <p>
              Measured <b className="mono">{result.toFixed(1)} m</b>{' '}
              <span className="small faint">{steps > 3 ? 'from steps' : 'from time at 1.2 m/s (no step data)'}</span>
            </p>
            {noSensor && <p className="small faint">This device gave no motion data. Use a phone, or type the length below.</p>}
            <div className="row">
              <button className="primary" onClick={() => onDone(Math.round(result * 10) / 10)}>Use {result.toFixed(1)} m</button>
              <button onClick={() => setPhase('ready')}>Walk again</button>
            </div>
          </>
        )}
        <div className="sep" />
        <div className="row">
          <input inputMode="decimal" placeholder="or type metres" value={manual} onChange={(e) => setManual(e.target.value)} style={{ flex: 1 }} />
          <button disabled={!(parseFloat(manual) > 0)} onClick={() => onDone(parseFloat(manual))}>Save</button>
        </div>
      </div>
    </div>
  )
}
