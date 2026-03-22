const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#fb923c', '#a3e635', '#2dd4bf',
  '#38bdf8', '#818cf8', '#c084fc', '#e879f9', '#fb7185',
]

export function categoryColor(categoryId: number): string {
  return PALETTE[categoryId % PALETTE.length]
}

export function categoryColorAlpha(categoryId: number, alpha: number): string {
  const hex = categoryColor(categoryId)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
