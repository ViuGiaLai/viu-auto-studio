import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  Bell, CheckCircle2, Clapperboard, Clock3, FolderOpen, MoreVertical,
  RefreshCw, Search, Sparkles, Trash2, TriangleAlert,
} from "lucide-react"
import { api, mediaUrl } from "@/services/api"
import { flowApi, globalApi, notificationsApi, queueApi, type AppNotification, type JobRead } from "@/services/pages-api"
import { toast } from "@/hooks/use-toast"
import type { Project, RenderJob } from "@/types"
import { Button } from "@/components/design-system"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/design-system"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/utils/cn"
import { useAppStore } from "@/stores/app-store"
import {
  formatDelta, initialsFromName, overviewBucket, overviewLabel, overviewTone,
  relativeTimeVi,
} from "@/lib/project-status"

type SysSample = { cpu: number; ram: number; backend: number; flow: number }
type SceneCount = { done: number; total: number }

const JOB_KIND_LABEL: Record<string, string> = {
  render: "Render Video",
  rendering: "Render Video",
  voice: "Tổng hợp Voice",
  tts: "Tổng hợp Voice",
  generating_voice: "Tổng hợp Voice",
  audio: "Xuất Âm thanh",
  preparing_media: "Xuất Âm thanh",
  flow: "Phân tích Flow",
  analyze: "Phân tích Flow",
}

function jobLabel(job: { kind?: string; current_step?: string; status?: string }) {
  return JOB_KIND_LABEL[job.kind || ""]
    || JOB_KIND_LABEL[job.current_step || ""]
    || JOB_KIND_LABEL[job.status || ""]
    || job.current_step
    || job.kind
    || "Tác vụ"
}

