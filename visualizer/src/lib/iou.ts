import type { CocoAnnotation, Prediction, MatchResult } from '../types/coco'

type Bbox = [number, number, number, number]

function computeIoU(a: Bbox, b: Bbox): number {
  const ax1 = a[0], ay1 = a[1], ax2 = a[0] + a[2], ay2 = a[1] + a[3]
  const bx1 = b[0], by1 = b[1], bx2 = b[0] + b[2], by2 = b[1] + b[3]

  const ix1 = Math.max(ax1, bx1)
  const iy1 = Math.max(ay1, by1)
  const ix2 = Math.min(ax2, bx2)
  const iy2 = Math.min(ay2, by2)

  const iw = Math.max(0, ix2 - ix1)
  const ih = Math.max(0, iy2 - iy1)
  const intersection = iw * ih

  const areaA = a[2] * a[3]
  const areaB = b[2] * b[3]
  const union = areaA + areaB - intersection

  return union > 0 ? intersection / union : 0
}

export function matchPredictions(
  gts: CocoAnnotation[],
  preds: Prediction[],
  iouThreshold = 0.5,
): MatchResult {
  const sortedPreds = [...preds].sort((a, b) => b.score - a.score)
  const matchedGt = new Set<number>()

  const tpBoxes: MatchResult['tpBoxes'] = []
  const fpBoxes: Prediction[] = []

  for (const pred of sortedPreds) {
    let bestIoU = 0
    let bestGt: CocoAnnotation | null = null

    for (const gt of gts) {
      if (matchedGt.has(gt.id)) continue
      if (gt.category_id !== pred.category_id) continue
      const iou = computeIoU(gt.bbox, pred.bbox)
      if (iou > bestIoU) {
        bestIoU = iou
        bestGt = gt
      }
    }

    if (bestIoU >= iouThreshold && bestGt) {
      matchedGt.add(bestGt.id)
      tpBoxes.push({ pred, gt: bestGt })
    } else {
      fpBoxes.push(pred)
    }
  }

  const fnBoxes = gts.filter(gt => !matchedGt.has(gt.id))

  return {
    tp: tpBoxes.length,
    fp: fpBoxes.length,
    fn: fnBoxes.length,
    tpBoxes,
    fpBoxes,
    fnBoxes,
  }
}

export { computeIoU }
