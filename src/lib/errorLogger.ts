type ErrorLogInput = {
  module: string
  code?: string
  error: unknown
  userId?: string | null
  ipsId?: string | null
}

function sanitizeMessage(error: unknown) {
  const message =
    typeof error === 'string'
      ? error
      : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Unexpected error'

  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{5,}\b/g, '[number]')
    .slice(0, 240)
}

export function logClientError(input: ErrorLogInput) {
  const payload = {
    type: 'client_error',
    module: input.module,
    timestamp: new Date().toISOString(),
    code: input.code ?? 'UNHANDLED',
    user_id: input.userId ?? null,
    ips_id: input.ipsId ?? null,
    message: sanitizeMessage(input.error),
  }

  if (import.meta.env.DEV) {
    console.warn('[PROA]', payload)
  }
}
