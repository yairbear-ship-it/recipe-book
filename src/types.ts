export interface Category {
  id?: number
  name: string
  parentId: number | null
  createdAt: number
  updatedAt: number
}

export type AttachmentKind = 'card' | 'dish'
export type AttachmentType = 'image' | 'pdf'

export interface RecipeImage {
  id?: number
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
}

export interface Recipe {
  id?: number
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
