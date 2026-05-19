import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { getDescendantIds, getCategoryPath } from '../utils/categories'
import AppHeader from '../components/AppHeader'
import FloatingAddButton from '../components/FloatingAddButton'
import RecipeCard from '../components/RecipeCard'

interface Props {
  mode?: 'favorites' | 'search'
}

export default function RecipeListScreen({ mode }: Props) {
  const params = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''

  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const allRecipes = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().toArray(), [])

  const categoryId = mode ? null : params.id ? Number(params.id) : null

  const title = useMemo(() => {
    if (mode === 'favorites') return 'מועדפים'
    if (mode === 'search') return `חיפוש: ${query}`
    if (categoryId == null || !categories) return 'מתכונים'
    const path = getCategoryPath(categories, categoryId)
    return path.map((c) => c.name).join(' / ') || 'מתכונים'
  }, [mode, query, categoryId, categories])

  const recipes = useMemo(() => {
    if (!allRecipes) return []
    if (mode === 'favorites') return allRecipes.filter((r) => r.favorite)
    if (mode === 'search') {
      const q = query.toLowerCase()
      return allRecipes.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)) ||
          r.ingredients.toLowerCase().includes(q) ||
          r.notes.toLowerCase().includes(q),
      )
    }
    if (categoryId != null && categories) {
      const ids = getDescendantIds(categories, categoryId)
      return allRecipes.filter((r) => r.categoryId != null && ids.has(r.categoryId))
    }
    return allRecipes
  }, [allRecipes, mode, query, categoryId, categories])

  return (
    <div className="min-h-full pb-32">
      <AppHeader title={title} showBack />
      <div className="px-4 pt-4 space-y-2">
        {recipes.length === 0 ? (
          <p className="text-center text-gray-500 mt-12">לא נמצאו מתכונים.</p>
        ) : (
          recipes.map((r) => <RecipeCard key={r.id} recipe={r} />)
        )}
      </div>
      <FloatingAddButton />
    </div>
  )
}
