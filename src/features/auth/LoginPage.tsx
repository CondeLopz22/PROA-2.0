import { useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, LockKeyhole, Mail } from 'lucide-react'
import { getSupabaseConfigError, supabase } from '../../lib/supabase'
import { readableError } from '../../services/supabaseErrors'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(getSupabaseConfigError())

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(readableError(signInError))
    setLoading(false)
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand-mark">
          <Activity size={28} />
        </div>
        <p className="eyebrow">PROA V2</p>
        <h1>Ingreso profesional</h1>
        <p className="muted">Gestión Multi-IPS del Programa de Optimización de Antimicrobianos.</p>

        <form className="form-stack" onSubmit={submit}>
          <label>
            Correo
            <span className="input-with-icon">
              <Mail size={18} />
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </span>
          </label>
          <label>
            Contraseña
            <span className="input-with-icon">
              <LockKeyhole size={18} />
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </span>
          </label>
          {error ? <div className="alert error">{error}</div> : null}
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  )
}
