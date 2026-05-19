import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { buildCategoryTree } from '../utils/categories'
import AppHeader from '../components/AppHeader'
import FloatingAddButton from '../components/FloatingAddButton'
import RecipeCard from '../components/RecipeCard'
import type { CategoryNode } from '../types'

export default function HomeScreen() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const recipes = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().toArray(), [])

  const recipeCounts = useMemo(() => {
    const m = new Map<number, number>()
    recipes?.forEach((r) => {
      if (r.categoryId != null) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1)
    })
    return m
  }, [recipes])

  const tree = useMemo(() => {
    if (!categories) return []
    return buildCategoryTree(categories, recipeCounts)
  }, [categories, recipeCounts])

  const favorites = useMemo(() => recipes?.filter((r) => r.favorite) ?? [], [recipes])
  const recent = useMemo(() => recipes?.slice(0, 5) ?? [], [recipes])

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <div className="min-h-full pb-32">
      <AppHeader
        title="ספר המתכונים"
        right={
          <Link
            to="/categories"
            className="p-2 -me-2 rounded-full hover:bg-white/10 active:bg-white/20"
            aria-label="נהל קטגוריות"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </Link>
        }
      />

      <div className="px-4 pt-4">
        <form onSubmit={onSearchSubmit} className="relative">
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש מתכון..."
            className="w-full ps-10 pe-4 py-3 bg-white border border-brand-200 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <span className="absolute top-1/2 -translate-y-1/2 start-3 text-brand-500 pointer-events-none">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
        </form>
      </div>

      {favorites.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between px-4">
            <h2 className="text-base font-semibold text-brand-800">מועדפים</h2>
            <Link to="/favorites" className="text-sm text-brand-600">הכל ←</Link>
          </div>
          <div className="px-4 mt-2 space-y-2">
            {favorites.slice(0, 3).map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <div className="flex items-center justify-between px-4 mb-2">
          <h2 className="text-base font-semibold text-brand-800">קטגוריות</h2>
          <Link to="/categories" className="text-sm text-brand-600 font-medium">
            ניהול ←
          </Link>
        </div>
        {tree.length === 0 ? (
          <div className="px-4">
            <Link
              to="/categories"
              className="block p-4 bg-white rounded-2xl shadow-sm border-2 border-dashed border-brand-300 text-center text-brand-700"
            >
              + צור קטגוריה ראשונה
            </Link>
          </div>
        ) : (
          <div className="px-4 grid grid-cols-2 gap-2">
            {tree.map((node) => (
              <CategoryTile key={node.id} node={node} />
            ))}
            <Link
              to="/categories"
              className="flex items-center justify-center gap-2 p-4 bg-white rounded-2xl shadow-sm border-2 border-dashed border-brand-300 text-brand-700 font-medium active:scale-[0.98] transition"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              קטגוריה
            </Link>
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="mt-6">
          <h2 className="text-base font-semibold text-brand-800 px-4 mb-2">נוספו לאחרונה</h2>
          <div className="px-4 space-y-2">
            {recent.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        </section>
      )}

      {recipes && recipes.length === 0 && (
        <div className="mt-12 px-8 text-center text-gray-500">
          <p className="text-lg">עוד אין מתכונים.</p>
          <p className="mt-2 text-sm">לחץ על הכפתור הכתום למטה כדי להוסיף את המתכון הראשון.</p>
        </div>
      )}

      <FloatingAddButton />
    </div>
  )
}

function CategoryTile({ node }: { node: CategoryNode }) {
  const total = node.recipeCount + node.children.reduce((s, c) => s + c.recipeCount, 0)
  return (
    <Link
      to={`/category/${node.id}`}
      className="block p-4 bg-white rounded-2xl shadow-sm active:scale-[0.98] transition"
    >
      <div className="text-base font-semibold text-brand-900 truncate">{node.name}</div>
      <div className="mt-1 text-sm text-gray-500">
        {total} {total === 1 ? 'מתכון' : 'מתכונים'}
        {node.children.length > 0 && ` • ${node.children.length} תת-קטגוריות`}
      </div>
    </Link>
  )
}
