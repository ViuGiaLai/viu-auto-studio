import * as React from "react"
import { NavLink, useLocation } from "react-router-dom"
import {
  BarChart3, FolderKanban, Hourglass, Image as ImageIcon, LayoutDashboard,
  Link2, Mic, PanelLeftClose, PanelLeftOpen, Settings, Sparkles, Users, Wifi, WifiOff,
} from "lucide-react"
import { cn } from "@/utils/cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog as Modal, DialogContent as ModalContent, DialogDescription as ModalDescription,
  DialogFooter as ModalFooter, DialogHeader as ModalHeader, DialogTitle as ModalTitle,
  DialogTrigger as ModalTrigger,
} from "@/components/ui/dialog"
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card"

export const APP_NAV_ITEMS = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { to: "/projects", label: "Dự án", icon: FolderKanban },
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/queue", label: "Hàng đợi", icon: Hourglass },
  { to: "/library", label: "Thư viện", icon: ImageIcon },
  { to: "/voices", label: "Giọng đọc", icon: Mic },
  { to: "/characters", label: "Nhân vật", icon: Users },
  { to: "/flow", label: "Flow", icon: Link2 },
  { to: "/analytics", label: "Phân tích", icon: BarChart3 },
  { to: "/skills", label: "Skill Lab", icon: Sparkles },
  { to: "/settings", label: "Cài đặt", icon: Settings },
] as const

export const STUDIO_STAGES = [
  { value: "idea", label: "Ý tưởng" },
  { value: "script", label: "Kịch bản & Giọng" },
  { value: "storyboard", label: "Phân cảnh Visual" },
  { value: "characters", label: "Nhân vật" },
  { value: "media", label: "Media" },
  { value: "publish", label: "Dựng phim" },
  { value: "subtitles", label: "Xuất bản" },
] as const

