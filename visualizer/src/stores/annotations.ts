import { create } from 'zustand'
import type { CocoImage, CocoAnnotation, CocoCategory, CocoDataset, ProductMetadata, ProductInfo } from '../types/coco'

interface CategoryStats {
  id: number
  name: string
  count: number
  productCode: string | null
}

interface AnnotationsState {
  loading: boolean
  error: string | null
  images: Map<number, CocoImage>
  annotations: CocoAnnotation[]
  categories: Map<number, CocoCategory>
  annotationsByImage: Map<number, CocoAnnotation[]>
  annotationsByCategory: Map<number, CocoAnnotation[]>
  categoryToProduct: Map<number, ProductInfo>
  categoryStats: CategoryStats[]
  metadata: ProductMetadata | null
  load: () => Promise<void>
}

export const useAnnotations = create<AnnotationsState>((set, get) => ({
  loading: false,
  error: null,
  images: new Map(),
  annotations: [],
  categories: new Map(),
  annotationsByImage: new Map(),
  annotationsByCategory: new Map(),
  categoryToProduct: new Map(),
  categoryStats: [],
  metadata: null,

  load: async () => {
    if (get().annotations.length > 0) return
    set({ loading: true, error: null })

    try {
      const [annRes, metaRes] = await Promise.all([
        fetch('/api/annotations'),
        fetch('/api/metadata'),
      ])

      if (!annRes.ok) throw new Error('Failed to load annotations')
      const data: CocoDataset = await annRes.json()
      const metadata: ProductMetadata = metaRes.ok ? await metaRes.json() : null

      // Build indexes
      const images = new Map(data.images.map(img => [img.id, img]))
      const categories = new Map(data.categories.map(cat => [cat.id, cat]))

      const annotationsByImage = new Map<number, CocoAnnotation[]>()
      const annotationsByCategory = new Map<number, CocoAnnotation[]>()

      for (const ann of data.annotations) {
        let byImage = annotationsByImage.get(ann.image_id)
        if (!byImage) {
          byImage = []
          annotationsByImage.set(ann.image_id, byImage)
        }
        byImage.push(ann)

        let byCat = annotationsByCategory.get(ann.category_id)
        if (!byCat) {
          byCat = []
          annotationsByCategory.set(ann.category_id, byCat)
        }
        byCat.push(ann)
      }

      // Match categories to products by name
      const categoryToProduct = new Map<number, ProductInfo>()
      if (metadata?.products) {
        const productByName = new Map<string, ProductInfo>()
        for (const p of metadata.products) {
          productByName.set(p.product_name, p)
        }
        for (const [id, cat] of categories) {
          const product = productByName.get(cat.name)
          if (product) categoryToProduct.set(id, product)
        }
      }

      // Precompute category stats sorted by count descending
      const categoryStats: CategoryStats[] = []
      for (const [id, cat] of categories) {
        const anns = annotationsByCategory.get(id) || []
        const product = categoryToProduct.get(id)
        categoryStats.push({
          id,
          name: cat.name,
          count: anns.length,
          productCode: product?.product_code ?? null,
        })
      }
      categoryStats.sort((a, b) => b.count - a.count)

      set({
        loading: false,
        images,
        annotations: data.annotations,
        categories,
        annotationsByImage,
        annotationsByCategory,
        categoryToProduct,
        categoryStats,
        metadata,
      })
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
    }
  },
}))
