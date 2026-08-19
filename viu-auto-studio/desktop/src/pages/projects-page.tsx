import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Plus, Search, Trash2, FolderOpen, Play, ChevronDown } from "lucide-react"
import { api, mediaUrl } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import type { Project } from "@/types"
import { STATUS_LABELS } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Card, CardContent } from "@/components/design-system"
import { Progress } from "@/components/ui/progress"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/design-system"

type SortKey = "newest" | "oldest" | "size"
type TypeFilter = "all" | "long" | "short" | "draft"
type StatusFilter = "all" | "running" | "queued" | "completed" | "failed"

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string; count: (list: Project[]) => number }> = [
  { value: "all", label: "Tất cả", count: (list) => list.length },
  { value: "long", label: "🎬 Video dài", count: (list) => list.filter((p) => p.video_type === "long").length },
  { value: "short", label: "📱 Shorts", count: (list) => list.filter((p) => p.video_type === "short").length },
  { value: "draft", label: "📝 Bản nháp", count: (list) => list.filter((p) => p.status === "draft").length },
]

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string; count: (list: Project[]) => number }> = [
  { value: "all", label: "Tất cả", count: (list) => list.length },
  {
    value: "running",
    label: "Đang chạy",
    count: (list) =>
      list.filter((p) =>
        ["generating_voice", "preparing_media", "generating_subtitles", "rendering"].includes(p.status),
      ).length,
  },
  {
    value: "queued",
    label: "Đang chờ",
    count: (list) => list.filter((p) => ["queued", "pending"].includes(p.status)).length,
  },
  { value: "completed", label: "Hoàn tất", count: (list) => list.filter((p) => p.status === "completed").length },
  { value: "failed", label: "Lỗi", count: (list) => list.filter((p) => p.status === "failed").length },
]

const STATUS_VARIANT: Record<string, "success" | "destructive" | "secondary" | "warning"> = {
  completed: "success",
  failed: "destructive",
  cancelled: "secondary",
  draft: "secondary",
  queued: "secondary",
  pending: "secondary",
}

const RUNNING_STATUSES = ["generating_voice", "preparing_media", "generating_subtitles", "rendering"]

function statusVariant(p: Project): "success" | "destructive" | "secondary" | "warning" {
  if (RUNNING_STATUSES.includes(p.status)) return "warning"
  return STATUS_VARIANT[p.status] ?? "secondary"
}

function matchesStatusFilter(p: Project, f: StatusFilter): boolean {
  if (f === "all") return true
  if (f === "running") return RUNNING_STATUSES.includes(p.status)
  if (f === "queued") return ["queued", "pending"].includes(p.status)
  return p.status === f
}

function matchesTypeFilter(p: Project, f: TypeFilter): boolean {
  if (f === "all") return true
  if (f === "draft") return p.status === "draft"
  return p.video_type === f
}

