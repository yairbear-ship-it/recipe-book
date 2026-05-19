import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { blobUrl } from '../utils/images'
import { getCategoryPath } from '../utils/categories'
import AppHeader from '../components/AppHeader'
import type { RecipeImage } from '../types'

interface MediaItem {
  id: number
  full: Blob
  thumb: Blob
  fileType: 'image' | 'pdf'
  fileName?: string
}

export default function RecipeDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const recipeId = Number(id)
  const [viewer, setViewer] = useState<{ items: MediaItem[]; index: number } | null>(null)

  const recipe = useLiveQuery(() => db.recipes.get(recipeId), [recipeId])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const images = useLiveQuery(
    () => db.images.where({ recipeId }).sortBy('order'),
    [recipeId],
  )

  if (recipe === undefined) return <div className="p-8 text-center">טוען...</div>
  if (recipe === null) {
    return (
      <div className="p-8 text-center">
        <p>מתכון לא נמצא.</p>
        <Link to="/" className="text-brand-600 mt-4 inline-block">חזרה לדף הבית</Link>
      </div>
    )
  }

  const cardItems = (images ?? []).filter((i) => i.kind === 'card').map(toMediaItem)
  const dishItems = (images ?? []).filter((i) => i.kind === 'dish').map(toMediaItem)
  const path = categories ? getCategoryPath(categories, recipe.categoryId) : []

  const openItem = (items: MediaItem[], index: number) => {
    const item = items[index]
    if (item.fileType === 'pdf') {
      window.open(blobUrl(item.full), '_blank', 'noopener,noreferrer')
      return
    }
    setViewer({ items, index })
  }

  const toggleFavorite = async () => {
    await db.recipes.update(recipeId, {
      favorite: !recipe.favorite,
      updatedAt: Date.now(),
    })
  }

  const deleteRecipe = async () => {
    if (!confirm(`למחוק את "${recipe.title}"?`)) return
    const now = Date.now()
    await db.transaction('rw', db.images, db.recipes, db.tombstones, async () => {
      const imgs = await db.images.where({ recipeId }).toArray()
      const tombstones: { entity: 'image' | 'recipe'; syncId: string; deletedAt: number }[] = []
      for (const i of imgs) {
        if (i.syncId) tombstones.push({ entity: 'image', syncId: i.syncId, deletedAt: now })
      }
      if (recipe.syncId) {
        tombstones.push({ entity: 'recipe', syncId: recipe.syncId, deletedAt: now })
      }
      if (tombstones.length > 0) await db.tombstones.bulkAdd(tombstones)
      await db.images.where({ recipeId }).delete()
      await db.recipes.delete(recipeId)
    })
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-full pb-12">
      <AppHeader
        title={recipe.title || 'מתכון'}
        showBack
        right={
          <>
            <button
              type="button"
              onClick={toggleFavorite}
              className="p-2 rounded-full hover:bg-white/10 active:bg-white/20"
              aria-label={recipe.favorite ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill={recipe.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.5 12 2" />
              </svg>
            </button>
            <Link
              to={`/recipe/${recipeId}/edit`}
              className="p-2 -me-2 rounded-full hover:bg-white/10 active:bg-white/20"
              aria-label="ערוך"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </Link>
          </>
        }
      />

      <div className="p-4 space-y-5">
        {path.length > 0 && (
          <div className="text-sm text-brand-700">
            {path.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ' / '}
                <Link to={`/category/${c.id}`} className="hover:underline">
                  {c.name}
                </Link>
              </span>
            ))}
          </div>
        )}

        {recipe.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {recipe.tags.map((t) => (
              <span key={t} className="text-xs px-2 py-1 bg-brand-100 text-brand-700 rounded-full">
                {t}
              </span>
            ))}
          </div>
        )}

        {dishItems.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-brand-800 mb-2">תמונות התבשיל</h2>
            <MediaGrid items={dishItems} onOpen={(idx) => openItem(dishItems, idx)} />
          </section>
        )}

        {cardItems.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-brand-800 mb-2">כרטיסי המתכון</h2>
            <MediaGrid items={cardItems} onOpen={(idx) => openItem(cardItems, idx)} />
          </section>
        )}

        {recipe.ingredients && (
          <section>
            <h2 className="text-sm font-semibold text-brand-800 mb-2">מרכיבים</h2>
            <div className="bg-white rounded-2xl p-4 whitespace-pre-wrap text-gray-800">
              {recipe.ingredients}
            </div>
          </section>
        )}

        {recipe.instructions && (
          <section>
            <h2 className="text-sm font-semibold text-brand-800 mb-2">הוראות הכנה</h2>
            <div className="bg-white rounded-2xl p-4 whitespace-pre-wrap text-gray-800">
              {recipe.instructions}
            </div>
          </section>
        )}

        {recipe.notes && (
          <section>
            <h2 className="text-sm font-semibold text-brand-800 mb-2">הערות</h2>
            <div className="bg-white rounded-2xl p-4 whitespace-pre-wrap text-gray-800">
              {recipe.notes}
            </div>
          </section>
        )}

        {recipe.sourceUrl && (
          <section>
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-brand-600 underline break-all"
            >
              {recipe.sourceUrl}
            </a>
          </section>
        )}

        <button
          type="button"
          onClick={deleteRecipe}
          className="block mx-auto mt-8 text-red-600 text-sm underline"
        >
          מחק מתכון
        </button>
      </div>

      {viewer && (
        <FullScreenViewer
          items={viewer.items}
          index={viewer.index}
          onChange={(idx) => setViewer({ items: viewer.items, index: idx })}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  )
}

