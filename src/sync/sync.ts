import { db, getSyncMeta, setSyncMeta } from '../db'
import type { Category, Recipe, Tombstone, AttachmentKind, AttachmentType } from '../types'
import {
  findOrCreateFolder,
  findIndexFile,
  downloadJson,
  uploadJson,
  uploadFile,
  downloadBlob,
  deleteFile,
} from './drive'
import { DRIVE_INDEX_FILE_NAME } from '../config'

// -- Snapshot format (what we write to Drive's index.json) ------------------

export interface SnapshotCategory {
  syncId: string
  name: string
  parentSyncId: string | null
  createdAt: number
  updatedAt: number
}

export interface SnapshotImage {
  syncId: string
  recipeSyncId: string
  kind: AttachmentKind
  order: number
  width: number
  height: number
  createdAt: number
  fileType: AttachmentType
  fileName?: string
  driveFileId: string
  thumbDriveFileId: string
}

export interface SnapshotRecipe {
  syncId: string
  title: string
  categorySyncId: string | null
  tags: string[]
  ingredients: string
  instructions: string
  notes: string
  sourceUrl: string | null
  favorite: boolean
  createdAt: number
  updatedAt: number
}

export interface SnapshotTombstone {
  entity: 'recipe' | 'category' | 'image'
  syncId: string
  deletedAt: number
}

export interface DriveSnapshot {
  schemaVersion: 1
  generatedAt: number
  categories: SnapshotCategory[]
  recipes: SnapshotRecipe[]
  images: SnapshotImage[]
  tombstones: SnapshotTombstone[]
}

// -- Status reporting -------------------------------------------------------

export type SyncPhase = 'idle' | 'pulling' | 'uploading' | 'finalizing' | 'error'

export interface SyncProgress {
  phase: SyncPhase
  message: string
  current?: number
  total?: number
}

export type SyncListener = (p: SyncProgress) => void

const listeners = new Set<SyncListener>()
let currentProgress: SyncProgress = { phase: 'idle', message: '' }

export function onSyncProgress(listener: SyncListener): () => void {
  listeners.add(listener)
  listener(currentProgress)
  return () => listeners.delete(listener)
}

function setProgress(p: SyncProgress): void {
  currentProgress = p
  listeners.forEach((l) => l(p))
}

// -- Sync orchestrator ------------------------------------------------------

let syncInFlight: Promise<void> | null = null

