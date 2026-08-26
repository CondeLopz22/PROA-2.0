type ErrorLogInput = {
  module: string
  code?: string
  error: unknown
}

function technicalMessage(error: unknown) {
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message
  return 'Unexpected error'
}

export function logClientError({ module, code = 'UNHANDLED', error }: ErrorLogInput) {
  const message = technicalMessage(error)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{5,}\b/g, '[number]')
    .slice(0, 240)

  if (import.meta.env.DEV) {
    console.warn('[PROA]', {
      type: 'client_error',
      module,
      code,
      timestamp: new Date().toISOString(),
      message,
    })
  }
}