function elapsedClock(iso?: string | null) {
  if (!iso) return "--:--:--"
  const start = new Date(iso).getTime()
  if (Number.isNaN(start)) return "--:--:--"
  const sec = Math.max(0, Math.floor((Date.now() - start) / 1000))
  const h = String(Math.floor(sec / 3600)).padStart(2, "0")
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0")
  const s = String(sec % 60).padStart(2, "0")
  return `${h}:${m}:${s}`
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 72
  const h = 22
  if (values.length < 2) {
    return <svg width={w} height={h} className="opacity-50"><path d={`M2 ${h / 2} H${w - 2}`} stroke={color} strokeWidth="1.5" fill="none" /></svg>
  }
  const max = Math.max(1, ...values)
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 4) + 2
      const y = h - 3 - (v / max) * (h - 6)
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")
  return <svg width={w} height={h}><path d={d} stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const {
    backendOnline, setSearchOpen, setProjectStatusFilter, setProjectSort,
    projectStatusFilter, projectSort,
  } = useAppStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [jobs, setJobs] = useState<RenderJob[]>([])
  const [queueJobs, setQueueJobs] = useState<JobRead[]>([])
  const [loading, setLoading] = useState(true)
  const [sceneCounts, setSceneCounts] = useState<Record<number, SceneCount>>({})
  const [cpu, setCpu] = useState(0)
  const [ram, setRam] = useState(0)
  const [flowOk, setFlowOk] = useState(false)
  const [samples, setSamples] = useState<SysSample[]>([])
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [menuId, setMenuId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [overviewDelta, setOverviewDelta] = useState<{ producing: number; waiting: number; completed: number; failed: number } | null>(null)
  const [flowHeartbeat, setFlowHeartbeat] = useState<string | null>(null)

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    setRefreshing(true)
    try {
      const [projectList, renderJobs, queue, sys, flow, overview, notifs] = await Promise.all([
        api.listProjects(),
        api.listJobs().catch(() => [] as RenderJob[]),
        queueApi.list({ page_size: 20 }).catch(() => ({ items: [] as JobRead[] })),
        api.systemStats().catch(() => null),
        flowApi.get().catch(() => null),
        globalApi.overview().catch(() => null),
        notificationsApi.list().catch(() => ({ items: [] as AppNotification[], unread: 0 })),
      ])
      setProjects(projectList)
      setJobs(renderJobs)
      setQueueJobs(queue.items || [])
      setNotifications(notifs.items || [])
      setOverviewDelta(overview?.delta ?? null)
      const nextCpu = sys?.cpu_percent ?? 0
      const nextRam = sys?.ram_percent ?? 0
      const heartbeatMs = flow?.heartbeat_at ? Date.now() - new Date(flow.heartbeat_at).getTime() : Number.POSITIVE_INFINITY
      const flowConnected = Boolean(
        (flow?.status && ["online", "connected", "paired", "ok"].includes(flow.status.toLowerCase()))
        || heartbeatMs < 120_000,
      )
      setFlowHeartbeat(flow?.heartbeat_at || null)
      setCpu(nextCpu)
      setRam(nextRam)
      setFlowOk(flowConnected)
      setSamples((prev) => [...prev, {
        cpu: nextCpu,
        ram: nextRam,
        backend: backendOnline ? 100 : 0,
        flow: flowConnected ? 100 : 0,
      }].slice(-20))
      setUpdatedAt(new Date())

      const recent = [...projectList]
        .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
        .slice(0, 8)
      const counts = await Promise.all(recent.map(async (p) => {
        try {
          const scenes = await api.listScenes(p.id)
          return [p.id, { done: scenes.filter((s) => s.image_path || s.video_path || s.media_path || s.status === "completed").length, total: scenes.length }] as const
        } catch {
          return [p.id, { done: 0, total: 0 }] as const
        }
      }))
      setSceneCounts(Object.fromEntries(counts))
    } catch {
      toast({ title: "Không thể tải trung tâm sản xuất", variant: "destructive" })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 8000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = Math.max(1, projects.length)
  const producing = projects.filter((p) => overviewBucket(p.status) === "producing")
  const waiting = projects.filter((p) => overviewBucket(p.status) === "waiting")
  const completed = projects.filter((p) => overviewBucket(p.status) === "completed")
  const failed = projects.filter((p) => overviewBucket(p.status) === "failed")

  const recent = useMemo(() => {
    const list = projectStatusFilter === "all"
      ? projects
      : projects.filter((p) => overviewBucket(p.status) === projectStatusFilter)
    const sorted = [...list]
    if (projectSort === "oldest") sorted.sort((a, b) => (a.updated_at || "").localeCompare(b.updated_at || ""))
    else sorted.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
    return sorted.slice(0, 8)
  }, [projects, projectStatusFilter, projectSort])

  const liveJobs = useMemo(() => {
    const renderActive = jobs.filter((j) => !["completed", "failed", "cancelled"].includes(j.status)).slice(0, 4)
    if (renderActive.length) return renderActive.map((j) => ({
      id: `render-${j.id}`,
      jobId: j.id,
      kind: j.current_step || "render",
      current_step: j.current_step,
      status: j.status,
      progress: j.progress,
      project_id: j.project_id,
      started_at: j.started_at || j.created_at,
    }))
    return queueJobs
      .filter((j) => ["running", "pending", "waiting_for_review"].includes(j.status))
      .slice(0, 4)
      .map((j) => ({
        id: `queue-${j.id}`,
        jobId: j.id,
        kind: j.kind,
        current_step: j.current_step,
        status: j.status,
        progress: j.progress,
        project_id: j.project_id,
        started_at: j.created_at,
      }))
  }, [jobs, queueJobs])

  const unread = notifications.filter((n) => !n.read).length

  const markRead = async (keys: string[]) => {
    if (!keys.length) return
    await notificationsApi.markRead(keys).catch(() => undefined)
    setNotifications((rows) => rows.map((row) => keys.includes(row.key) ? { ...row, read: true } : row))
  }

  const openFolder = async (p: Project) => {
    try {
      const res = await api.openProjectFolder(p.id)
      const electronApi = (window as unknown as { electron?: { openFolder?: (path: string) => void } }).electron
      if (electronApi?.openFolder) electronApi.openFolder(res.path)
      else toast({ title: "Thư mục dự án", description: res.path })
    } catch (e) {
      toast({ title: "Không mở được thư mục", description: String(e), variant: "destructive" })
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteProject(deleteTarget.id)
      toast({ title: "Đã xóa dự án", description: deleteTarget.name })
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast({ title: "Xóa dự án thất bại", description: String(e), variant: "destructive" })
    }
  }

  const stats = [
    {
      key: "producing",
      label: "Đang sản xuất",
      value: producing.length,
      delta: overviewDelta?.producing ?? 0,
      pct: Math.round((producing.length / total) * 100),
      href: "/queue?status=running",
      icon: Clapperboard,
      iconClass: "bg-blue-500/15 text-blue-400",
      bar: "bg-blue-500",
    },
    {
      key: "waiting",
      label: "Chờ duyệt",
      value: waiting.length,
      delta: overviewDelta?.waiting ?? 0,
      pct: Math.round((waiting.length / total) * 100),
      href: "/queue?status=queued",
      icon: Clock3,
      iconClass: "bg-orange-500/15 text-orange-400",
      bar: "bg-orange-400",
    },
    {
      key: "completed",
      label: "Đã hoàn thành",
      value: completed.length,
      delta: overviewDelta?.completed ?? 0,
      pct: Math.round((completed.length / total) * 100),
      href: "/projects",
      icon: CheckCircle2,
      iconClass: "bg-emerald-500/15 text-emerald-400",
      bar: "bg-emerald-500",
    },
    {
      key: "failed",
      label: "Lỗi cần xử lý",
      value: failed.length,
      delta: overviewDelta?.failed ?? 0,
      pct: Math.round((failed.length / total) * 100),
      href: "/queue?status=failed",
      icon: TriangleAlert,
      iconClass: "bg-red-500/15 text-red-400",
      bar: "bg-red-500",
    },
  ]

  const sysRows = [
    { label: "CPU", value: `${Math.round(cpu)}%`, status: cpu < 85 ? "Ổn định" : "Cao", color: "#3b82f6", series: samples.map((s) => s.cpu) },
    { label: "RAM", value: `${Math.round(ram)}%`, status: ram < 85 ? "Ổn định" : "Cao", color: "#a855f7", series: samples.map((s) => s.ram) },
    { label: "Backend", value: backendOnline ? "Online" : "Offline", status: backendOnline ? "Hoạt động" : "Mất kết nối", color: "#22c55e", series: samples.map((s) => s.backend) },
    {
      label: "Flow Connector",
      value: flowOk ? "Ghép" : "Chưa",
      status: flowOk ? (flowHeartbeat ? `Heartbeat ${relativeTimeVi(flowHeartbeat).replace("Cập nhật ", "")}` : "Kết nối tốt") : "Chưa ghép",
      color: "#22d3ee",
      series: samples.map((s) => s.flow),
    },
  ]

  return (
    <div className="min-h-full p-6 xl:p-8">
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-[26px] font-bold tracking-tight text-white">Trung tâm sản xuất</h1>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="relative flex h-10 w-[320px] items-center rounded-lg border border-[#24313A] bg-[#141D22] pl-9 pr-16 text-left text-xs text-slate-500 hover:border-[#3A4B56]"
              >
                <Search className="absolute left-3 h-4 w-4 text-slate-500" />
                Tìm kiếm dự án, nhân vật, flow...
                <kbd className="absolute right-2.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Ctrl + K</kbd>
              </button>
              <Popover open={notifOpen} onOpenChange={setNotifOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-[#24313A] bg-[#141D22] text-slate-300 hover:text-white">
                    <Bell className="h-4 w-4" />
                    {unread > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {unread}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 border-[#24313A] bg-[#141D22] p-0">
                  <div className="flex items-center justify-between border-b border-[#24313A] px-3 py-2">
                    <span className="text-sm font-semibold text-white">Thông báo</span>
                    <button type="button" className="text-[11px] text-cyan-400 hover:underline" onClick={() => void markRead(notifications.map((n) => n.key))}>Đánh dấu đã đọc</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-3 py-8 text-center text-xs text-slate-500">Không có thông báo</div>
                    ) : notifications.map((n) => (
                      <button
                        key={n.key}
                        type="button"
                        onClick={() => { void markRead([n.key]); setNotifOpen(false); navigate(n.href) }}
                        className={cn("block w-full border-b border-white/[0.04] px-3 py-2.5 text-left hover:bg-white/[0.04]", !n.read && "bg-cyan-500/5")}
                      >
                        <div className="text-sm font-medium text-slate-100">{n.title}</div>
                        <div className="truncate text-xs text-slate-500">{n.message}</div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Link
                to="/projects/new"
                className="inline-flex h-10 items-center rounded-lg bg-[#FAAA02] px-4 text-sm font-bold text-slate-950 shadow-[0_8px_24px_rgba(250,170,2,0.22)] hover:brightness-110"
              >
                + Tạo dự án
              </Link>
            </div>
          </div>

          {projects.length === 0 && !loading && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
              <div className="mb-1 text-base font-semibold text-amber-200">Bắt đầu tạo video đầu tiên</div>
              <p className="mb-3 text-sm text-slate-300">Tạo dự án, sinh kịch bản, rồi mở Studio. Các thẻ bên dưới sẽ cập nhật từ SQLite khi có dữ liệu thật.</p>
              <Link to="/projects/new" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#FAAA02] px-4 text-sm font-bold text-slate-950">
                <Sparkles className="h-4 w-4" /> Tạo dự án đầu tiên
              </Link>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  if (s.key === "completed") {
                    setProjectStatusFilter("completed")
                    navigate("/projects")
                    return
                  }
                  navigate(s.href)
                }}
                className="rounded-xl border border-[#24313A] bg-[#141D22] p-4 text-left transition-colors hover:border-[#3A4B56]"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", s.iconClass)}>
                    <s.icon className="h-4.5 w-4.5 h-5 w-5" />
                  </div>
                </div>
                <div className="text-[28px] font-bold leading-none text-white">{loading ? "—" : s.value}</div>
                <div className="mt-1 text-sm text-slate-300">{s.label}</div>
                <div className={cn("mt-2 text-[11px]", s.delta > 0 ? "text-emerald-400" : s.delta < 0 ? "text-red-400" : "text-slate-500")}>{formatDelta(s.delta, overviewDelta != null)}</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={cn("h-full rounded-full", s.bar)} style={{ width: `${s.pct}%` }} />
                </div>
                <div className="mt-1.5 text-[11px] text-slate-500">{s.pct}% tổng dự án</div>
              </button>
            ))}
          </div>

          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Dự án gần đây</h2>
              <div className="flex items-center gap-2">
                <select
                  value={projectStatusFilter}
                  onChange={(e) => setProjectStatusFilter(e.target.value)}
                  className="h-8 rounded-md border border-[#24313A] bg-[#141D22] px-2 text-xs text-slate-200"
                >
                  <option value="all">Tất cả dự án</option>
                  <option value="producing">Đang sản xuất</option>
                  <option value="waiting">Chờ duyệt</option>
                  <option value="completed">Đã hoàn thành</option>
                  <option value="failed">Lỗi</option>
                </select>
                <select
                  value={projectSort}
                  onChange={(e) => setProjectSort(e.target.value as "newest" | "oldest")}
                  className="h-8 rounded-md border border-[#24313A] bg-[#141D22] px-2 text-xs text-slate-200"
                >
                  <option value="newest">Mới nhất</option>
                  <option value="oldest">Cũ nhất</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-[#141D22]" />)}
              </div>
            ) : recent.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#24313A] px-6 py-16 text-center text-sm text-slate-500">
                Chưa có dự án. <Link to="/projects/new" className="text-[#FAAA02] hover:underline">Tạo dự án</Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {recent.map((p) => {
                  const tone = overviewTone(p.status)
                  const scenes = sceneCounts[p.id]
                  const thumb = p.thumbnail_path ? mediaUrl(p.thumbnail_path) : ""
                  return (
                    <div key={p.id} className="group relative overflow-hidden rounded-xl border border-[#24313A] bg-[#141D22]">
                      <Link to={`/projects/${p.id}`} className="block">
                        <div className="relative aspect-[16/10] overflow-hidden bg-[#0c161c]">
                          {thumb ? (
                            <img src={thumb} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none" }} />
                          ) : (
                            <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#1a2830] to-[#0c161c] text-slate-600">
                              <Clapperboard className="h-10 w-10" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                          <span className={cn("absolute left-2.5 top-2.5 rounded px-2 py-0.5 text-[10px] font-semibold", tone.badge)}>
                            {overviewLabel(p.status)}
                          </span>
                          <div className="absolute bottom-2.5 left-3 right-10">
                            <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                          </div>
                        </div>
                      </Link>
                      <button
                        type="button"
                        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-black/40 text-white/80 hover:bg-black/60"
                        onClick={() => setMenuId(menuId === p.id ? null : p.id)}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {menuId === p.id && (
                        <div className="absolute right-2 top-10 z-20 w-40 overflow-hidden rounded-lg border border-[#24313A] bg-[#141D22] shadow-xl">
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/5" onClick={() => navigate(`/projects/${p.id}`)}>Mở Studio</button>
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/5" onClick={() => { setMenuId(null); void openFolder(p) }}><FolderOpen className="h-3.5 w-3.5" />Thư mục</button>
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 hover:bg-white/5" onClick={() => { setMenuId(null); setDeleteTarget(p) }}><Trash2 className="h-3.5 w-3.5" />Xóa</button>
                        </div>
                      )}
                      <div className="space-y-2 p-3 pt-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${Math.min(100, p.progress || 0)}%` }} />
                          </div>
                          <span className="text-[11px] text-slate-400">{Math.round(p.progress || 0)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>{scenes ? `${scenes.done}/${scenes.total} cảnh` : "— cảnh"}</span>
                          <span>{relativeTimeVi(p.updated_at)}</span>
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-[9px] font-bold text-white">
                            {initialsFromName(p.name)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="mt-5 text-center">
              <Link to="/projects" className="text-sm text-cyan-400 hover:underline">Xem tất cả dự án →</Link>
            </div>
          </section>
        </div>

        <aside className="hidden w-[320px] shrink-0 space-y-4 xl:block">
          <div className="rounded-xl border border-[#24313A] bg-[#141D22] p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Trạng thái hệ thống</h3>
            <div className="space-y-3">
              {sysRows.map((row) => (
                <button
                  key={row.label}
                  type="button"
                  onClick={() => navigate(row.label === "Flow Connector" ? "/flow" : "/settings")}
                  className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-white/[0.03]"
                >
                  <div className="w-16 shrink-0">
                    <div className="text-xs font-medium text-slate-200">{row.label}</div>
                    <div className="text-[11px] text-slate-500">{row.status}</div>
                  </div>
                  <div className="flex-1"><Sparkline values={row.series} color={row.color} /></div>
                  <div className="w-10 text-right text-xs font-semibold text-slate-200">{row.value}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#24313A] bg-[#141D22] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Hàng đợi đang hoạt động</h3>
              <Link to="/queue" className="text-[11px] text-cyan-400 hover:underline">Xem</Link>
            </div>
            {liveJobs.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">Không có tác vụ đang chạy</div>
            ) : (
              <div className="space-y-3">
                {liveJobs.map((job) => {
                  const project = projects.find((p) => p.id === job.project_id)
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => navigate(job.status === "failed" ? `/queue?status=failed&job=${job.jobId}` : `/queue?status=running&job=${job.jobId}`)}
                      className="w-full rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5 text-left hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-100">{jobLabel(job)}</div>
                          <div className="truncate text-[11px] text-slate-500">{project?.name || (job.project_id ? `Dự án #${job.project_id}` : "Hệ thống")}</div>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">{elapsedClock(job.started_at)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(100, job.progress || 0)}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-400">{Math.round(job.progress || 0)}%</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
              <span>Cập nhật lúc {updatedAt ? updatedAt.toLocaleTimeString("vi-VN") : "--:--:--"}</span>
              <button type="button" onClick={() => void load()} className="rounded p-1 hover:bg-white/5" title="Làm mới">
                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              </button>
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm border-[#24313A] bg-[#141D22]">
          <DialogHeader>
            <DialogTitle>Xóa dự án?</DialogTitle>
            <DialogDescription>
              Dự án "{deleteTarget?.name}" và dữ liệu thư mục sẽ bị xóa vĩnh viễn.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Hủy</Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>Xóa vĩnh viễn</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