export async function syncNow(): Promise<void> {
  if (syncInFlight) return syncInFlight
  syncInFlight = (async () => {
    try {
      await doSync()
      setProgress({ phase: 'idle', message: 'הסנכרון הסתיים' })
      await setSyncMeta('lastSyncAt', String(Date.now()))
    } catch (e) {
      console.error('Sync failed:', e)
      setProgress({
        phase: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
      throw e
    } finally {
      syncInFlight = null
    }
  })()
  return syncInFlight
}

async function doSync(): Promise<void> {
  setProgress({ phase: 'pulling', message: 'מתחבר ל-Google Drive...' })
  const folderId = await getOrCacheFolderId()

  // Pull current remote snapshot (may be missing on first sync).
  const indexFile = await findIndexFile(folderId)
  let remote: DriveSnapshot | null = null
  if (indexFile) {
    setProgress({ phase: 'pulling', message: 'מוריד מתכונים מהענן...' })
    try {
      remote = await downloadJson<DriveSnapshot>(indexFile.id)
    } catch (e) {
      console.warn('Failed to read remote snapshot, treating as empty:', e)
    }
  }

  // Apply remote → local: pulls in new/updated records and honors tombstones.
  if (remote) {
    await applyRemoteToLocal(remote, folderId)
  }

  // Push local → remote: uploads any new images and rewrites index.json.
  setProgress({ phase: 'uploading', message: 'מעלה שינויים לענן...' })
  await pushLocalToRemote(folderId, indexFile?.id, remote)

  setProgress({ phase: 'finalizing', message: 'מנקה...' })
  // Tombstones get a long retention so that out-of-date devices can still see
  // them on their next sync. Old ones (>30 days) are pruned to keep the table
  // from growing unbounded.
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  await db.tombstones.where('deletedAt').below(cutoff).delete()
}

async function getOrCacheFolderId(): Promise<string> {
  const cached = await getSyncMeta('driveFolderId')
  if (cached) return cached
  const folderId = await findOrCreateFolder()
  await setSyncMeta('driveFolderId', folderId)
  return folderId
}

// -- Pull: remote → local --------------------------------------------------

async function applyRemoteToLocal(remote: DriveSnapshot, folderId: string): Promise<void> {
  void folderId // reserved for future use (image lazy download)

  // Build syncId → local row maps for fast lookup.
  const localCategories = await db.categories.toArray()
  const localRecipes = await db.recipes.toArray()
  const localImages = await db.images.toArray()
  const localTombstones = await db.tombstones.toArray()

  const localCatBySync = new Map(localCategories.map((c) => [c.syncId, c]))
  const localRecBySync = new Map(localRecipes.map((r) => [r.syncId, r]))
  const localImgBySync = new Map(localImages.map((i) => [i.syncId, i]))
  const localTombstoneIds = new Set(localTombstones.map((t) => t.syncId))

  // Remote tombstones first — if a record is deleted remotely, drop it locally.
  for (const t of remote.tombstones) {
    if (t.entity === 'category') {
      const local = localCatBySync.get(t.syncId)
      if (local?.id != null && (local.updatedAt ?? 0) < t.deletedAt) {
        await db.categories.delete(local.id)
        localCatBySync.delete(t.syncId)
      }
    } else if (t.entity === 'recipe') {
      const local = localRecBySync.get(t.syncId)
      if (local?.id != null && (local.updatedAt ?? 0) < t.deletedAt) {
        await db.images.where({ recipeId: local.id }).delete()
        await db.recipes.delete(local.id)
        localRecBySync.delete(t.syncId)
      }
    } else if (t.entity === 'image') {
      const local = localImgBySync.get(t.syncId)
      if (local?.id != null && (local.createdAt ?? 0) < t.deletedAt) {
        await db.images.delete(local.id)
        localImgBySync.delete(t.syncId)
      }
    }
  }

  // Categories: insert or update by newer updatedAt.
  // First pass: insert without parent; second pass: wire up parentId by syncId
  // since parents may not exist yet on the first pass.
  for (const c of remote.categories) {
    if (localTombstoneIds.has(c.syncId)) continue
    const existing = localCatBySync.get(c.syncId)
    if (!existing) {
      const newId = (await db.categories.add({
        syncId: c.syncId,
        name: c.name,
        parentId: null, // wired up below
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })) as number
      localCatBySync.set(c.syncId, {
        id: newId,
        syncId: c.syncId,
        name: c.name,
        parentId: null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })
    } else if (c.updatedAt > existing.updatedAt) {
      await db.categories.update(existing.id!, {
        name: c.name,
        updatedAt: c.updatedAt,
      })
      existing.name = c.name
      existing.updatedAt = c.updatedAt
    }
  }
  for (const c of remote.categories) {
    if (localTombstoneIds.has(c.syncId)) continue
    const local = localCatBySync.get(c.syncId)
    if (!local?.id) continue
    const desiredParentId = c.parentSyncId ? (localCatBySync.get(c.parentSyncId)?.id ?? null) : null
    if (local.parentId !== desiredParentId) {
      await db.categories.update(local.id, { parentId: desiredParentId })
      local.parentId = desiredParentId
    }
  }

  // Recipes.
  for (const r of remote.recipes) {
    if (localTombstoneIds.has(r.syncId)) continue
    const existing = localRecBySync.get(r.syncId)
    const localCategoryId = r.categorySyncId
      ? (localCatBySync.get(r.categorySyncId)?.id ?? null)
      : null
    if (!existing) {
      const newId = (await db.recipes.add({
        syncId: r.syncId,
        title: r.title,
        categoryId: localCategoryId,
        tags: r.tags,
        ingredients: r.ingredients,
        instructions: r.instructions,
        notes: r.notes,
        sourceUrl: r.sourceUrl,
        favorite: r.favorite,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })) as number
      localRecBySync.set(r.syncId, {
        id: newId,
        syncId: r.syncId,
        title: r.title,
        categoryId: localCategoryId,
        tags: r.tags,
        ingredients: r.ingredients,
        instructions: r.instructions,
        notes: r.notes,
        sourceUrl: r.sourceUrl,
        favorite: r.favorite,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })
    } else if (r.updatedAt > existing.updatedAt) {
      await db.recipes.update(existing.id!, {
        title: r.title,
        categoryId: localCategoryId,
        tags: r.tags,
        ingredients: r.ingredients,
        instructions: r.instructions,
        notes: r.notes,
        sourceUrl: r.sourceUrl,
        favorite: r.favorite,
        updatedAt: r.updatedAt,
      })
    }
  }

  // Images: download blobs for new ones referenced in the remote snapshot.
  setProgress({
    phase: 'pulling',
    message: 'מוריד תמונות מהענן...',
    current: 0,
    total: remote.images.length,
  })
  let downloaded = 0
  for (const img of remote.images) {
    if (localTombstoneIds.has(img.syncId)) continue
    const existing = localImgBySync.get(img.syncId)
    if (existing) {
      downloaded++
      continue
    }
    const recipe = localRecBySync.get(img.recipeSyncId)
    if (!recipe?.id) {
      downloaded++
      continue
    }
    try {
      const [fullBlob, thumbBlob] = await Promise.all([
        downloadBlob(img.driveFileId),
        downloadBlob(img.thumbDriveFileId),
      ])
      const newId = (await db.images.add({
        syncId: img.syncId,
        recipeId: recipe.id,
        kind: img.kind,
        order: img.order,
        blob: fullBlob,
        thumbBlob: thumbBlob,
        width: img.width,
        height: img.height,
        createdAt: img.createdAt,
        fileType: img.fileType,
        fileName: img.fileName,
        driveFileId: img.driveFileId,
        thumbDriveFileId: img.thumbDriveFileId,
        syncedAt: Date.now(),
      })) as number
      localImgBySync.set(img.syncId, {
        id: newId,
        syncId: img.syncId,
        recipeId: recipe.id,
        kind: img.kind,
        order: img.order,
        blob: fullBlob,
        thumbBlob: thumbBlob,
        width: img.width,
        height: img.height,
        createdAt: img.createdAt,
        fileType: img.fileType,
        fileName: img.fileName,
        driveFileId: img.driveFileId,
        thumbDriveFileId: img.thumbDriveFileId,
        syncedAt: Date.now(),
      })
    } catch (e) {
      console.warn(`Failed to download image ${img.syncId}:`, e)
    }
    downloaded++
    setProgress({
      phase: 'pulling',
      message: 'מוריד תמונות מהענן...',
      current: downloaded,
      total: remote.images.length,
    })
  }
}

// -- Push: local → remote --------------------------------------------------

async function pushLocalToRemote(
  folderId: string,
  existingIndexFileId: string | undefined,
  remote: DriveSnapshot | null,
): Promise<void> {
  const localCategories = await db.categories.toArray()
  const localRecipes = await db.recipes.toArray()
  const localImages = await db.images.toArray()
  const localTombstones = await db.tombstones.toArray()

  const localCatById = new Map<number, Category>(
    localCategories.filter((c) => c.id != null).map((c) => [c.id!, c]),
  )
  const localRecById = new Map<number, Recipe>(
    localRecipes.filter((r) => r.id != null).map((r) => [r.id!, r]),
  )

  // Upload any image blobs that haven't been uploaded yet (driveFileId missing).
  const needsUpload = localImages.filter((i) => !i.driveFileId || !i.thumbDriveFileId)
  let uploaded = 0
  setProgress({
    phase: 'uploading',
    message: 'מעלה תמונות לענן...',
    current: 0,
    total: needsUpload.length,
  })
  for (const img of needsUpload) {
    const mimeFull = img.fileType === 'pdf' ? 'application/pdf' : 'image/jpeg'
    const ext = img.fileType === 'pdf' ? 'pdf' : 'jpg'
    const fullName = `${img.syncId}.${ext}`
    const thumbName = `${img.syncId}.thumb.jpg`
    try {
      const full = await uploadFile(folderId, fullName, mimeFull, img.blob)
      const thumb = await uploadFile(folderId, thumbName, 'image/jpeg', img.thumbBlob)
      await db.images.update(img.id!, {
        driveFileId: full.id,
        thumbDriveFileId: thumb.id,
        syncedAt: Date.now(),
      })
      img.driveFileId = full.id
      img.thumbDriveFileId = thumb.id
    } catch (e) {
      console.warn(`Failed to upload image ${img.syncId}:`, e)
    }
    uploaded++
    setProgress({
      phase: 'uploading',
      message: 'מעלה תמונות לענן...',
      current: uploaded,
      total: needsUpload.length,
    })
  }

  // For tombstoned images that previously had a Drive file, delete those files.
  const remoteImagesBySyncId = new Map<string, SnapshotImage>(
    (remote?.images ?? []).map((i) => [i.syncId, i]),
  )
  for (const t of localTombstones.filter((t) => t.entity === 'image')) {
    const remoteImg = remoteImagesBySyncId.get(t.syncId)
    if (remoteImg) {
      await safeDelete(remoteImg.driveFileId)
      await safeDelete(remoteImg.thumbDriveFileId)
    }
  }

  // Build the new snapshot from current local state.
  setProgress({ phase: 'uploading', message: 'מעדכן את אינדקס הענן...' })
  const snapshot: DriveSnapshot = {
    schemaVersion: 1,
    generatedAt: Date.now(),
    categories: localCategories.map((c) => ({
      syncId: c.syncId,
      name: c.name,
      parentSyncId: c.parentId != null ? localCatById.get(c.parentId)?.syncId ?? null : null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    recipes: localRecipes.map((r) => ({
      syncId: r.syncId,
      title: r.title,
      categorySyncId:
        r.categoryId != null ? localCatById.get(r.categoryId)?.syncId ?? null : null,
      tags: r.tags,
      ingredients: r.ingredients,
      instructions: r.instructions,
      notes: r.notes,
      sourceUrl: r.sourceUrl,
      favorite: r.favorite,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    images: localImages
      .filter((i) => i.driveFileId && i.thumbDriveFileId)
      .map((i) => ({
        syncId: i.syncId,
        recipeSyncId: localRecById.get(i.recipeId)?.syncId ?? '',
        kind: i.kind,
        order: i.order,
        width: i.width,
        height: i.height,
        createdAt: i.createdAt,
        fileType: i.fileType ?? 'image',
        fileName: i.fileName,
        driveFileId: i.driveFileId!,
        thumbDriveFileId: i.thumbDriveFileId!,
      }))
      .filter((i) => i.recipeSyncId !== ''),
    tombstones: mergeTombstones(localTombstones, remote?.tombstones ?? []),
  }

  await uploadJson(folderId, DRIVE_INDEX_FILE_NAME, snapshot, existingIndexFileId)
}

function mergeTombstones(
  local: Tombstone[],
  remote: SnapshotTombstone[],
): SnapshotTombstone[] {
  const map = new Map<string, SnapshotTombstone>()
  const key = (t: { entity: string; syncId: string }) => `${t.entity}:${t.syncId}`
  for (const t of remote) map.set(key(t), t)
  for (const t of local) {
    const k = key(t)
    const existing = map.get(k)
    if (!existing || t.deletedAt > existing.deletedAt) {
      map.set(k, { entity: t.entity, syncId: t.syncId, deletedAt: t.deletedAt })
    }
  }
  return Array.from(map.values())
}

async function safeDelete(fileId: string | undefined): Promise<void> {
  if (!fileId) return
  try {
    await deleteFile(fileId)
  } catch (e) {
    console.warn(`Failed to delete drive file ${fileId}:`, e)
  }
}

