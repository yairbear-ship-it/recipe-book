import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

interface Props {
  title: string
  showBack?: boolean
  right?: ReactNode
  onBack?: () => void
}

export default function AppHeader({ title, showBack, right, onBack }: Props) {
  const navigate = useNavigate()
  return (
    <header className="safe-top sticky top-0 z-30 bg-brand-600 text-white shadow-md">
      <div className="flex items-center gap-2 px-3 h-14">
        {showBack && (
          <button
            type="button"
            onClick={() => (onBack ? onBack() : navigate(-1))}
            className="p-2 -ms-2 rounded-full hover:bg-white/10 active:bg-white/20"
            aria-label="חזרה"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
        <h1 className="flex-1 text-lg font-semibold truncate">{title}</h1>
        {right}
      </div>
    </header>
  )
}
