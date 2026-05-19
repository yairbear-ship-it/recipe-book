import Dexie, { type Table } from 'dexie'
import type { Category, Recipe, RecipeImage } from './types'

class RecipeBookDB extends Dexie {
  recipes!: Table<Recipe, number>
  categories!: Table<Category, number>
  images!: Table<RecipeImage, number>

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
  }
}

export const db = new RecipeBookDB()

export async function seedIfEmpty() {
  const count = await db.categories.count()
  if (count > 0) return
  const now = Date.now()
  const main = await db.categories.add({
    name: 'מנות עיקריות',
    parentId: null,
    createdAt: now,
    updatedAt: now,
  })
  const sides = await db.categories.add({
    name: 'תוספות',
    parentId: null,
    createdAt: now,
    updatedAt: now,
  })
  const desserts = await db.categories.add({
    name: 'קינוחים',
    parentId: null,
    createdAt: now,
    updatedAt: now,
  })
  await db.categories.bulkAdd([
    { name: 'בשר', parentId: main, createdAt: now, updatedAt: now },
    { name: 'עוף', parentId: main, createdAt: now, updatedAt: now },
    { name: 'דגים', parentId: main, createdAt: now, updatedAt: now },
    { name: 'צמחוני', parentId: main, createdAt: now, updatedAt: now },
    { name: 'אורז ופסטה', parentId: sides, createdAt: now, updatedAt: now },
    { name: 'סלטים', parentId: sides, createdAt: now, updatedAt: now },
    { name: 'עוגות', parentId: desserts, createdAt: now, updatedAt: now },
    { name: 'עוגיות', parentId: desserts, createdAt: now, updatedAt: now },
  ])
}
