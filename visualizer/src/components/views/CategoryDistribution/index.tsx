import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnnotations } from '../../../stores/annotations'
import { categoryColor } from '../../../lib/colors'

export default function CategoryDistribution() {
  const annotations = useAnnotations(s => s.annotations)
  const categoryStats = useAnnotations(s => s.categoryStats)
  const annotationsByImage = useAnnotations(s => s.annotationsByImage)
  const images = useAnnotations(s => s.images)
  const navigate = useNavigate()

  const [showAll, setShowAll] = useState(false)

  const displayedStats = showAll ? categoryStats : categoryStats.slice(0, 50)
  const maxCount = categoryStats[0]?.count || 1

  // Long tail stats
  const lt5 = categoryStats.filter(c => c.count < 5).length
  const lt10 = categoryStats.filter(c => c.count < 10).length
  const lt20 = categoryStats.filter(c => c.count < 20).length

  // Annotations per image histogram
  const perImageCounts = useMemo(() => {
    const counts: number[] = []
    for (const img of images.values()) {
      counts.push((annotationsByImage.get(img.id) || []).length)
    }
    return counts.sort((a, b) => a - b)
  }, [images, annotationsByImage])

  const histogram = useMemo(() => {
    if (perImageCounts.length === 0) return []
    const bucketSize = 20
    const max = perImageCounts[perImageCounts.length - 1]
    const buckets: { label: string; count: number }[] = []
    for (let lo = 0; lo <= max; lo += bucketSize) {
      const hi = lo + bucketSize
      const count = perImageCounts.filter(c => c >= lo && c < hi).length
      if (count > 0) buckets.push({ label: `${lo}-${hi}`, count })
    }
    return buckets
  }, [perImageCounts])

  const histMax = Math.max(...histogram.map(b => b.count), 1)

  // Box size scatter data
  const scatterData = useMemo(() => {
    return annotations.map(a => ({
      w: a.bbox[2],
      h: a.bbox[3],
      area: a.area,
      catId: a.category_id,
    }))
  }, [annotations])

  const maxBoxW = Math.max(...scatterData.map(d => d.w), 1)
  const maxBoxH = Math.max(...scatterData.map(d => d.h), 1)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-200">Category Distribution</h2>

      {/* Long tail summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total categories" value={categoryStats.length} />
        <StatCard label="< 5 annotations" value={lt5} color="text-red-400" />
        <StatCard label="< 10 annotations" value={lt10} color="text-amber-400" />
        <StatCard label="< 20 annotations" value={lt20} color="text-yellow-400" />
      </div>

      {/* Horizontal bar chart */}
      <div className="bg-gray-900 rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-gray-300">
            Annotations per Category {showAll ? `(all ${categoryStats.length})` : '(top 50)'}
          </h3>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {showAll ? 'Show top 50' : `Show all ${categoryStats.length}`}
          </button>
        </div>
        <div className="space-y-0.5 max-h-[600px] overflow-y-auto">
          {displayedStats.map((cat, i) => (
            <button
              key={cat.id}
              onClick={() => navigate(`/annotations?category=${cat.id}`)}
              className="flex items-center gap-2 w-full group hover:bg-gray-800/50 rounded px-1 py-0.5"
            >
              <span className="text-[10px] text-gray-600 w-6 text-right shrink-0">{i + 1}</span>
              <span className="text-[11px] text-gray-400 w-48 truncate text-left shrink-0 group-hover:text-gray-200">
                {cat.name}
              </span>
              <div className="flex-1 h-3 bg-gray-800 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(cat.count / maxCount) * 100}%`,
                    backgroundColor: categoryColor(cat.id),
                    opacity: 0.7,
                  }}
                />
              </div>
              <span className="text-[10px] text-gray-500 w-10 text-right shrink-0">{cat.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Annotations per image histogram */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Annotations per Image</h3>
          <svg viewBox={`0 0 400 200`} className="w-full">
            {histogram.map((b, i) => {
              const barW = 400 / histogram.length - 2
              const barH = (b.count / histMax) * 170
              return (
                <g key={i}>
                  <rect
                    x={i * (400 / histogram.length) + 1}
                    y={180 - barH}
                    width={barW}
                    height={barH}
                    fill="#3b82f6"
                    opacity={0.6}
                    rx={1}
                  />
                  <text
                    x={i * (400 / histogram.length) + barW / 2 + 1}
                    y={195}
                    textAnchor="middle"
                    fill="#6b7280"
                    fontSize={8}
                  >
                    {b.label}
                  </text>
                  <text
                    x={i * (400 / histogram.length) + barW / 2 + 1}
                    y={178 - barH}
                    textAnchor="middle"
                    fill="#9ca3af"
                    fontSize={7}
                  >
                    {b.count}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Box size scatter */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Box Sizes (width × height)
          </h3>
          <canvas
            ref={canvas => {
              if (!canvas) return
              const ctx = canvas.getContext('2d')!
              const dpr = window.devicePixelRatio
              canvas.width = 400 * dpr
              canvas.height = 300 * dpr
              ctx.scale(dpr, dpr)
              ctx.clearRect(0, 0, 400, 300)

              // Axes
              ctx.strokeStyle = '#374151'
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.moveTo(40, 0)
              ctx.lineTo(40, 270)
              ctx.lineTo(400, 270)
              ctx.stroke()

              // Labels
              ctx.fillStyle = '#6b7280'
              ctx.font = '10px monospace'
              ctx.fillText('width →', 200, 290)
              ctx.save()
              ctx.translate(10, 150)
              ctx.rotate(-Math.PI / 2)
              ctx.fillText('height →', -30, 0)
              ctx.restore()

              // Points
              for (const d of scatterData) {
                const x = 40 + (d.w / maxBoxW) * 350
                const y = 270 - (d.h / maxBoxH) * 260
                ctx.fillStyle = categoryColor(d.catId)
                ctx.globalAlpha = 0.1
                ctx.beginPath()
                ctx.arc(x, y, 2, 0, Math.PI * 2)
                ctx.fill()
              }
              ctx.globalAlpha = 1
            }}
            style={{ width: '100%', height: 300 }}
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