function PlayLogo({ size = 32 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M13 6 33 19 13 33Z" stroke="#FAAA02" strokeWidth="5" strokeLinejoin="round" /></svg>
}

export function AppShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex h-screen min-h-[720px] overflow-hidden bg-[#0B0F12] text-[#E7EDF1]">{sidebar}<main className="min-w-0 flex-1 overflow-y-auto bg-[#0B0F12]">{children}</main></div>
}

export function Sidebar({ collapsed, onToggle, backendOnline, version, operatorName = "", operatorEmail = "" }: {
  collapsed: boolean; onToggle: () => void; backendOnline: boolean | null; version: string
  operatorName?: string; operatorEmail?: string
}) {
  const location = useLocation()
  const isActive = (to: string, exact?: boolean) => {
    if (to === "/studio") return location.pathname === "/studio"
    if (to === "/projects") return location.pathname === "/projects" || location.pathname === "/projects/new" || /^\/projects\/\d+/.test(location.pathname)
    return exact ? location.pathname === to : location.pathname.startsWith(to)
  }
  return (
    <aside className={cn("flex shrink-0 flex-col border-r border-[#24313A] bg-[#0C1419] transition-[width] duration-200", collapsed ? "w-[72px]" : "w-[236px]")}>
      <div className={cn("flex h-[68px] items-center border-b border-[#24313A] px-4", collapsed ? "justify-center" : "gap-2.5")}>
        <PlayLogo />
        {!collapsed && <div className="min-w-0 flex-1"><div className="flex items-center gap-2 whitespace-nowrap text-[14px] font-bold tracking-[-0.01em] text-white">Viu Auto Studio<span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400">v{version}</span></div></div>}
      </div>
      <nav className="flex-1 space-y-1 px-2.5 py-4" aria-label="Điều hướng chính">
        {APP_NAV_ITEMS.map((item) => {
          const active = isActive(item.to, "exact" in item ? item.exact : false)
          return <NavLink key={item.to} to={item.to} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} className={cn("group flex h-10 items-center gap-3 rounded-md border px-3 text-[13px] font-medium transition-colors", collapsed && "justify-center px-0", active ? "border-cyan-500/35 bg-[#073344] text-cyan-100 shadow-[inset_3px_0_0_#00B8F0]" : "border-transparent text-[#9AABB6] hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-white")}>
            <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-[#00B8F0]" : "text-[#8395A1] group-hover:text-white")} />{!collapsed && <span>{item.label}</span>}
          </NavLink>
        })}
      </nav>
      <div className="mt-auto border-t border-[#24313A] p-3">
        {!collapsed && (
          <div className="mb-2 rounded-xl border border-[#24313A] bg-[#101A20] p-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                {(operatorName || "U").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "U"}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-white">{operatorName || "Chưa đặt tên"}</div>
                <div className="truncate text-[11px] text-[#8395A1]">{operatorEmail || "Chưa đặt email"}</div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between rounded-lg border border-[#24313A] bg-[#0C1419] px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-medium">
                {backendOnline ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-red-400" />}
                <span className={backendOnline ? "text-emerald-300" : "text-red-300"}>
                  {backendOnline === null ? "Backend: …" : backendOnline ? "Backend: Online" : "Backend: Offline"}
                </span>
              </span>
              <span className="text-[10px] font-semibold text-[#6F8290]">v{version}</span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mb-2 flex flex-col items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              {(operatorName || "U")[0]?.toUpperCase() || "U"}
            </div>
            <span className={cn("h-2 w-2 rounded-full", backendOnline ? "bg-emerald-400" : "bg-red-400")} />
          </div>
        )}
        <button type="button" onClick={onToggle} className="flex h-9 w-full items-center justify-center gap-2 rounded-md text-xs font-medium text-[#81929D] hover:bg-white/[0.04] hover:text-white">{collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}{!collapsed && "Thu gọn"}</button>
      </div>
    </aside>
  )
}

export function ProjectHeader({ title, subtitle, status, actions }: { title: string; subtitle?: React.ReactNode; status?: React.ReactNode; actions?: React.ReactNode }) {
  return <header className="flex min-h-[64px] items-center justify-between gap-4 border-b border-[#24313A] bg-[#0D151A] px-5 py-3"><div className="min-w-0"><div className="flex min-w-0 items-center gap-2.5"><h1 className="truncate text-[18px] font-bold tracking-[-0.018em] text-white">{title}</h1>{status}</div>{subtitle && <div className="mt-1 flex items-center gap-2 text-[11px] text-[#8395A1]">{subtitle}</div>}</div>{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</header>
}

export function StageNavigation({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const activeIndex = STUDIO_STAGES.findIndex((stage) => stage.value === value)
  return <div className="border-b border-[#24313A] bg-[#0C1419] px-5 py-2.5"><div className="grid grid-cols-7 gap-1.5" role="tablist" aria-label="Quy trình Studio">{STUDIO_STAGES.map((stage, index) => {
    const active = stage.value === value; const complete = index < activeIndex
    return <button key={stage.value} type="button" role="tab" aria-selected={active} onClick={() => onValueChange(stage.value)} className={cn("flex h-9 min-w-0 items-center justify-center gap-2 rounded-md border px-2 text-[11px] font-semibold transition-colors", active && "border-cyan-500/50 bg-[#063A4D] text-cyan-100 shadow-[0_0_16px_rgba(0,184,240,0.1)]", complete && "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300", !active && !complete && "border-[#26343D] bg-[#111B21] text-[#8395A1] hover:border-[#3A4B56] hover:text-white")}><span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold", active && "border-cyan-400 bg-cyan-500/15 text-cyan-200", complete && "border-emerald-400/50 bg-emerald-500/15 text-emerald-300", !active && !complete && "border-[#3A4A54] text-[#72838E]")}>{complete ? "✓" : index + 1}</span><span className="truncate">{stage.label}</span></button>
  })}</div></div>
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) { return <table className={cn("w-full border-separate border-spacing-0 text-[12px]", className)} {...props} /> }

export function StatusBadge({ status, children }: { status: string; children?: React.ReactNode }) {
  const tone = status === "completed" || status === "verified" || status === "online" ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300" : status === "failed" || status === "error" || status === "offline" ? "border-red-500/40 bg-red-500/10 text-red-300" : status === "running" || status === "active" ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200" : status === "waiting_for_review" || status === "pending" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-slate-500/30 bg-slate-500/10 text-slate-300"
  return <span className={cn("inline-flex h-5 items-center rounded border px-2 text-[10px] font-semibold", tone)}>{children ?? status}</span>
}

const Dialog = Modal
const DialogContent = ModalContent
const DialogDescription = ModalDescription
const DialogFooter = ModalFooter
const DialogHeader = ModalHeader
const DialogTitle = ModalTitle
const DialogTrigger = ModalTrigger

export { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle, ModalTrigger, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue }
