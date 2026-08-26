export type ClinicalSectionKey = 'diagnosis' | 'treatment' | 'microbiology' | 'intervention' | 'note'
export type SectionErrors = Partial<Record<ClinicalSectionKey, string>>

export function clinicalSectionForMessage(message: string): ClinicalSectionKey | null {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('antimicrobiano') ||
    normalized.includes('tratamiento') ||
    normalized.includes('dosis') ||
    normalized.includes('duración') ||
    normalized.includes('suspensión')
  ) return 'treatment'
  if (
    normalized.includes('diagnóstico') ||
    normalized.includes('cie') ||
    normalized.includes('terapia') ||
    normalized.includes('evolución')
  ) return 'diagnosis'
  if (
    normalized.includes('microbiolog') ||
    normalized.includes('muestra') ||
    normalized.includes('microorganismo')
  ) return 'microbiology'
  if (
    normalized.includes('intervención') ||
    normalized.includes('recomendación') ||
    normalized.includes('aceptación') ||
    normalized.includes('cumplimiento') ||
    normalized.includes('seguimiento')
  ) return 'intervention'
  if (normalized.includes('nota') || normalized.includes('confirmar')) return 'note'
  return null
}
