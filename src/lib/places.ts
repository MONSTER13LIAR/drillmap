import type { MapNode } from './types'

export interface PlaceType { key: string; name: string }

export const ROOM_TYPES: PlaceType[] = [
  { key: 'classroom', name: 'Classroom' },
  { key: 'library', name: 'Library' },
  { key: 'lab', name: 'Laboratory' },
  { key: 'computer', name: 'Computer room' },
  { key: 'principal', name: "Principal's office" },
  { key: 'headmaster', name: "Headmaster's office" },
  { key: 'staff', name: 'Staff room' },
  { key: 'office', name: 'Office' },
  { key: 'yoga', name: 'Yoga room' },
  { key: 'music', name: 'Music / art room' },
  { key: 'hall', name: 'Hall / auditorium' },
  { key: 'canteen', name: 'Canteen' },
  { key: 'other', name: 'Other room' },
]

export const AREA_TYPES: PlaceType[] = [
  { key: 'assembly', name: 'Assembly point' },
  { key: 'ground', name: 'Ground' },
  { key: 'playground', name: 'Playground' },
  { key: 'garden', name: 'Garden' },
  { key: 'park', name: 'Park' },
  { key: 'other', name: 'Other open area' },
]

export const typesFor = (kind: MapNode['kind']) => (kind === 'room' ? ROOM_TYPES : kind === 'assembly' ? AREA_TYPES : [])

export const typeKey = (n: MapNode) => n.placeType || (n.kind === 'room' ? 'classroom' : 'assembly')
export const typeName = (n: MapNode) => typesFor(n.kind).find((t) => t.key === typeKey(n))?.name || ''
export const isClassroom = (n: MapNode) => n.kind === 'room' && typeKey(n) === 'classroom'
