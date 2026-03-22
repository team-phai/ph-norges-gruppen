import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ScoreEntry } from '../types/coco'

interface ScoresState {
  entries: ScoreEntry[]
  addEntry: (entry: Omit<ScoreEntry, 'id'>) => void
  removeEntry: (id: string) => void
}

export const useScores = create<ScoresState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) => {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        set((state) => ({
          entries: [...state.entries, { ...entry, id }],
        }))
      },

      removeEntry: (id) => {
        set((state) => ({
          entries: state.entries.filter(e => e.id !== id),
        }))
      },
    }),
    { name: 'norgesgruppen-scores' },
  ),
)
