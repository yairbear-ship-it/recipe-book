import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import AppHeader from '../components/AppHeader'
import CategoryPicker from '../components/CategoryPicker'
import PhotoCapture, { type PendingAttachment } from '../components/PhotoCapture'
import type { AttachmentType, RecipeImage } from '../types'
import { makeSyncId } from '../utils/ids'

interface ExistingPhoto {
  imageId: number
  blob: Blob
  thumbBlob: Blob
  width: number
  height: number
  fileType?: AttachmentType
  fileName?: string
}

export default function RecipeEditScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const editingId = id ? Number(id) : null
  const isNew = editingId == null

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [tagsInput, setTagsInput] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [instructions, setInstructions] = useState('')
  const [notes, setNotes] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [existingCards, setExistingCards] = useState<ExistingPhoto[]>([])
  const [existingDishes, setExistingDishes] = useState<ExistingPhoto[]>([])
  const [newCards, setNewCards] = useState<PendingAttachment[]>([])
  const [newDishes, setNewDishes] = useState<PendingAttachment[]>([])
  const [removedExisting, setRemovedExisting] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(isNew)

  useEffect(() => {
    if (isNew || editingId == null) return
    ;(async () => {
      const r = await db.recipes.get(editingId)
      if (!r) {
        navigate('/', { replace: true })
        return
      }
      setTitle(r.title)
      setCategoryId(r.categoryId)
      setTagsInput(r.tags.join(', '))
      setIngredients(r.ingredients)
      setInstructions(r.instructions)
      setNotes(r.notes)
      setSourceUrl(r.sourceUrl ?? '')
      setFavorite(r.favorite)
      const imgs = await db.images.where({ recipeId: editingId }).sortBy('order')
      const cards = imgs.filter((i) => i.kind === 'card').map(toExisting)
      const dishes = imgs.filter((i) => i.kind === 'dish').map(toExisting)
      setExistingCards(cards)
      setExistingDishes(dishes)
      setLoaded(true)
    })()
  }, [editingId, isNew, navigate])

  const removeExisting = (imageId: number, kind: 'card' | 'dish') => {
    setRemovedExisting((s) => new Set(s).add(imageId))
    if (kind === 'card') setExistingCards((cs) => cs.filter((c) => c.imageId !== imageId))
    else setExistingDishes((cs) => cs.filter((c) => c.imageId !== imageId))
  }

  const save = async () => {
    if (!title.trim() && newCards.length === 0 && newDishes.length === 0 && existingCards.length === 0 && existingDishes.length === 0) {
      alert('הוסף שם מתכון או תמונה לפחות.')
      return
    }
    setSaving(true)
    try {
      const now = Date.now()
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const recipeData = {
        title: title.trim(),
        categoryId,
        tags,
        ingredients: ingredients.trim(),
        instructions: instructions.trim(),
        notes: notes.trim(),
        sourceUrl: sourceUrl.trim() || null,
        favorite,
        updatedAt: now,
      }

      let recipeId: number
      if (isNew) {
        recipeId = (await db.recipes.add({
          ...recipeData,
          syncId: makeSyncId(),
          createdAt: now,
        })) as number
      } else {
        recipeId = editingId!
        await db.recipes.update(recipeId, recipeData)
      }

      if (removedExisting.size > 0) {
        // Record tombstones first so the sync engine knows to delete the
        // matching Drive files. Then physically remove the rows.
        const toRemove = Array.from(removedExisting)
        const removedRows = await db.images.bulkGet(toRemove)
        const tombstones = removedRows
          .filter((r): r is RecipeImage => r != null && !!r.syncId)
          .map((r) => ({ entity: 'image' as const, syncId: r.syncId, deletedAt: now }))
        if (tombstones.length > 0) await db.tombstones.bulkAdd(tombstones)
        await db.images.bulkDelete(toRemove)
      }

      const maxCardOrder = existingCards.length - 1
      const maxDishOrder = existingDishes.length - 1

      const newImageRecords: Omit<RecipeImage, 'id'>[] = [
        ...newCards.map((p, i) => ({
          syncId: makeSyncId(),
          recipeId,
          kind: 'card' as const,
          order: maxCardOrder + 1 + i,
          blob: p.blob,
          thumbBlob: p.thumbBlob,
          width: p.width,
          height: p.height,
          createdAt: now,
          fileType: p.fileType,
          fileName: p.fileName,
        })),
        ...newDishes.map((p, i) => ({
          syncId: makeSyncId(),
          recipeId,
          kind: 'dish' as const,
          order: maxDishOrder + 1 + i,
          blob: p.blob,
          thumbBlob: p.thumbBlob,
          width: p.width,
          height: p.height,
          createdAt: now,
          fileType: p.fileType,
          fileName: p.fileName,
        })),
      ]
      if (newImageRecords.length > 0) {
        await db.images.bulkAdd(newImageRecords as RecipeImage[])
      }

      navigate(`/recipe/${recipeId}`, { replace: true })
    } catch (e) {
      console.error(e)
      alert('שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <div className="p-8 text-center">טוען...</div>

  return (
    <div className="min-h-full pb-32">
      <AppHeader
        title={isNew ? 'מתכון חדש' : 'עריכת מתכון'}
        showBack
        right={
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 bg-white text-brand-700 rounded-full font-semibold disabled:opacity-50"
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
        }
      />

      <div className="p-4 space-y-5">
        <Field label="שם המתכון">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="לדוגמה: עוגת שוקולד של סבתא"
            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </Field>

        <Field label="קטגוריה">
          <CategoryPicker value={categoryId} onChange={setCategoryId} />
        </Field>

        <Field label="תגיות (מופרדות בפסיק)">
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="חגיגי, מהיר, ילדים"
            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </Field>

        <div className="flex items-center gap-2">
          <input
            id="fav"
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
            className="w-5 h-5 accent-brand-600"
          />
          <label htmlFor="fav" className="text-sm">סמן כמועדף</label>
        </div>

        <hr className="border-brand-200" />

        <PhotoCaptureCombined
          label="כרטיסי המתכון (סריקות / צילומים / PDF)"
          existing={existingCards}
          newPhotos={newCards}
          onAddNew={(p) => setNewCards((cs) => [...cs, p])}
          onRemoveNew={(id) => setNewCards((cs) => cs.filter((c) => c.id !== id))}
          onRemoveExisting={(id) => removeExisting(id, 'card')}
          allowPdf
        />

        <PhotoCaptureCombined
          label="תמונות של התבשיל"
          existing={existingDishes}
          newPhotos={newDishes}
          onAddNew={(p) => setNewDishes((cs) => [...cs, p])}
          onRemoveNew={(id) => setNewDishes((cs) => cs.filter((c) => c.id !== id))}
          onRemoveExisting={(id) => removeExisting(id, 'dish')}
        />

        <hr className="border-brand-200" />

        <Field label="מרכיבים">
          <textarea
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            rows={5}
            placeholder="שורה לכל מרכיב..."
            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </Field>

        <Field label="הוראות הכנה">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
            placeholder="תיאור הכנה..."
            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </Field>

        <Field label="הערות">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </Field>

        <Field label="קישור למקור (אם מהאינטרנט)">
          <input
            type="url"
            inputMode="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400"
            dir="ltr"
          />
        </Field>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full py-3 bg-brand-600 text-white font-semibold rounded-xl active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'שומר...' : 'שמור מתכון'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-brand-800 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function PhotoCaptureCombined(props: {
  label: string
  existing: ExistingPhoto[]
  newPhotos: PendingAttachment[]
  onAddNew: (p: PendingAttachment) => void
  onRemoveNew: (id: string) => void
  onRemoveExisting: (id: number) => void
  allowPdf?: boolean
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-brand-800 mb-2">{props.label}</div>
      {props.existing.length > 0 && (
        <ExistingPhotosGrid photos={props.existing} onRemove={props.onRemoveExisting} />
      )}
      <PhotoCapture
        label=""
        photos={props.newPhotos}
        onAdd={props.onAddNew}
        onRemove={props.onRemoveNew}
        allowPdf={props.allowPdf}
      />
    </div>
  )
}

function ExistingPhotosGrid({ photos, onRemove }: { photos: ExistingPhoto[]; onRemove: (id: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
      {photos.map((p) => (
        <div key={p.imageId} className="relative aspect-square rounded-xl overflow-hidden bg-gray-200">
          <img src={URL.createObjectURL(p.thumbBlob)} alt="" className="w-full h-full object-cover" />
          {p.fileType === 'pdf' && (
            <div className="absolute bottom-1 start-1 bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded">
              PDF
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(p.imageId)}
            className="absolute top-1 end-1 bg-black/60 text-white rounded-full p-1"
            aria-label="הסר"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

function toExisting(i: RecipeImage): ExistingPhoto {
  return {
    imageId: i.id!,
    blob: i.blob,
    thumbBlob: i.thumbBlob,
    width: i.width,
    height: i.height,
    fileType: i.fileType,
    fileName: i.fileName,
  }
}
