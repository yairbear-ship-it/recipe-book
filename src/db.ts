import Dexie, { type Table } from 'dexie'
import type { Category, Recipe, RecipeImage, SyncMeta, Tombstone } from './types'
import { makeSyncId } from './utils/ids'

class RecipeBookDB extends Dexie {
  recipes!: Table<Recipe, number>
  categories!: Table<Category, number>
  images!: Table<RecipeImage, number>
  tombstones!: Table<Tombstone, number>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    super('recipe-book')
    this.version(1).stores({
      recipes: '++id, title, categoryId, favorite, updatedAt, *tags',
      categories: '++id, parentId, name',
      images: '++id, recipeId, kind, order',
    })
    this.version(2).stores({
      recipes: '++id, title, categoryId, favorite, updatedAt, *tags',
      categories: '++id, parentId, name',
      images: '++id, recipeId, kind, order, [recipeId+kind]',
    })
    // v3: add syncId to every record + tombstones + sync metadata
    this.version(3)
      .stores({
        recipes: '++id, syncId, title, categoryId, favorite, updatedAt, *tags',
        categories: '++id, syncId, parentId, name',
        images: '++id, syncId, recipeId, kind, order, [recipeId+kind]',
        tombstones: '++id, syncId, entity, deletedAt',
        syncMeta: '&key',
      })
      .upgrade(async (tx) => {
        // Backfill sync IDs for any rows created before v3.
        await tx.table('recipes').toCollection().modify((r: Recipe) => {
          if (!r.syncId) r.syncId = makeSyncId()
        })
        await tx.table('categories').toCollection().modify((c: Category) => {
          if (!c.syncId) c.syncId = makeSyncId()
        })
        await tx.table('images').toCollection().modify((i: RecipeImage) => {
          if (!i.syncId) i.syncId = makeSyncId()
        })
      })
  }
}

export const db = new RecipeBookDB()

export async function seedIfEmpty() {
  const count = await db.categories.count()
  if (count > 0) return
  const now = Date.now()
  const main = await db.categories.add({
    syncId: makeSyncId(),
    name: 'מנות עיקריות',
    parentId: null,
    createdAt: now,
    updatedAt: now,
  })
  const sides = await db.categories.add({
    syncId: makeSyncId(),
    name: 'תוספות',
    parentId: null,
    createdAt: now,
    updatedAt: now,
  })
  const desserts = await db.categories.add({
    syncId: makeSyncId(),
    name: 'קינוחים',
    parentId: null,
    createdAt: now,
    updatedAt: now,
  })
  const seed = (name: string, parentId: number) => ({
    syncId: makeSyncId(),
    name,
    parentId,
    createdAt: now,
    updatedAt: now,
  })
  await db.categories.bulkAdd([
    seed('בשר', main),
    seed('עוף', main),
    seed('דגים', main),
    seed('צמחוני', main),
    seed('אורז ופסטה', sides),
    seed('סלטים', sides),
    seed('עוגות', desserts),
    seed('עוגיות', desserts),
  ])
}

// Helpers for the sync metadata key/value table.
export async function getSyncMeta(key: SyncMeta['key']): Promise<string | undefined> {
  const row = await db.syncMeta.get(key)
  return row?.value
}

export async function setSyncMeta(key: SyncMeta['key'], value: string): Promise<void> {
  await db.syncMeta.put({ key, value })
}

export async function clearSyncMeta(): Promise<void> {
  await db.syncMeta.clear()
}
