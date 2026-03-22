export interface CocoImage {
  id: number
  file_name: string
  width: number
  height: number
}

export interface CocoAnnotation {
  id: number
  image_id: number
  category_id: number
  bbox: [number, number, number, number] // [x, y, width, height]
  area: number
  iscrowd: number
}

export interface CocoCategory {
  id: number
  name: string
  supercategory: string
}

export interface CocoDataset {
  images: CocoImage[]
  annotations: CocoAnnotation[]
  categories: CocoCategory[]
}

export interface Prediction {
  image_id: number
  category_id: number
  bbox: [number, number, number, number]
  score: number
}

export interface ProductInfo {
  product_code: string
  product_name: string
  annotation_count: number
  corrected_count: number
  has_images: boolean
  image_types: string[]
}

export interface ProductMetadata {
  total_products: number
  products_with_images: number
  products_without_images: number
  total_images: number
  missing: ProductInfo[]
  products: ProductInfo[]
}

export interface MatchResult {
  tp: number
  fp: number
  fn: number
  tpBoxes: Array<{ pred: Prediction; gt: CocoAnnotation }>
  fpBoxes: Prediction[]
  fnBoxes: CocoAnnotation[]
}

export interface ScoreEntry {
  id: string
  timestamp: string
  detection_mAP: number
  classification_mAP: number
  combined: number
  notes: string
}

export interface TrainingResult {
  epoch: number
  [key: string]: number
}
