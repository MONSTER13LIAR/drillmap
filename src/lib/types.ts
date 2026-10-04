export type NodeKind = 'room' | 'junction' | 'stair' | 'exit' | 'assembly'

export interface MapNode {
  id: string
  floorId: string
  kind: NodeKind
  x: number
  y: number
  label: string
  headcount?: number // rooms: people who evacuate from here
  stairKey?: string // stairs: same key on different floors = same staircase
  widthM?: number // stairs / exits: clear width in metres
  placeType?: string // rooms and open areas: see lib/places.ts
  sizeW?: number // rooms and open areas: width in metres
  sizeL?: number // rooms and open areas: length in metres
}

export interface MapEdge {
  id: string
  a: string
  b: string
  meters?: number // measured length; undefined = estimated from drawing
  source?: 'walk' | 'manual'
  widthM?: number // corridor clear width
}

export interface Floor {
  id: string
  name: string
  level: number // 0 = ground
  image?: string // data URL of the plan photo
  pxPerMeter?: number // drawing scale, set with the scale tool
}

export interface Settings {
  walkSpeed: number // m/s on the flat
  stairSpeed: number // m/s along the stair
  corridorFlow: number // persons per metre width per second
  stairFlow: number
  reactionSec: number // alarm → class starts moving
  stairMetersPerFloor: number // walking length of one storey of stairs
  defaultCorridorWidth: number
  defaultStairWidth: number
  targetSec: number // the school's own target for full evacuation
  strideM: number // for the step counter
}

export interface School {
  id: string
  name: string
  floors: Floor[]
  nodes: MapNode[]
  edges: MapEdge[]
  settings: Settings
  plan?: PlanOverride
  updatedAt: number
}

export interface PlanOverride {
  // room id → index of the chosen candidate route
  choice: Record<string, number>
}

export type DrillEventType = 'left' | 'arrived' | 'headcount'

export interface DrillEvent {
  id: string
  type: DrillEventType
  roomId: string
  at: number // server ms
  present?: number
  device?: string
  by?: 'coordinator' // marked by hand on the coordinator's screen
}

export interface Drill {
  code: string
  schoolId: string
  schoolName: string
  createdAt: number
  startedAt?: number
  endedAt?: number
  events: DrillEvent[]
  presence?: Record<string, number> // room id → last time a monitor phone checked in
  assembly?: string
  // frozen copy of the plan at drill time: expected seconds per room + route summary
  expected: Record<string, { sec: number; via: string; stairKey?: string; label: string; headcount: number; floor: string }>
}

export const DEFAULT_SETTINGS: Settings = {
  walkSpeed: 1.0,
  stairSpeed: 0.6,
  corridorFlow: 1.3,
  stairFlow: 1.0,
  reactionSec: 20,
  stairMetersPerFloor: 9,
  defaultCorridorWidth: 1.8,
  defaultStairWidth: 1.2,
  targetSec: 180,
  strideM: 0.65,
}
