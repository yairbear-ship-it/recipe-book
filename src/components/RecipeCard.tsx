import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { blobUrl } from '../utils/images'
import type { Recipe } from '../types'

export default function RecipeCard({ recipe }: { recipe: Recipe }) {
  const thumb = useLiveQuery(
    async () => {
      if (recipe.id == null) return null
      const dish = await db.images
        .where({ recipeId: recipe.id, kind: 'dish' })
        .first()
      if (dish) return dish.thumbBlob
      const card = await db.images
        .where({ recipeId: recipe.id })
        .first()
      return card?.thumbBlob ?? null
    },
    [recipe.id],
  )

  return (
    <Link
      to={`/recipe/${recipe.id}`}
      className="flex items-center gap-3 p-3 bg-white rounded-2xl shadow-sm active:scale-[0.98] transition"
    >
      <div className="w-20 h-20 flex-none rounded-xl overflow-hidden bg-brand-100 flex items-center justify-center">
        {thumb ? (
          <img src={blobUrl(thumb)} alt="" className="w-full h-full object-cover" />
        ) : (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="1.5">
            <path d="M3 11h18M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold truncate flex-1">{recipe.title || 'ללא שם'}</h3>
          {recipe.favorite && (
            <span aria-label="מועדף">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#ea580c" stroke="#ea580c">
                <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.5 12 2" />
              </svg>
            </span>
          )}
        </div>
        {recipe.tags.length > 0 && (
          <div className="mt-1 flex gap-1 flex-wrap">
            {recipe.tags.slice(0, 3).map((t) => (
              <span key={t} className="text-xs px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
