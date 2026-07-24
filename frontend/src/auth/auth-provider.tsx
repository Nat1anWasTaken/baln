import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setAccessToken } from '@/lib/api'
import type { components } from '@/lib/api-schema'
type User = components['schemas']['User']; type Auth = { user: User|null; loading:boolean; reload:()=>Promise<void>; logout:()=>Promise<void> }
const Context = createContext<Auth|null>(null)
export function AuthProvider({children}:{children:ReactNode}) { const [user,setUser]=useState<User|null>(null); const [loading,setLoading]=useState(true)
  async function reload(){ try { setUser(await api<User>('/auth/me')) } catch { setUser(null) } finally { setLoading(false) } }
  useEffect(()=>{ void reload() },[])
  async function logout(){ await api('/auth/logout',{method:'POST'}); setAccessToken(null); setUser(null) }
  return <Context.Provider value={{user,loading,reload,logout}}>{children}</Context.Provider> }
export function useAuth(){const value=useContext(Context); if(!value) throw new Error('AuthProvider missing'); return value}
