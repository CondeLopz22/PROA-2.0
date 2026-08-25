import { useEffect, useMemo, useState } from 'react'
import { getAllowedIps } from '../../services/ipsService'
import { getUserProfile } from '../../services/profileService'
import { readableError } from '../../services/supabaseErrors'
import type { Ips } from '../../types/domain'
import { useAuth } from '../auth/authContext'
import { IpsContext, type IpsContextValue } from './ipsContext'

export function IpsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [allowedIps, setAllowedIps] = useState<Ips[]>([])
  const [activeIps, setActiveIpsState] = useState<Ips | null>(null)
  const [status, setStatus] = useState<IpsContextValue['status']>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let mounted = true
    const userId = user.id

    async function loadIps() {
      setStatus('loading')
      setError(null)
      try {
        const profile = await getUserProfile(userId)
        if (!mounted) return
        if (!profile) {
          setAllowedIps([])
          setActiveIpsState(null)
          setStatus('no_profile')
          return
        }
        const ips = await getAllowedIps(userId)
        if (!mounted) return
        setAllowedIps(ips)
        if (!ips.length) {
          setActiveIpsState(null)
          setStatus('empty')
          return
        }
        setActiveIpsState(ips[0])
        setStatus('ready')
      } catch (loadError) {
        if (!mounted) return
        setStatus('error')
        setError(readableError(loadError))
      }
    }

    loadIps()
    return () => {
      mounted = false
    }
  }, [user])

  const value = useMemo<IpsContextValue>(
    () => ({
      status,
      allowedIps,
      activeIps,
      error,
      setActiveIps: (ips) => {
        setActiveIpsState(ips)
      },
    }),
    [activeIps, allowedIps, error, status],
  )

  return <IpsContext.Provider value={value}>{children}</IpsContext.Provider>
}
