import { useRef, useEffect, useState, useCallback } from 'react'
import type { CocoAnnotation, Prediction } from '../../types/coco'
import { categoryColor, categoryColorAlpha } from '../../lib/colors'

interface BboxOverlay {
  bbox: [number, number, number, number]
  categoryId: number
  label?: string
  score?: number
  style: 'gt' | 'pred' | 'tp' | 'fp' | 'fn'
}

interface ImageCanvasProps {
  src: string
  imageWidth: number
  imageHeight: number
  overlays?: BboxOverlay[]
  maxHeight?: number
  onBoxHover?: (overlay: BboxOverlay | null) => void
  onBoxClick?: (overlay: BboxOverlay) => void
}

export type { BboxOverlay }

export default function ImageCanvas({
  src,
  imageWidth,
  imageHeight,
  overlays = [],
  maxHeight = 600,
  onBoxHover,
  onBoxClick,
}: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => setImg(image)
    image.src = src
  }, [src])

  const aspect = imageWidth / imageHeight
  const displayWidth = Math.min(containerWidth, maxHeight * aspect)
  const displayHeight = displayWidth / aspect
  const scaleX = displayWidth / imageWidth
  const scaleY = displayHeight / imageHeight

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')!
    canvas.width = displayWidth * window.devicePixelRatio
    canvas.height = displayHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    ctx.drawImage(img, 0, 0, displayWidth, displayHeight)

    for (let i = 0; i < overlays.length; i++) {
      const o = overlays[i]
      const [x, y, w, h] = o.bbox
      const dx = x * scaleX, dy = y * scaleY, dw = w * scaleX, dh = h * scaleY
      const isHovered = i === hoveredIdx

      let strokeColor: string
      let fillColor: string

      switch (o.style) {
        case 'gt':
          strokeColor = categoryColor(o.categoryId)
          fillColor = categoryColorAlpha(o.categoryId, isHovered ? 0.3 : 0.08)
          break
        case 'pred':
          strokeColor = '#ef4444'
          fillColor = isHovered ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.08)'
          break
        case 'tp':
          strokeColor = '#22c55e'
          fillColor = isHovered ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.08)'
          break
        case 'fp':
          strokeColor = '#ef4444'
          fillColor = isHovered ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.08)'
          break
        case 'fn':
          strokeColor = '#f59e0b'
          fillColor = isHovered ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.08)'
          break
      }

      ctx.fillStyle = fillColor
      ctx.fillRect(dx, dy, dw, dh)
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = isHovered ? 3 : 2
      ctx.strokeRect(dx, dy, dw, dh)

      if (isHovered && (o.label || o.score !== undefined)) {
        const text = [o.label, o.score !== undefined ? `${(o.score * 100).toFixed(1)}%` : '']
          .filter(Boolean).join(' ')
        ctx.font = '12px monospace'
        const tw = ctx.measureText(text).width
        ctx.fillStyle = 'rgba(0,0,0,0.8)'
        ctx.fillRect(dx, dy - 18, tw + 8, 18)
        ctx.fillStyle = '#fff'
        ctx.fillText(text, dx + 4, dy - 5)
      }
    }
  }, [img, overlays, displayWidth, displayHeight, scaleX, scaleY, hoveredIdx])

  const handleMouse = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / scaleX
    const my = (e.clientY - rect.top) / scaleY

    for (let i = overlays.length - 1; i >= 0; i--) {
      const [bx, by, bw, bh] = overlays[i].bbox
      if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
        setHoveredIdx(i)
        onBoxHover?.(overlays[i])
        return
      }
    }
    setHoveredIdx(null)
    onBoxHover?.(null)
  }, [overlays, scaleX, scaleY, onBoxHover])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / scaleX
    const my = (e.clientY - rect.top) / scaleY

    for (let i = overlays.length - 1; i >= 0; i--) {
      const [bx, by, bw, bh] = overlays[i].bbox
      if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
        onBoxClick?.(overlays[i])
        return
      }
    }
  }, [overlays, scaleX, scaleY, onBoxClick])

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        style={{ width: displayWidth, height: displayHeight, cursor: 'crosshair' }}
        onMouseMove={handleMouse}
        onMouseLeave={() => { setHoveredIdx(null); onBoxHover?.(null) }}
        onClick={handleClick}
      />
    </div>
  )
}
