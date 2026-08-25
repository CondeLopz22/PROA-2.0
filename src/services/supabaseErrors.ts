export function readableError(error: unknown) {
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
    return 'Acceso rechazado por las políticas de seguridad de la IPS.'
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'No se pudo conectar con Supabase. Revisa la red e intenta de nuevo.'
  }
  if (normalized.includes('duplicate') || normalized.includes('unique')) return 'Ya existe un registro con esos datos.'
  if (normalized.includes('not found')) return 'No se encontró el registro solicitado.'

  return message
}
