import { supabase } from '../lib/supabase'
import type { AntimicrobialCatalogItem, CatalogItem, UUID } from '../types/domain'

function isActive(item: CatalogItem) {
  const estado = item.estado?.toLowerCase()
  return !estado || estado === 'activo' || estado === 'activa'
}

export async function getProaCategories() {
  const { data, error } = await supabase.from('catalogo_categorias_proa').select('*').order('nombre')
  if (error) throw error
  return ((data ?? []) as CatalogItem[]).filter(isActive)
}

export async function getAntimicrobialCatalog(query?: string) {
  const term = query?.trim()
  const { data, error } = await supabase.from('catalogo_antimicrobianos').select('*').limit(100)
  if (error) throw error

  const rows = ((data ?? []) as AntimicrobialCatalogItem[]).filter(isActive)
  if (!term) return rows.slice(0, 40)

  const normalized = term.toLowerCase()
  return rows
    .filter((item) =>
      [item.nombre, item.descripcion, item.codigo, item.principio_activo, item.nombre_generico]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    )
    .slice(0, 40)
}

export function catalogLabel(item: AntimicrobialCatalogItem | CatalogItem) {
  const antimicrobial = item as AntimicrobialCatalogItem
  return item.nombre ?? antimicrobial.nombre_generico ?? antimicrobial.principio_activo ?? item.descripcion ?? item.codigo ?? item.id
}

export function findCatalogLabel(items: CatalogItem[], id?: UUID | null) {
  const item = items.find((candidate) => candidate.id === id)
  return item ? catalogLabel(item) : 'Sin categoría'
}
