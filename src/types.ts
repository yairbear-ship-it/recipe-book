export interface Category {
  id?: number
  syncId: string
  name: string
  parentId: number | null
  createdAt: number
  updatedAt: number
}

export type AttachmentKind = 'card' | 'dish'
export type AttachmentType = 'image' | 'pdf'

export interface RecipeImage {
  id?: number
  syncId: string
  recipeId: number
  kind: AttachmentKind
  order: number
  blob: Blob
  thumbBlob: Blob
  width: number
  height: number
  createdAt: number
  fileType?: AttachmentType
  fileName?: string
  // Drive sync metadata. Populated after a successful upload.
  driveFileId?: string
  thumbDriveFileId?: string
  syncedAt?: number
}

export interface Recipe {
  id?: number
  syncId: string
  title: string
  categoryId: number | null
  tags: string[]
  ingredients: string
  instructions: string
  notes: string
  sourceUrl: string | null
  favorite: boolean
  createdAt: number
  updatedAt: number
}

export interface CategoryNode extends Category {
  children: CategoryNode[]
  recipeCount: number
}

export type TombstoneEntity = 'recipe' | 'category' | 'image'

export interface Tombstone {
  id?: number
  entity: TombstoneEntity
  syncId: string
  deletedAt: number
}

export type SyncMetaKey =
  | 'driveFolderId'
  | 'lastSyncAt'
  | 'lastIndexFileId'
  | 'lastIndexEtag'

export interface SyncMeta {
  key: SyncMetaKey
  value: string
}
