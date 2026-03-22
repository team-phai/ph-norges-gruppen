interface Props {
  value: number
  onChange: (v: number) => void
}

export default function ConfidenceSlider({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-gray-400 whitespace-nowrap">
        Confidence: {(value * 100).toFixed(0)}%
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={value * 100}
        onChange={e => onChange(Number(e.target.value) / 100)}
        className="flex-1 h-1 accent-blue-500"
      />
    </div>
  )
}
