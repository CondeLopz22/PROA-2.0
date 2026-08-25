import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!mounted) return
      if (!sessionData.session) {
        setSession(null)
        setStatus('anonymous')
        return
      }

      const { data: userData, error } = await supabase.auth.getUser()
      if (!mounted) return
      if (error || !userData.user) {
        setSession(null)
        setStatus('anonymous')
        await supabase.auth.signOut()
        return
      }
      setSession(sessionData.session)
      setStatus('authenticated')
    }

    loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setStatus(nextSession ? 'authenticated' : 'anonymous')
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
