import { Outlet } from "react-router-dom"
import { useEffect, useState } from "react"
import { api } from "@/services/api"
import { useAppStore } from "@/stores/app-store"
import { AppShell, Sidebar } from "@/components/design-system"

const APP_VERSION = "2.0.0"

export function AppLayout() {
  const { backendOnline, setBackendOnline } = useAppStore()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const check = async () => {
      try { await api.health(); setBackendOnline(true) }
      catch { setBackendOnline(false) }
    }
    void check()
    const interval = window.setInterval(check, 5000)
    return () => window.clearInterval(interval)
  }, [setBackendOnline])

  return <AppShell sidebar={<Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} backendOnline={backendOnline} version={APP_VERSION} />}><Outlet /></AppShell>
}
