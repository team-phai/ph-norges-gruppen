import { useState, useEffect } from 'react'

interface RunInfo {
  name: string
  results: Record<string, number>[] | null
  args: Record<string, string | number | boolean> | null
  plots: string[]
}

const KNOWN_PLOTS = [
  'confusion_matrix.png',
  'confusion_matrix_normalized.png',
  'F1_curve.png',
  'P_curve.png',
  'R_curve.png',
  'PR_curve.png',
  'results.png',
  'labels.jpg',
  'labels_correlogram.jpg',
]

export default function TrainingResults() {
  const [runs, setRuns] = useState<string[]>([])
  const [selectedRuns, setSelectedRuns] = useState<string[]>([])
  const [runData, setRunData] = useState<Map<string, RunInfo>>(new Map())
  const [plotView, setPlotView] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/runs').then(r => r.json()).then(setRuns).catch(() => {})
  }, [])

  const loadRun = async (name: string) => {
    if (runData.has(name)) return
    const [resultsRes, argsRes] = await Promise.all([
      fetch(`/api/runs/${name}/results`),
      fetch(`/api/runs/${name}/args`),
    ])
    const results = resultsRes.ok ? await resultsRes.json() : null
    const args = argsRes.ok ? await argsRes.json() : null

    // Probe which plots exist
    const plots: string[] = []
    for (const p of KNOWN_PLOTS) {
      const res = await fetch(`/api/runs/${name}/plots/${p}`, { method: 'HEAD' })
      if (res.ok) plots.push(p)
    }

    setRunData(prev => new Map(prev).set(name, { name, results, args, plots }))
  }

  const toggleRun = (name: string) => {
    if (selectedRuns.includes(name)) {
      setSelectedRuns(selectedRuns.filter(r => r !== name))
    } else {
      setSelectedRuns([...selectedRuns, name])
      loadRun(name)
    }
  }

  // Find metric columns from first loaded run
  const metricCols = (() => {
    for (const name of selectedRuns) {
      const data = runData.get(name)
      if (data?.results?.length) {
        return Object.keys(data.results[0]).filter(k => k !== 'epoch' && !k.startsWith('#'))
      }
    }
    return []
  })()

  const LOSS_KEYS = metricCols.filter(k => k.toLowerCase().includes('loss'))
  const MAP_KEYS = metricCols.filter(k => k.toLowerCase().includes('map') || k.toLowerCase().includes('precision') || k.toLowerCase().includes('recall'))

  const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#ec4899']

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-200">Training Results</h2>

      {runs.length === 0 ? (
        <div className="text-gray-500 text-sm">
          No training runs found in runs/train/. Train a model first or pull results from GCP.
        </div>
      ) : (
        <>
          {/* Run selector */}
          <div className="flex gap-2 flex-wrap">
            {runs.map(name => (
              <button
                key={name}
                onClick={() => toggleRun(name)}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  selectedRuns.includes(name)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          {selectedRuns.map((runName, ri) => {
            const data = runData.get(runName)
            if (!data) return null

            return (
              <div key={runName} className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-800 pb-1">
                  {runName}
                </h3>

                {/* Args */}
                {data.args && (
                  <div className="bg-gray-900 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2">Hyperparameters</h4>
                    <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-xs">
                      {Object.entries(data.args).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-gray-500">{k}</span>
                          <span className="text-gray-300">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loss charts */}
                {data.results && LOSS_KEYS.length > 0 && (
                  <div className="bg-gray-900 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2">Loss Curves</h4>
                    <MetricChart
                      results={data.results}
                      keys={LOSS_KEYS}
                      colors={COLORS}
                    />
                  </div>
                )}

                {/* mAP charts */}
                {data.results && MAP_KEYS.length > 0 && (
                  <div className="bg-gray-900 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2">mAP / Precision / Recall</h4>
                    <MetricChart
                      results={data.results}
                      keys={MAP_KEYS}
                      colors={COLORS}
                    />
                  </div>
                )}

                {/* Plots gallery */}
                {data.plots.length > 0 && (
                  <div className="bg-gray-900 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2">Training Plots</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {data.plots.map(p => (
                        <button
                          key={p}
                          onClick={() => setPlotView(`/api/runs/${runName}/plots/${p}`)}
                          className="rounded border border-gray-700 overflow-hidden hover:border-blue-500 transition-colors"
                        >
                          <img
                            src={`/api/runs/${runName}/plots/${p}`}
                            alt={p}
                            loading="lazy"
                            className="w-full bg-gray-800"
                          />
                          <div className="text-[10px] text-gray-500 p-1 text-center">{p}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Run comparison */}
          {selectedRuns.length > 1 && metricCols.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Run Comparison</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-1 px-2">Run</th>
                    {MAP_KEYS.slice(0, 6).map(k => (
                      <th key={k} className="text-right py-1 px-2">{k.replace('metrics/', '')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedRuns.map(name => {
                    const data = runData.get(name)
                    const last = data?.results?.[data.results.length - 1]
                    return (
                      <tr key={name} className="border-b border-gray-800/50">
                        <td className="py-1 px-2 text-gray-300">{name}</td>
                        {MAP_KEYS.slice(0, 6).map(k => (
                          <td key={k} className="py-1 px-2 text-right text-gray-400">
                            {last?.[k]?.toFixed(4) ?? '-'}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Plot modal */}
      {plotView && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setPlotView(null)}
        >
          <img src={plotView} alt="Plot" className="max-w-[90vw] max-h-[90vh] rounded-lg" />
        </div>
      )}
    </div>
  )
}

function MetricChart({
  results,
  keys,
  colors,
}: {
  results: Record<string, number>[]
  keys: string[]
  colors: string[]
}) {
  const chartW = 600
  const chartH = 200
  const epochs = results.length
  if (epochs === 0) return null

  const allVals = keys.flatMap(k => results.map(r => r[k] ?? 0))
  const maxY = Math.max(...allVals, 0.001)
  const minY = Math.min(...allVals, 0)
  const range = maxY - minY || 1

  return (
    <div>
      <svg viewBox={`0 0 ${chartW} ${chartH + 25}`} className="w-full max-w-2xl">
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const val = minY + frac * range
          const y = chartH - frac * chartH
          return (
            <g key={frac}>
              <line x1={40} y1={y} x2={chartW} y2={y} stroke="#374151" strokeWidth={0.5} />
              <text x={36} y={y + 3} textAnchor="end" fill="#6b7280" fontSize={8}>
                {val.toFixed(3)}
              </text>
            </g>
          )
        })}

        {/* Lines */}
        {keys.map((key, ki) => (
          <polyline
            key={key}
            fill="none"
            stroke={colors[ki % colors.length]}
            strokeWidth={1.5}
            points={results.map((r, i) => {
              const x = epochs === 1 ? chartW / 2 : 40 + (i / (epochs - 1)) * (chartW - 60)
              const y = chartH - ((r[key] ?? 0) - minY) / range * chartH
              return `${x},${y}`
            }).join(' ')}
          />
        ))}

        {/* Legend */}
        <g transform={`translate(50, ${chartH + 12})`}>
          {keys.map((key, ki) => (
            <g key={key} transform={`translate(${ki * 140}, 0)`}>
              <rect width={8} height={8} fill={colors[ki % colors.length]} />
              <text x={12} y={7} fill="#9ca3af" fontSize={8}>
                {key.replace('metrics/', '').replace('train/', '')}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
