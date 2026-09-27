// Step counter from the phone's accelerometer: low-pass the magnitude, count peaks.
export interface StepCounter {
  stop: () => void
}

export async function requestMotion(): Promise<boolean> {
  const DM = (window as any).DeviceMotionEvent
  if (!DM) return false
  if (typeof DM.requestPermission === 'function') {
    try {
      return (await DM.requestPermission()) === 'granted'
    } catch {
      return false
    }
  }
  return true
}

export function startSteps(onStep: (count: number) => void): StepCounter {
  let smooth = 9.81
  let count = 0
  let above = false
  let lastStep = 0
  const handler = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity
    if (!a || a.x == null || a.y == null || a.z == null) return
    const mag = Math.hypot(a.x, a.y, a.z)
    smooth = smooth * 0.8 + mag * 0.2
    const now = performance.now()
    if (!above && smooth > 10.9) {
      above = true
      if (now - lastStep > 280) {
        lastStep = now
        count++
        onStep(count)
      }
    } else if (above && smooth < 10.1) {
      above = false
    }
  }
  window.addEventListener('devicemotion', handler)
  return { stop: () => window.removeEventListener('devicemotion', handler) }
}
