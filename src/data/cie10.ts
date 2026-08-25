export type Cie10Item = {
  codigo: string
  descripcion: string
}

export const cie10Catalog: Cie10Item[] = [
  { codigo: 'A41.9', descripcion: 'Septicemia, no especificada' },
  { codigo: 'J15.9', descripcion: 'Neumonía bacteriana, no especificada' },
  { codigo: 'J18.9', descripcion: 'Neumonía, no especificada' },
  { codigo: 'J69.0', descripcion: 'Neumonitis debida a inhalación de alimento o vómito' },
  { codigo: 'N39.0', descripcion: 'Infección de vías urinarias, sitio no especificado' },
  { codigo: 'K65.9', descripcion: 'Peritonitis, no especificada' },
  { codigo: 'L03.9', descripcion: 'Celulitis, sitio no especificado' },
  { codigo: 'M86.9', descripcion: 'Osteomielitis, no especificada' },
  { codigo: 'G00.9', descripcion: 'Meningitis bacteriana, no especificada' },
  { codigo: 'I33.0', descripcion: 'Endocarditis infecciosa aguda y subaguda' },
  { codigo: 'T81.4', descripcion: 'Infección consecutiva a procedimiento, no clasificada en otra parte' },
  { codigo: 'B96.2', descripcion: 'Escherichia coli como causa de enfermedades clasificadas en otros capítulos' },
  { codigo: 'B95.6', descripcion: 'Staphylococcus aureus como causa de enfermedades clasificadas en otros capítulos' },
]

export function searchCie10(query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return cie10Catalog.slice(0, 8)
  return cie10Catalog
    .filter(
      (item) =>
        item.codigo.toLowerCase().includes(normalized) ||
        item.descripcion.toLowerCase().includes(normalized),
    )
    .slice(0, 8)
}
