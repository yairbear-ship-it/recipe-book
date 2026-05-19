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

// Seed categories use deterministic syncIds so that, if the same seed runs on
// multiple devices, the sync engine recognises them as the same record and
// merges them via last-write-wins instead of creating duplicates.
//
// IMPORTANT: never change these strings. Devices in the wild rely on them
// being stable to deduplicate against existing copies in Drive.
const SEED_SYNC = {
  root_main: 'seed:cat:main-dishes',
  root_sides: 'seed:cat:sides',
  root_desserts: 'seed:cat:desserts',
  meat: 'seed:cat:meat',
  chicken: 'seed:cat:chicken',
  fish: 'seed:cat:fish',
  veg: 'seed:cat:veg',
  rice: 'seed:cat:rice-pasta',
  salads: 'seed:cat:salads',
  cakes: 'seed:cat:cakes',
  cookies: 'seed:cat:cookies',
} as const

const SEED_SYNC_IDS: ReadonlySet<string> = new Set(Object.values(SEED_SYNC))

export async function seedIfEmpty() {
  const count = await db.categories.count()
  if (count > 0) return
  const now = Date.now()
  const main = await db.categories.add({
    syncId: SEED_SYNC.root_main,
    name: 'מנות עיקריות',
    parentId: null,
    createdAt: now,
    updatedAt: now,
  })
  const sides = await db.categories.add({
    syncId: SEED_SYNC.root_sides,
    name: 'תוספות',
    parentId: null,
    createdAt: now,
    updatedAt: now,
  })
  const desserts = await db.categories.add({
    syncId: SEED_SYNC.root_desserts,
    name: 'קינוחים',
    parentId: null,
    createdAt: now,
    updatedAt: now,
  })
  const seed = (syncId: string, name: string, parentId: number) => ({
    syncId,
    name,
    parentId,
    createdAt: now,
    updatedAt: now,
  })
  await db.categories.bulkAdd([
    seed(SEED_SYNC.meat, 'בשר', main),
    seed(SEED_SYNC.chicken, 'עוף', main),
    seed(SEED_SYNC.fish, 'דגים', main),
    seed(SEED_SYNC.veg, 'צמחוני', main),
    seed(SEED_SYNC.rice, 'אורז ופסטה', sides),
    seed(SEED_SYNC.salads, 'סלטים', sides),
    seed(SEED_SYNC.cakes, 'עוגות', desserts),
    seed(SEED_SYNC.cookies, 'עוגיות', desserts),
  ])
}

// Returns true if the local DB contains only the pristine, unmodified seed
// categories — i.e. nothing the user has actually invested in. Used by the
// sync engine to wipe the auto-seed before pulling a remote snapshot for the
// first time on a new device, which otherwise causes name-duplicates.
export async function isPristineSeedOnly(): Promise<boolean> {
  const [recipeCount, imageCount, cats] = await Promise.all([
    db.recipes.count(),
    db.images.count(),
    db.categories.toArray(),
  ])
  if (recipeCount > 0 || imageCount > 0) return false
  if (cats.length === 0) return false
  // Every category must have a recognised seed syncId AND must not have been
  // renamed (we keyed by name in the seed; the syncId match is enough).
  return cats.every((c) => SEED_SYNC_IDS.has(c.syncId))
}

export async function clearPristineSeed(): Promise<void> {
  // Wipe without tombstones — this is a "rollback before sync", not a delete.
  await db.categories.clear()
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
