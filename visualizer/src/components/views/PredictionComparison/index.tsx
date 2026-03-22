import { useState, useMemo, useCallback, useEffect } from 'react'
import { useAnnotations } from '../../../stores/annotations'
import { usePredictions } from '../../../stores/predictions'
import type { Prediction, CocoImage, MatchResult } from '../../../types/coco'
import ImageCanvas, { type BboxOverlay } from '../../shared/ImageCanvas'
import ConfidenceSlider from '../../shared/ConfidenceSlider'

export default function PredictionComparison() {
  const images = useAnnotations(s => s.images)
  const categories = useAnnotations(s => s.categories)
  const annotationsByImage = useAnnotations(s => s.annotationsByImage)

  const predictions = usePredictions(s => s.predictions)
  const predictionsByImage = usePredictions(s => s.predictionsByImage)
  const loaded = usePredictions(s => s.loaded)
  const loadPredictions = usePredictions(s => s.loadPredictions)
  const confidenceThreshold = usePredictions(s => s.confidenceThreshold)
  const setThreshold = usePredictions(s => s.setThreshold)
  const matchResults = usePredictions(s => s.matchResults)
  const recomputeMatches = usePredictions(s => s.recomputeMatches)

  const [selectedImage, setSelectedImage] = useState<CocoImage | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (loaded) recomputeMatches(annotationsByImage)
  }, [loaded, confidenceThreshold, annotationsByImage, recomputeMatches])

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text()
    const data = JSON.parse(text) as Prediction[]
    loadPredictions(data)
  }, [loadPredictions])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // Summary stats
  const totalStats = useMemo(() => {
    let tp = 0, fp = 0, fn = 0
    for (const r of matchResults.values()) {
      tp += r.tp; fp += r.fp; fn += r.fn
    }
    return { tp, fp, fn }
  }, [matchResults])

  // Sorted by worst performance
  const rankedImages = useMemo(() => {
    return Array.from(images.values())
      .map(img => {
        const r = matchResults.get(img.id)
        return { img, errors: r ? r.fp + r.fn : 0, result: r }
      })
      .sort((a, b) => b.errors - a.errors)
  }, [images, matchResults])

  // Overlays for selected image
  const overlays = useMemo((): BboxOverlay[] => {
    if (!selectedImage || !loaded) return []
    const result = matchResults.get(selectedImage.id)
    if (!result) {
      // Show only GT
      const anns = annotationsByImage.get(selectedImage.id) || []
      return anns.map(a => ({
        bbox: a.bbox,
        categoryId: a.category_id,
        label: categories.get(a.category_id)?.name,
        style: 'gt' as const,
      }))
    }

    const boxes: BboxOverlay[] = []
    for (const { pred, gt } of result.tpBoxes) {
      boxes.push({
        bbox: gt.bbox,
        categoryId: gt.category_id,
        label: categories.get(gt.category_id)?.name,
        style: 'tp',
      })
    }
    for (const pred of result.fpBoxes) {
      boxes.push({
        bbox: pred.bbox,
        categoryId: pred.category_id,
        label: categories.get(pred.category_id)?.name,
        score: pred.score,
        style: 'fp',
      })
    }
    for (const gt of result.fnBoxes) {
      boxes.push({
        bbox: gt.bbox,
        categoryId: gt.category_id,
        label: categories.get(gt.category_id)?.name,
        style: 'fn',
      })
    }
    return boxes
  }, [selectedImage, loaded, matchResults, annotationsByImage, categories])

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700'
          }`}
        >
          <p className="text-gray-400 mb-4">Drop predictions.json here</p>
          <label className="cursor-pointer text-sm text-blue-400 hover:text-blue-300">
            or browse files
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        </div>
        <p className="text-xs text-gray-600 mt-4">
          Expected format: [{'{'}image_id, category_id, bbox, score{'}'}]
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-64">
          <ConfidenceSlider value={confidenceThreshold} onChange={setThreshold} />
        </div>
        <span className="text-xs text-gray-500">{predictions.length} total predictions</span>
        <div className="flex gap-3 text-xs">
          <span className="text-green-400">TP: {totalStats.tp}</span>
          <span className="text-red-400">FP: {totalStats.fp}</span>
          <span className="text-amber-400">FN: {totalStats.fn}</span>
        </div>
        <div className="flex gap-2 text-[10px] text-gray-500 ml-auto">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> TP</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> FP</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> FN</span>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Image ranking */}
        <div className="w-56 overflow-y-auto shrink-0 bg-gray-900 rounded-lg p-2">
          <div className="text-xs text-gray-500 px-2 py-1 mb-1">Images (worst first)</div>
          {rankedImages.map(({ img, errors, result }) => (
            <button
              key={img.id}
              onClick={() => setSelectedImage(img)}
              className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors flex justify-between ${
                img.id === selectedImage?.id
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              <span className="truncate">{img.file_name}</span>
              <span className={errors > 10 ? 'text-red-400' : errors > 5 ? 'text-amber-400' : 'text-gray-600'}>
                {result ? `${result.tp}/${result.fp}/${result.fn}` : '-'}
              </span>
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selectedImage ? (
            <div>
              <h2 className="text-sm text-gray-300 mb-2">
                {selectedImage.file_name}
                {matchResults.get(selectedImage.id) && (() => {
                  const r = matchResults.get(selectedImage.id)!
                  return (
                    <span className="text-gray-600 ml-2">
                      TP:{r.tp} FP:{r.fp} FN:{r.fn}
                    </span>
                  )
                })()}
              </h2>
              <ImageCanvas
                src={`/api/images/shelf/${selectedImage.file_name}`}
                imageWidth={selectedImage.width}
                imageHeight={selectedImage.height}
                overlays={overlays}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Select an image from the list
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