function toMediaItem(i: RecipeImage): MediaItem {
  return {
    id: i.id!,
    full: i.blob,
    thumb: i.thumbBlob,
    fileType: i.fileType ?? 'image',
    fileName: i.fileName,
  }
}

function MediaGrid({ items, onOpen }: { items: MediaItem[]; onOpen: (index: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item, idx) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(idx)}
          className="relative aspect-square rounded-xl overflow-hidden bg-gray-200 active:scale-[0.98] transition"
        >
          <img src={blobUrl(item.thumb)} alt="" className="w-full h-full object-cover" />
          {item.fileType === 'pdf' && (
            <div className="absolute bottom-1 start-1 bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded">
              PDF
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

interface ViewerProps {
  items: MediaItem[]
  index: number
  onChange: (newIndex: number) => void
  onClose: () => void
}

function FullScreenViewer({ items, index, onChange, onClose }: ViewerProps) {
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const goPrev = () => {
    if (index > 0) onChange(index - 1)
  }
  const goNext = () => {
    if (index < items.length - 1) onChange(index + 1)
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        goNext()
      } else if (e.key === 'ArrowRight') {
        goPrev()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length])

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || touchStartY.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    touchStartX.current = null
    touchStartY.current = null
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) goNext()
    else goPrev()
  }

  const current = items[index]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <img
          src={blobUrl(current.full)}
          alt=""
          className="max-w-full max-h-full object-contain pointer-events-none"
        />
      </div>

      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
        <button
          type="button"
          onClick={onClose}
          className="text-white p-2 bg-black/40 rounded-full"
          aria-label="סגור"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="text-white text-sm bg-black/40 px-3 py-1 rounded-full">
          {index + 1} / {items.length}
        </div>
      </div>

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            className="absolute top-1/2 -translate-y-1/2 end-3 w-12 h-12 rounded-full bg-white/15 text-white flex items-center justify-center disabled:opacity-30 active:scale-95"
            aria-label="הקודם"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={index === items.length - 1}
            className="absolute top-1/2 -translate-y-1/2 start-3 w-12 h-12 rounded-full bg-white/15 text-white flex items-center justify-center disabled:opacity-30 active:scale-95"
            aria-label="הבא"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}
