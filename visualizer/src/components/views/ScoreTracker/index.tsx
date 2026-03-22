import { useState } from 'react'
import { useScores } from '../../../stores/scores'
import type { ScoreEntry } from '../../../types/coco'

export default function ScoreTracker() {
  const entries = useScores(s => s.entries)
  const addEntry = useScores(s => s.addEntry)
  const removeEntry = useScores(s => s.removeEntry)

  const [detMap, setDetMap] = useState('')
  const [clsMap, setClsMap] = useState('')
  const [notes, setNotes] = useState('')
  const [jsonPaste, setJsonPaste] = useState('')

  const handleAdd = () => {
    const detection_mAP = parseFloat(detMap)
    const classification_mAP = parseFloat(clsMap)
    if (isNaN(detection_mAP) || isNaN(classification_mAP)) return
    const combined = 0.7 * detection_mAP + 0.3 * classification_mAP
    addEntry({
      timestamp: new Date().toISOString(),
      detection_mAP,
      classification_mAP,
      combined,
      notes,
    })
    setDetMap('')
    setClsMap('')
    setNotes('')
  }

  const handlePasteJSON = () => {
    try {
      const data = JSON.parse(jsonPaste)
      const detection_mAP = data.detection_mAP ?? data.det_map ?? 0
      const classification_mAP = data.classification_mAP ?? data.cls_map ?? 0
      const combined = 0.7 * detection_mAP + 0.3 * classification_mAP
      addEntry({
        timestamp: new Date().toISOString(),
        detection_mAP,
        classification_mAP,
        combined,
        notes: data.notes || '',
      })
      setJsonPaste('')
    } catch {
      // ignore parse errors
    }
  }

  // Chart
  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const maxY = Math.max(...sorted.map(e => Math.max(e.detection_mAP, e.classification_mAP, e.combined)), 1)
  const chartW = 600
  const chartH = 200

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-200">Score Tracker</h2>

      {/* Score chart */}
      {sorted.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Score History</h3>
          <svg viewBox={`0 0 ${chartW} ${chartH + 30}`} className="w-full max-w-2xl">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(v => {
              const y = chartH - (v / maxY) * chartH
              return (
                <g key={v}>
                  <line x1={40} y1={y} x2={chartW} y2={y} stroke="#374151" strokeWidth={0.5} />
                  <text x={36} y={y + 3} textAnchor="end" fill="#6b7280" fontSize={9}>
                    {v.toFixed(2)}
                  </text>
                </g>
              )
            })}

            {/* Lines */}
            {sorted.length > 1 && (
              <>
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  points={sorted.map((e, i) => {
                    const x = 40 + (i / (sorted.length - 1)) * (chartW - 60)
                    const y = chartH - (e.detection_mAP / maxY) * chartH
                    return `${x},${y}`
                  }).join(' ')}
                />
                <polyline
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth={2}
                  points={sorted.map((e, i) => {
                    const x = 40 + (i / (sorted.length - 1)) * (chartW - 60)
                    const y = chartH - (e.classification_mAP / maxY) * chartH
                    return `${x},${y}`
                  }).join(' ')}
                />
                <polyline
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  points={sorted.map((e, i) => {
                    const x = 40 + (i / (sorted.length - 1)) * (chartW - 60)
                    const y = chartH - (e.combined / maxY) * chartH
                    return `${x},${y}`
                  }).join(' ')}
                />
              </>
            )}

            {/* Points */}
            {sorted.map((e, i) => {
              const x = sorted.length === 1 ? chartW / 2 : 40 + (i / (sorted.length - 1)) * (chartW - 60)
              return (
                <g key={e.id}>
                  <circle cx={x} cy={chartH - (e.detection_mAP / maxY) * chartH} r={3} fill="#3b82f6" />
                  <circle cx={x} cy={chartH - (e.classification_mAP / maxY) * chartH} r={3} fill="#a855f7" />
                  <circle cx={x} cy={chartH - (e.combined / maxY) * chartH} r={3} fill="#22c55e" />
                </g>
              )
            })}

            {/* Legend */}
            <g transform={`translate(50, ${chartH + 15})`}>
              <rect x={0} y={0} width={8} height={8} fill="#3b82f6" />
              <text x={12} y={7} fill="#9ca3af" fontSize={9}>Detection mAP</text>
              <rect x={120} y={0} width={8} height={8} fill="#a855f7" />
              <text x={132} y={7} fill="#9ca3af" fontSize={9}>Classification mAP</text>
              <rect x={270} y={0} width={8} height={8} fill="#22c55e" />
              <text x={282} y={7} fill="#9ca3af" fontSize={9}>Combined</text>
            </g>
          </svg>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Add score form */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Add Score (Manual)</h3>
          <div className="space-y-2">
            <input
              type="number"
              step="0.001"
              placeholder="Detection mAP (0-1)"
              value={detMap}
              onChange={e => setDetMap(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200"
            />
            <input
              type="number"
              step="0.001"
              placeholder="Classification mAP (0-1)"
              value={clsMap}
              onChange={e => setClsMap(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200"
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200"
            />
            <button
              onClick={handleAdd}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm py-1.5 rounded transition-colors"
            >
              Add Score
            </button>
          </div>
        </div>

        {/* Paste JSON form */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Add Score (Paste JSON)</h3>
          <textarea
            placeholder='Paste sandbox server JSON response...'
            value={jsonPaste}
            onChange={e => setJsonPaste(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 h-28 resize-none font-mono"
          />
          <button
            onClick={handlePasteJSON}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white text-sm py-1.5 rounded transition-colors"
          >
            Parse & Add
          </button>
        </div>
      </div>

      {/* Submissions table */}
      {entries.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Submission History</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-gray-800">
                <th className="text-left py-2 px-2">#</th>
                <th className="text-left py-2 px-2">Timestamp</th>
                <th className="text-right py-2 px-2">Det mAP</th>
                <th className="text-right py-2 px-2">Cls mAP</th>
                <th className="text-right py-2 px-2">Combined</th>
                <th className="text-left py-2 px-2">Notes</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map((e, i) => (
                <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-1.5 px-2 text-gray-600">{entries.length - i}</td>
                  <td className="py-1.5 px-2 text-gray-400">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td className="py-1.5 px-2 text-right text-blue-400">{e.detection_mAP.toFixed(4)}</td>
                  <td className="py-1.5 px-2 text-right text-purple-400">{e.classification_mAP.toFixed(4)}</td>
                  <td className="py-1.5 px-2 text-right text-green-400 font-medium">{e.combined.toFixed(4)}</td>
                  <td className="py-1.5 px-2 text-gray-500 truncate max-w-xs">{e.notes}</td>
                  <td className="py-1.5 px-2">
                    <button
                      onClick={() => removeEntry(e.id)}
                      className="text-gray-600 hover:text-red-400 text-xs"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
