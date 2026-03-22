import { NavLink } from 'react-router-dom'
import { useAnnotations } from '../../stores/annotations'

const links = [
  { to: '/annotations', label: 'Annotations', icon: '🔍' },
  { to: '/categories', label: 'Categories', icon: '📊' },
  { to: '/predictions', label: 'Predictions', icon: '🎯' },
  { to: '/scores', label: 'Scores', icon: '📈' },
  { to: '/training', label: 'Training', icon: '🏋️' },
]

export default function Sidebar() {
  const images = useAnnotations(s => s.images)
  const annotations = useAnnotations(s => s.annotations)
  const categories = useAnnotations(s => s.categories)

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-sm font-bold text-gray-200 tracking-wide">NorgesGruppen</h1>
        <p className="text-xs text-gray-500 mt-1">Object Detection</p>
      </div>

      <nav className="flex-1 py-2">
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white border-r-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800 text-xs text-gray-500 space-y-1">
        <div>{images.size} images</div>
        <div>{annotations.length.toLocaleString()} boxes</div>
        <div>{categories.size} categories</div>
      </div>
    </aside>
  )
}