const formatSize = (bytes = 0) => {
  if (bytes <= 0) return "—"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sort, setSort] = useState<SortKey>("newest")
  const [sortOpen, setSortOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  const load = () => {
    setLoading(true)
    api
      .listProjects(search || undefined, statusFilter === "all" ? undefined : statusFilter)
      .then(setProjects)
      .catch(() => toast({ title: "Không thể tải danh sách dự án", variant: "destructive" }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const listForFilters = useMemo(() => {
    if (statusFilter !== "all") return projects
    return projects.filter(
      (p) => matchesTypeFilter(p, typeFilter) && (!search || p.name.toLowerCase().includes(search.toLowerCase())),
    )
  }, [projects, typeFilter, search, statusFilter])

  const sorted = useMemo(() => {
    const arr = [...listForFilters]
    if (sort === "newest") arr.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    else if (sort === "oldest") arr.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
    else arr.sort((a, b) => (b.size_bytes ?? 0) - (a.size_bytes ?? 0))
    return arr
  }, [listForFilters, sort])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteProject(deleteTarget.id)
      toast({ title: "Đã xóa dự án", description: deleteTarget.name })
      setDeleteTarget(null)
      load()
    } catch (e) {
      toast({ title: "Xóa dự án thất bại", description: String(e), variant: "destructive" })
    }
  }

  const handleOpenFolder = async (p: Project) => {
    try {
      const res = await api.openProjectFolder(p.id)
      const electronApi = (window as unknown as { electron?: { openFolder?: (path: string) => void } }).electron
      if (electronApi?.openFolder) {
        electronApi.openFolder(res.path)
      } else {
        toast({ title: "Thư mục dự án", description: res.path })
      }
    } catch (e) {
      toast({ title: "Không mở được thư mục", description: String(e), variant: "destructive" })
    }
  }

  const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
    { value: "newest", label: "Mới nhất" },
    { value: "oldest", label: "Cũ nhất" },
    { value: "size", label: "Dung lượng" },
  ]

  const thumbnailFor = (p: Project) => {
    if (p.thumbnail_path) return mediaUrl(p.thumbnail_path)
    return `/api/projects/${p.id}/preview`
  }

  return (
    <div className="min-h-full space-y-6 p-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dự án</h1>
          <p className="mt-1 text-sm text-slate-500">Danh sách kênh chiến dịch của bạn</p>
        </div>
        <Link
          to="/projects/new"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-[#d9940a] to-[#faaa02] px-4 text-sm font-medium text-white shadow-lg shadow-amber-500/20 transition-all hover:shadow-amber-500/30 hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Project Mới
        </Link>
      </div>

      {/* Search / sort / filter card */}
      <div className="vas-card p-5">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Tìm kiếm dự án..."
            className="border-white/10 bg-white/[0.03] pl-9 text-sm text-slate-200 placeholder:text-slate-600"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Sắp xếp:</span>
            <div className="relative">
              <Button variant="ghost"
                onClick={() => setSortOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-white/[0.06]"
              >
                {SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Mới nhất"}
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </Button>
              {sortOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-white/10 bg-[#141d22] shadow-xl">
                  {SORT_OPTIONS.map((s) => (
                    <Button variant="ghost"
                      key={s.value}
                      onClick={() => { setSort(s.value); setSortOpen(false) }}
                      className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                        sort === s.value ? "bg-amber-500/15 text-amber-300 font-medium" : "text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Loại:</span>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_FILTERS.map((f) => (
                <Button variant="ghost"
                  key={f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    typeFilter === f.value
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-white/[0.04] text-slate-400 border border-transparent hover:bg-white/[0.08]"
                  }`}
                >
                  {f.label} ({f.count(projects)})
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Trạng thái:</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <Button variant="ghost"
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    statusFilter === f.value
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-white/[0.04] text-slate-400 border border-transparent hover:bg-white/[0.08]"
                  }`}
                >
                  {f.label} ({f.count(projects)})
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="vas-card h-28 animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-white/10 bg-white/[0.01] px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-slate-600">
            <Plus className="h-6 w-6 text-slate-500" />
          </div>
          <div className="text-lg font-semibold text-slate-200">Tạo project mới</div>
          <div className="mt-1 text-sm text-slate-500">
            Khởi tạo kênh AI Studio tự động hoặc Recap video Remake
          </div>
          <Link to="/projects/new" className="mt-4">
            <Button className="gap-1.5 bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white shadow-lg shadow-amber-500/20">
              <Plus className="h-4 w-4" />
              Project Mới
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p) => (
            <div key={p.id} className="vas-card vas-card-hover group overflow-hidden transition-all duration-200">
              {/* Thumbnail */}
              <Link to={`/projects/${p.id}`} className="block">
                <div className="relative aspect-video w-full overflow-hidden bg-[#0c161c]">
                  {p.aspect_ratio === "9:16" ? (
                    <div className="flex h-full items-center justify-center bg-gradient-to-b from-[#111827] to-[#0a0e1a]">
                      <FolderOpen className="h-10 w-10 text-slate-600/40" />
                    </div>
                  ) : (
                    <img
                      src={thumbnailFor(p)}
                      alt={p.name}
                      className="h-full w-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none" }}
                    />
                  )}
                  <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                    {p.aspect_ratio}
                  </span>
                  <Badge
                    variant={statusVariant(p)}
                    className={`status-badge absolute right-2 top-2 ${
                      p.status === "completed" ? "status-completed" :
                      p.status === "failed" ? "status-failed" :
                      RUNNING_STATUSES.includes(p.status) ? "status-producing" :
                      p.status === "draft" ? "status-draft" : "status-pending"
                    }`}
                  >
                    {RUNNING_STATUSES.includes(p.status) && (
                      <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                    )}
                    {STATUS_LABELS[p.status] || p.status}
                  </Badge>
                </div>
              </Link>
              <div className="space-y-2 p-4 pt-3.5">
                <Link to={`/projects/${p.id}`} className="block">
                  <div className="truncate text-sm font-semibold text-slate-100 transition-colors group-hover:text-amber-300">
                    {p.name}
                  </div>
                </Link>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={p.video_type === "long" ? "text-amber-400" : "text-cyan-400"}>
                    {p.video_type === "long" ? "🎬 Video dài" : "📱 Shorts"}
                  </span>
                  <span>·</span>
                  <span className="truncate">{p.topic || "Không có chủ đề"}</span>
                </div>
                <Progress value={p.progress} className="h-1 [&>div]:bg-gradient-to-r [&>div]:from-amber-600 [&>div]:to-amber-400" />
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>{p.target_duration}s mục tiêu · {formatSize(p.size_bytes)}</span>
                  <span>{new Date(p.updated_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                </div>
                <div className="flex items-center gap-1.5 border-t border-white/5 pt-3">
                  <Link to={`/projects/${p.id}`} className="flex-1">
                    <Button size="sm" className="w-full gap-1.5 bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-xs text-white hover:brightness-110">
                      <Play className="h-3 w-3" />
                      Mở
                    </Button>
                  </Link>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 shrink-0 border-white/10 bg-transparent text-slate-400 hover:text-slate-200"
                    onClick={() => handleOpenFolder(p)}
                    title="Mở thư mục dự án"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 shrink-0 border-white/10 bg-transparent text-slate-500 hover:border-red-500/30 hover:text-red-400"
                    onClick={() => setDeleteTarget(p)}
                    title="Xóa dự án"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {/* Dashed "create new" card */}
          <Link to="/projects/new">
            <div className="flex h-full min-h-[240px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-700/50 bg-white/[0.01] transition-all duration-200 hover:border-amber-500/40 hover:bg-amber-500/[0.03]">
              <Plus className="h-8 w-8 text-slate-600" />
              <span className="text-sm font-medium text-slate-400">Tạo project mới</span>
            </div>
          </Link>
        </div>
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm border-white/10 bg-[#141d22]">
          <DialogHeader>
            <DialogTitle className="text-left text-slate-100">Xóa dự án?</DialogTitle>
            <DialogDescription className="text-left text-slate-400">
              Dự án "{deleteTarget?.name}" và toàn bộ dữ liệu thư mục dự án sẽ bị xóa vĩnh viễn.
              Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-white/10 text-slate-300" onClick={() => setDeleteTarget(null)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Xóa vĩnh viễn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
