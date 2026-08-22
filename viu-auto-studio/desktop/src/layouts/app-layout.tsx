import { Outlet } from "react-router-dom"
import { useEffect, useState } from "react"
import { api } from "@/services/api"
import { globalApi } from "@/services/pages-api"
import { useAppStore } from "@/stores/app-store"
import { AppShell, Sidebar } from "@/components/design-system"
import { CommandPalette } from "@/components/command-palette"

const APP_VERSION = "1.0.0"

export function AppLayout() {
  const { backendOnline, setBackendOnline, setOperatorProfile, operatorName, operatorEmail } = useAppStore()
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

  useEffect(() => {
    globalApi.getSettings().then((res) => {
      const s = res.settings || {}
      const name = String(s.operator_name || s.operator_name_suggested || "").trim()
      const email = String(s.operator_email || "").trim()
      setOperatorProfile(name, email)
    }).catch(() => undefined)
  }, [setOperatorProfile])

  return (
    <AppShell sidebar={<Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} backendOnline={backendOnline} version={APP_VERSION} operatorName={operatorName} operatorEmail={operatorEmail} />}>
      <CommandPalette />
      <Outlet />
    </AppShell>
  )
}
