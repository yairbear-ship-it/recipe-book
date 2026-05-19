import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { buildCategoryTree } from '../utils/categories'
import type { CategoryNode } from '../types'

interface Props {
  value: number | null
  onChange: (id: number | null) => void
}

export default function CategoryPicker({ value, onChange }: Props) {
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  const tree = useMemo(() => {
    if (!categories) return []
    return buildCategoryTree(categories, new Map())
  }, [categories])

  const options = useMemo(() => {
    const result: { id: number; label: string }[] = []
    const walk = (nodes: CategoryNode[], prefix: string) => {
      nodes.forEach((n) => {
        result.push({ id: n.id!, label: prefix + n.name })
        walk(n.children, prefix + n.name + ' / ')
      })
    }
    walk(tree, '')
    return result
  }, [tree])

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      <option value="">— ללא קטגוריה —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
