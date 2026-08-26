import { logClientError } from '../lib/errorLogger'

const moduleFallbacks: Record<string, string> = {
  catalogo_antimicrobianos: 'No se pudo cargar el catálogo de antimicrobianos.',
  catalogo_tipos_muestra: 'No se pudo cargar el catálogo de tipos de muestra.',
  catalogo_microorganismos: 'No se pudo cargar el catálogo de microorganismos.',
  microbiologia: 'No se pudo guardar la microbiología.',
  notas_proa: 'No se pudo guardar la nota PROA.',
  rondas_proa: 'No se pudo guardar la ronda.',
  tratamientos_antimicrobianos: 'No se pudo guardar el tratamiento antimicrobiano.',
}

export function readableError(error: unknown, module = 'general') {
  logClientError({ module, error })

  if (!error) return 'Ocurrió un error inesperado.'
  const message =
    typeof error === 'string'
      ? error
      : typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Ocurrió un error inesperado.'

  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (normalized.includes('jwt') || normalized.includes('session')) return 'La sesión expiró. Ingresa nuevamente.'
  if (normalized.includes('permission denied') || normalized.includes('violates row-level security')) {
    return 'No tienes permisos para modificar este registro.'
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'No se pudo conectar con Supabase. Revisa la red e intenta de nuevo.'
  }
  if (normalized.includes('duplicate') || normalized.includes('unique')) return 'Ya existe un registro con esos datos.'
  if (normalized.includes('not found')) return 'No se encontró el registro solicitado.'
  if (normalized.includes('ronda confirmada') || normalized.includes('solo lectura')) return message
  if (normalized.includes('catálogo') || normalized.includes('catalogo')) return moduleFallbacks[module] ?? 'No se pudo cargar el catálogo.'
  if (normalized.includes('nota') || module === 'nota') return 'No se pudo generar o guardar la nota PROA.'

  return moduleFallbacks[module] ?? 'No se pudo completar la operación. Intenta nuevamente o contacta soporte.'
}
