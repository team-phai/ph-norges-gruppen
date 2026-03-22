import type { ProductInfo } from '../../types/coco'

interface Props {
  product: ProductInfo | null
  categoryName: string
}

export default function ProductRefPanel({ product, categoryName }: Props) {
  if (!product) {
    return (
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Product Reference</h3>
        <p className="text-xs text-gray-500">{categoryName}</p>
        <p className="text-xs text-gray-600 mt-2">No reference images available</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-1">Product Reference</h3>
      <p className="text-xs text-gray-400 mb-1">{product.product_name}</p>
      <p className="text-xs text-gray-600 mb-3">Barcode: {product.product_code}</p>
      <div className="grid grid-cols-2 gap-2">
        {product.image_types.map(view => (
          <div key={view} className="relative">
            <img
              src={`/api/images/product/${product.product_code}/${view}`}
              alt={`${view} view`}
              className="w-full rounded border border-gray-700 bg-gray-800"
              loading="lazy"
            />
            <span className="absolute bottom-0 left-0 bg-black/70 text-[10px] text-gray-300 px-1 rounded-tr">
              {view}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
