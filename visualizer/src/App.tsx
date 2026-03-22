import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAnnotations } from './stores/annotations'
import Sidebar from './components/layout/Sidebar'
import AnnotationViewer from './components/views/AnnotationViewer'
import CategoryDistribution from './components/views/CategoryDistribution'
import PredictionComparison from './components/views/PredictionComparison'
import ScoreTracker from './components/views/ScoreTracker'
import TrainingResults from './components/views/TrainingResults'

export default function App() {
  const load = useAnnotations(s => s.load)
  const loading = useAnnotations(s => s.loading)
  const error = useAnnotations(s => s.error)

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-400 text-lg">Loading dataset...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-red-400 text-lg">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-auto p-4">
        <Routes>
          <Route path="/" element={<Navigate to="/annotations" replace />} />
          <Route path="/annotations" element={<AnnotationViewer />} />
          <Route path="/categories" element={<CategoryDistribution />} />
          <Route path="/predictions" element={<PredictionComparison />} />
          <Route path="/scores" element={<ScoreTracker />} />
          <Route path="/training" element={<TrainingResults />} />
        </Routes>
      </main>
    </div>
  )
}
