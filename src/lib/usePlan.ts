import { useMemo } from 'react'
import { allCandidates, optimise, simulate } from './graph'
import type { School } from './types'

export function usePlan(school: School | null) {
  return useMemo(() => {
    if (!school) return null
    const cache = allCandidates(school)
    const current = simulate(school, school.plan?.choice || {}, cache)
    const opt = optimise(school)
    const changes = opt.after.groups
      .filter((g) => g.routeIndex !== (school.plan?.choice?.[g.roomId] ?? 0))
      .map((g) => ({ label: g.label, to: g.route.summary }))
    return { current, suggestion: opt.after, suggestionChoice: opt.choice, changes, cache }
  }, [school])
}
