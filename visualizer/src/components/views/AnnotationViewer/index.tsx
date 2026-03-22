import { useState, useMemo } from 'react'
import { useAnnotations } from '../../../stores/annotations'
import type { CocoImage, CocoAnnotation } from '../../../types/coco'
import ImageCanvas, { type BboxOverlay } from '../../shared/ImageCanvas'
import ProductRefPanel from '../../shared/ProductRefPanel'

export default function AnnotationViewer() {
  const images = useAnnotations(s => s.images)
  const categories = useAnnotations(s => s.categories)
  const annotationsByImage = useAnnotations(s => s.annotationsByImage)
  const annotationsByCategory = useAnnotations(s => s.annotationsByCategory)
  const categoryToProduct = useAnnotations(s => s.categoryToProduct)
  const categoryStats = useAnnotations(s => s.categoryStats)

  const [selectedImage, setSelectedImage] = useState<CocoImage | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedBox, setSelectedBox] = useState<BboxOverlay | null>(null)

  const imageList = useMemo(() => {
    const arr = Array.from(images.values())
    if (selectedCategoryId !== null) {
      const catAnns = annotationsByCategory.get(selectedCategoryId) || []
      const imageIds = new Set(catAnns.map(a => a.image_id))
      return arr.filter(img => imageIds.has(img.id))
    }
    return arr
  }, [images, selectedCategoryId, annotationsByCategory])

  const filteredCategories = useMemo(() => {
    if (!searchText) return categoryStats.slice(0, 50)
    const lower = searchText.toLowerCase()
    return categoryStats.filter(c => c.name.toLowerCase().includes(lower))
  }, [categoryStats, searchText])

  const overlays = useMemo((): BboxOverlay[] => {
    if (!selectedImage) return []
    const anns = annotationsByImage.get(selectedImage.id) || []
    return anns
      .filter(a => selectedCategoryId === null || a.category_id === selectedCategoryId)
      .map(a => ({
        bbox: a.bbox,
        categoryId: a.category_id,
        label: categories.get(a.category_id)?.name || `cat_${a.category_id}`,
        style: 'gt' as const,
      }))
  }, [selectedImage, annotationsByImage, selectedCategoryId, categories])

  const selectedProduct = selectedBox
    ? categoryToProduct.get(selectedBox.categoryId) ?? null
    : null
  const selectedCatName = selectedBox
    ? categories.get(selectedBox.categoryId)?.name ?? ''
    : ''

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Filter bar */}
      <div className="flex gap-3 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search categories..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 w-64 focus:outline-none focus:border-blue-500"
        />
        {selectedCategoryId !== null && (
          <button
            onClick={() => setSelectedCategoryId(null)}
            className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded hover:bg-blue-600/30"
          >
            {categories.get(selectedCategoryId)?.name} ✕
          </button>
        )}
        <span className="text-xs text-gray-500">{imageList.length} images</span>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: category filter list */}
        <div className="w-64 overflow-y-auto shrink-0 bg-gray-900 rounded-lg p-2">
          <div className="text-xs text-gray-500 px-2 py-1 mb-1">
            Categories ({filteredCategories.length})
          </div>
          {filteredCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id === selectedCategoryId ? null : cat.id)}
              className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                cat.id === selectedCategoryId
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              <span className="truncate block">{cat.name}</span>
              <span className="text-gray-600">{cat.count}</span>
            </button>
          ))}
        </div>

        {/* Center: image grid or detail */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selectedImage ? (
            <div>
              <button
                onClick={() => { setSelectedImage(null); setSelectedBox(null) }}
                className="text-sm text-blue-400 hover:text-blue-300 mb-3"
              >
                ← Back to grid
              </button>
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm text-gray-300 mb-2">
                    {selectedImage.file_name}
                    <span className="text-gray-600 ml-2">
                      {selectedImage.width}×{selectedImage.height} · {overlays.length} boxes
                    </span>
                  </h2>
                  <ImageCanvas
                    src={`/api/images/shelf/${selectedImage.file_name}`}
                    imageWidth={selectedImage.width}
                    imageHeight={selectedImage.height}
                    overlays={overlays}
                    onBoxClick={setSelectedBox}
                  />
                </div>
                {selectedBox && (
                  <div className="w-64 shrink-0">
                    <ProductRefPanel product={selectedProduct} categoryName={selectedCatName} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 xl:grid-cols-5 2xl:grid-cols-6">
              {imageList.map(img => {
                const count = (annotationsByImage.get(img.id) || []).length
                return (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    className="relative group rounded overflow-hidden border border-gray-800 hover:border-blue-500 transition-colors"
                  >
                    <img
                      src={`/api/images/shelf/${img.file_name}`}
                      alt={img.file_name}
                      loading="lazy"
                      className="w-full aspect-[4/3] object-cover bg-gray-800"
                    />
                    <span className="absolute top-1 right-1 bg-black/70 text-[10px] text-gray-300 px-1.5 py-0.5 rounded">
                      {count}
                    </span>
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-gray-300 px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {img.file_name}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
