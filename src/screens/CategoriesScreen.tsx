import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import AppHeader from '../components/AppHeader'
import type { Category } from '../types'
import { makeSyncId } from '../utils/ids'

interface FlatRow {
  id: number
  name: string
  parentId: number | null
  depth: number
  recipeCount: number
}

function flattenTree(categories: Category[], recipeCounts: Map<number, number>): FlatRow[] {
  const byParent = new Map<number | null, Category[]>()
  for (const c of categories) {
    if (c.id == null) continue
    const key = c.parentId
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(c)
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }
  const result: FlatRow[] = []
  const visited = new Set<number>()
  const visit = (parentId: number | null, depth: number) => {
    const children = byParent.get(parentId) ?? []
    for (const child of children) {
      if (child.id == null || visited.has(child.id)) continue
      visited.add(child.id)
      result.push({
        id: child.id,
        name: child.name,
        parentId: child.parentId,
        depth,
        recipeCount: recipeCounts.get(child.id) ?? 0,
      })
      visit(child.id, depth + 1)
    }
  }
  visit(null, 0)
  return result
}

export default function CategoriesScreen() {
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const recipes = useLiveQuery(() => db.recipes.toArray(), [])

  const [addingParentId, setAddingParentId] = useState<number | null | undefined>(undefined)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')

  const recipeCounts = useMemo(() => {
    const m = new Map<number, number>()
    if (recipes) {
      for (const r of recipes) {
        if (r.categoryId != null) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1)
      }
    }
    return m
  }, [recipes])

  const rows = useMemo(() => {
    if (!categories) return []
    return flattenTree(categories, recipeCounts)
  }, [categories, recipeCounts])

  const saveNew = async () => {
    if (!newName.trim() || addingParentId === undefined) return
    const now = Date.now()
    await db.categories.add({
      syncId: makeSyncId(),
      name: newName.trim(),
      parentId: addingParentId,
      createdAt: now,
      updatedAt: now,
    })
    setAddingParentId(undefined)
    setNewName('')
  }

  const cancelAdd = () => {
    setAddingParentId(undefined)
    setNewName('')
  }

  const saveEdit = async () => {
    if (editingId == null || !editingName.trim()) return
    await db.categories.update(editingId, {
      name: editingName.trim(),
      updatedAt: Date.now(),
    })
    setEditingId(null)
    setEditingName('')
  }

  const startEdit = (id: number, name: string) => {
    setEditingId(id)
    setEditingName(name)
  }

  const deleteCategory = async (id: number, name: string) => {
    if (!categories) return
    const descendants = collectDescendants(categories, id)
    const affectedCount = (recipes ?? []).filter(
      (r) => r.categoryId != null && descendants.has(r.categoryId),
    ).length
    const baseMsg =
      descendants.size > 1
        ? `למחוק את "${name}" ו-${descendants.size - 1} תת-קטגוריות?`
        : `למחוק את "${name}"?`
    const msg = affectedCount > 0 ? `${baseMsg}\n${affectedCount} מתכונים יאבדו את הקטגוריה.` : baseMsg
    if (!confirm(msg)) return
    const now = Date.now()
    await db.transaction('rw', db.categories, db.recipes, db.tombstones, async () => {
      if (recipes) {
        for (const r of recipes) {
          if (r.id != null && r.categoryId != null && descendants.has(r.categoryId)) {
            await db.recipes.update(r.id, { categoryId: null, updatedAt: now })
          }
        }
      }
      const ids = Array.from(descendants)
      const rows = await db.categories.bulkGet(ids)
      const tombstones = rows
        .filter((c): c is Category => c != null && !!c.syncId)
        .map((c) => ({ entity: 'category' as const, syncId: c.syncId, deletedAt: now }))
      if (tombstones.length > 0) await db.tombstones.bulkAdd(tombstones)
      await db.categories.bulkDelete(ids)
    })
  }

  return (
    <div className="min-h-full pb-24">
      <AppHeader title="ניהול קטגוריות" showBack />

      <div className="p-4 space-y-2">
        {rows.length === 0 && addingParentId === undefined && (
          <div className="text-center text-gray-500 mt-8 mb-4">עוד אין קטגוריות.</div>
        )}

        {rows.map((row) => (
          <div key={row.id}>
            <div
              className="flex items-center gap-2 bg-white rounded-xl p-3 shadow-sm"
              style={{ marginInlineStart: row.depth * 16 }}
            >
              {editingId === row.id ? (
                <>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit()
                      if (e.key === 'Escape') {
                        setEditingId(null)
                        setEditingName('')
                      }
                    }}
                    autoFocus
                    className="flex-1 px-2 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="px-3 py-1 bg-brand-600 text-white rounded-lg text-sm"
                  >
                    שמור
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null)
                      setEditingName('')
                    }}
                    className="px-3 py-1 text-sm"
                  >
                    ביטול
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate">{row.name}</span>
                  {row.recipeCount > 0 && (
                    <span className="text-xs text-gray-500">{row.recipeCount}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAddingParentId(row.id)
                      setNewName('')
                    }}
                    className="p-1.5 text-brand-700 hover:bg-brand-50 rounded-lg"
                    title="הוסף תת-קטגוריה"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(row.id, row.name)}
                    className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
                    title="ערוך"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCategory(row.id, row.name)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                    title="מחק"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </>
              )}
            </div>

            {addingParentId === row.id && (
              <AddInline
                value={newName}
                onChange={setNewName}
                onSave={saveNew}
                onCancel={cancelAdd}
                placeholder={`תת-קטגוריה של ${row.name}`}
                indent={row.depth + 1}
              />
            )}
          </div>
        ))}

        {addingParentId === null && (
          <AddInline
            value={newName}
            onChange={setNewName}
            onSave={saveNew}
            onCancel={cancelAdd}
            placeholder="שם קטגוריה ראשית"
            indent={0}
          />
        )}

        {addingParentId === undefined && (
          <button
            type="button"
            onClick={() => {
              setAddingParentId(null)
              setNewName('')
            }}
            className="mt-3 w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-dashed border-brand-400 text-brand-700 font-semibold rounded-xl active:scale-[0.98] transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            הוסף קטגוריה ראשית
          </button>
        )}
      </div>
    </div>
  )
}

function collectDescendants(categories: Category[], rootId: number): Set<number> {
  const childrenByParent = new Map<number, number[]>()
  for (const c of categories) {
    if (c.id == null || c.parentId == null) continue
    if (!childrenByParent.has(c.parentId)) childrenByParent.set(c.parentId, [])
    childrenByParent.get(c.parentId)!.push(c.id)
  }
  const result = new Set<number>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const children = childrenByParent.get(current) ?? []
    for (const childId of children) {
      if (!result.has(childId)) {
        result.add(childId)
        queue.push(childId)
      }
    }
  }
  return result
}

function AddInline({
  value,
  onChange,
  onSave,
  onCancel,
  placeholder,
  indent,
}: {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  placeholder: string
  indent: number
}) {
  return (
    <div
      className="flex items-center gap-2 bg-brand-50 rounded-xl p-2 mt-2"
      style={{ marginInlineStart: indent * 16 }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={placeholder}
        autoFocus
        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      <button
        type="button"
        onClick={onSave}
        className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-sm"
      >
        שמור
      </button>
      <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm">
        ביטול
      </button>
    </div>
  )
}
