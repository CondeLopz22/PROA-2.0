import { createContext, useContext } from 'react'
import type { Ips, ProductUserType, UserIpsMembership, UserProfile } from '../../types/domain'

export type IpsContextValue = {
  status: 'loading' | 'ready' | 'no_profile' | 'empty' | 'error'
  allowedIps: Ips[]
  activeIps: Ips | null
  profile: UserProfile | null
  activeMembership: UserIpsMembership | null
  userType: ProductUserType
  error: string | null
  setActiveIps: (ips: Ips) => void
}

export const IpsContext = createContext<IpsContextValue | null>(null)

export function useIps() {
  const value = useContext(IpsContext)
  if (!value) throw new Error('useIps must be used inside IpsProvider')
  return value
}
