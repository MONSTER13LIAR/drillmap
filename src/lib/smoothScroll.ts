import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

// Weighted, inertial wheel scrolling. Touch keeps the native feel.
export function startSmoothScroll() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const lenis = new Lenis({ lerp: 0.07, wheelMultiplier: 0.8 })
  const raf = (t: number) => {
    lenis.raf(t)
    requestAnimationFrame(raf)
  }
  requestAnimationFrame(raf)
}
