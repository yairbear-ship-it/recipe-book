import { useNavigate } from 'react-router-dom'

export default function FloatingAddButton() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate('/recipe/new')}
      className="fixed bottom-6 start-6 z-40 w-14 h-14 rounded-full bg-brand-600 text-white shadow-xl flex items-center justify-center active:scale-95 transition"
      aria-label="הוסף מתכון"
      style={{ insetInlineStart: '1.5rem' }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  )
}
