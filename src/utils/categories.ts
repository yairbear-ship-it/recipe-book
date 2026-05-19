import type { Category, CategoryNode } from '../types'

export function buildCategoryTree(
  categories: Category[],
  recipeCounts: Map<number, number>,
): CategoryNode[] {
  const byId = new Map<number, CategoryNode>()
  categories.forEach((c) => {
    if (c.id != null) {
      byId.set(c.id, { ...c, children: [], recipeCount: recipeCounts.get(c.id) ?? 0 })
    }
  })
  const roots: CategoryNode[] = []
  byId.forEach((node) => {
    if (node.parentId != null && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  const sort = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'he'))
    nodes.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

export function getDescendantIds(categories: Category[], rootId: number): Set<number> {
  const result = new Set<number>([rootId])
  let added = true
  while (added) {
    added = false
    categories.forEach((c) => {
      if (c.id != null && c.parentId != null && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id)
        added = true
      }
    })
  }
  return result
}

export function getCategoryPath(
  categories: Category[],
  categoryId: number | null,
): Category[] {
  if (categoryId == null) return []
  const byId = new Map(categories.filter((c) => c.id != null).map((c) => [c.id!, c]))
  const path: Category[] = []
  let current = byId.get(categoryId)
  while (current) {
    path.unshift(current)
    current = current.parentId != null ? byId.get(current.parentId) : undefined
  }
  return path
}
