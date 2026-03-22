import { create } from 'zustand'
import type { Prediction, MatchResult, CocoAnnotation } from '../types/coco'
import { matchPredictions } from '../lib/iou'

interface PredictionsState {
  predictions: Prediction[]
  predictionsByImage: Map<number, Prediction[]>
  confidenceThreshold: number
  matchResults: Map<number, MatchResult>
  loaded: boolean
  loadPredictions: (preds: Prediction[]) => void
  setThreshold: (t: number) => void
  recomputeMatches: (annotationsByImage: Map<number, CocoAnnotation[]>) => void
  clear: () => void
}

export const usePredictions = create<PredictionsState>((set, get) => ({
  predictions: [],
  predictionsByImage: new Map(),
  confidenceThreshold: 0.25,
  matchResults: new Map(),
  loaded: false,

  loadPredictions: (preds: Prediction[]) => {
    const byImage = new Map<number, Prediction[]>()
    for (const p of preds) {
      let arr = byImage.get(p.image_id)
      if (!arr) {
        arr = []
        byImage.set(p.image_id, arr)
      }
      arr.push(p)
    }
    set({ predictions: preds, predictionsByImage: byImage, loaded: true })
  },

  setThreshold: (t: number) => {
    set({ confidenceThreshold: t })
  },

  recomputeMatches: (annotationsByImage: Map<number, CocoAnnotation[]>) => {
    const { predictionsByImage, confidenceThreshold } = get()
    const results = new Map<number, MatchResult>()

    const allImageIds = new Set([
      ...annotationsByImage.keys(),
      ...predictionsByImage.keys(),
    ])

    for (const imageId of allImageIds) {
      const gts = annotationsByImage.get(imageId) || []
      const preds = (predictionsByImage.get(imageId) || [])
        .filter(p => p.score >= confidenceThreshold)
      results.set(imageId, matchPredictions(gts, preds))
    }

    set({ matchResults: results })
  },

  clear: () => {
    set({
      predictions: [],
      predictionsByImage: new Map(),
      matchResults: new Map(),
      loaded: false,
    })
  },
}))
