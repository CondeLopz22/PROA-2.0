import { useEffect, useMemo, useState } from 'react'
import { getAllActiveIps, getAllowedIps } from '../../services/ipsService'
import { getActiveMembershipForIps, normalizeProductUserType } from '../../services/permissionService'
import { getUserProfile } from '../../services/profileService'
import { readableError } from '../../services/supabaseErrors'
import type { Ips, ProductUserType, UserIpsMembership, UserProfile } from '../../types/domain'
import { useAuth } from '../auth/authContext'
import { IpsContext, type IpsContextValue } from './ipsContext'

export function IpsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [allowedIps, setAllowedIps] = useState<Ips[]>([])
  const [activeIps, setActiveIpsState] = useState<Ips | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [activeMembership, setActiveMembership] = useState<UserIpsMembership | null>(null)
  const [userType, setUserType] = useState<ProductUserType>('sin_acceso')
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
          setProfile(null)
          setActiveMembership(null)
          setUserType('sin_acceso')
          setStatus('no_profile')
          return
        }
        setProfile(profile)
        const ips = profile.es_admin_global ? await getAllActiveIps() : await getAllowedIps(userId)
        if (!mounted) return
        setAllowedIps(ips)
        if (!ips.length) {
          setActiveIpsState(null)
          setActiveMembership(null)
          setUserType('sin_acceso')
          setStatus('empty')
          return
        }
        const firstIps = ips[0]
        const membership = await getActiveMembershipForIps(userId, firstIps.id)
        if (!mounted) return
        setActiveIpsState(firstIps)
        setActiveMembership(membership)
        setUserType(normalizeProductUserType(profile, membership))
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
      profile,
      activeMembership,
      userType,
      error,
      setActiveIps: (ips) => {
        setActiveIpsState(ips)
        if (!user) return
        getActiveMembershipForIps(user.id, ips.id)
          .then((membership) => {
            setActiveMembership(membership)
            setUserType(normalizeProductUserType(profile, membership))
          })
          .catch(() => {
            setActiveMembership(null)
            setUserType('sin_acceso')
          })
      },
    }),
    [activeIps, activeMembership, allowedIps, error, profile, status, user, userType],
  )

  return <IpsContext.Provider value={value}>{children}</IpsContext.Provider>
}
