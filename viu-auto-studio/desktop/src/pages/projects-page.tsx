import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Plus, Search, Trash2, FolderOpen, Play, ChevronDown, Sparkles, Film } from "lucide-react"
import { api, openLocalPath, selectDirectory } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import type { Project } from "@/types"
import { useAppStore } from "@/stores/app-store"
import { STATUS_LABELS } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/design-system"
import { Progress } from "@/components/ui/progress"
import { ProjectThumbnail } from "@/components/project-thumbnail"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/design-system"
import { cn } from "@/utils/cn"

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
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const { projectStatusFilter, projectSort, setProjectStatusFilter, setProjectSort } = useAppStore()
  const mappedStatus: StatusFilter =
    projectStatusFilter === "producing" ? "running"
      : projectStatusFilter === "waiting" ? "queued"
        : projectStatusFilter === "completed" || projectStatusFilter === "failed"
          ? projectStatusFilter
          : "all"
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(mappedStatus)
  const [sort, setSort] = useState<SortKey>(projectSort)
  const [sortOpen, setSortOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  // Create Project Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newTopic, setNewTopic] = useState("")
  const [newProjectType, setNewProjectType] = useState<"ai_studio" | "recap">("ai_studio")
  const [newAspect, setNewAspect] = useState<"16:9" | "9:16">("16:9")
  const [newLanguage, setNewLanguage] = useState("vi")
  const [newOutputFolder, setNewOutputFolder] = useState("")
  const [creating, setCreating] = useState(false)

  const load = () => {
    setLoading(true)
    api
      .listProjects(search || undefined, undefined, sort === "size")
      .then(setProjects)
      .catch(() => toast({ title: "Không thể tải danh sách dự án", variant: "destructive" }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sort])

  const listForFilters = useMemo(() => {
    return projects.filter(
      (p) =>
        matchesStatusFilter(p, statusFilter) &&
        matchesTypeFilter(p, typeFilter) &&
        (!search || p.name.toLowerCase().includes(search.toLowerCase())),
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
      const opened = await openLocalPath(res.path)
      if (!opened.ok) throw new Error(opened.message)
    } catch (e) {
      toast({ title: "Không mở được thư mục", description: String(e), variant: "destructive" })
    }
  }

  const handleSelectFolder = async () => {
    try {
      const res = await selectDirectory()
      if (typeof res === "string" && res) setNewOutputFolder(res)
    } catch {
      // User cancelled
    }
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) {
      toast({ title: "Vui lòng nhập tên dự án", variant: "destructive" })
      return
    }

    setCreating(true)
    try {
      const res = await api.createProject({
        name: newName.trim(),
        topic: newTopic.trim() || newName.trim(),
        video_type: newAspect === "16:9" ? "long" : "short",
        aspect_ratio: newAspect,
        language: newLanguage,
        target_duration: newAspect === "9:16" ? 60 : 180,
        project_type: newProjectType,
        output_folder: newOutputFolder.trim() || undefined,
      })

      toast({ title: "Đã tạo dự án thành công", description: newName.trim() })
      setCreateModalOpen(false)
      navigate(`/projects/${res.id}`)
    } catch (err) {
      toast({ title: "Không thể tạo dự án", description: String(err), variant: "destructive" })
      setCreating(false)
    }
  }

  const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
    { value: "newest", label: "Mới nhất" },
    { value: "oldest", label: "Cũ nhất" },
    { value: "size", label: "Dung lượng" },
  ]

  return (
    <div className="min-h-full space-y-6 p-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dự án</h1>
          <p className="mt-1 text-sm text-slate-500">Danh sách kênh chiến dịch của bạn</p>
        </div>
        <Button
          onClick={() => {
            setNewName("")
            setNewTopic("")
            setNewOutputFolder("")
            setCreateModalOpen(true)
          }}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-[#d9940a] to-[#faaa02] px-4 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:shadow-amber-500/30 hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Project Mới
        </Button>
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
                      onClick={() => { setSort(s.value); setProjectSort(s.value); setSortOpen(false) }}
                      className={`block w-full px-3 py-2 text-left text-sm transition-colors ${sort === s.value ? "bg-amber-500/15 text-amber-300 font-medium" : "text-slate-300 hover:bg-white/5"
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
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${typeFilter === f.value
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                      : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                    }`}
                >
                  {f.label} ({f.count(projects)})
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Status filter bar */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3">
          <span className="mr-1 text-xs font-medium text-slate-500">Trạng thái:</span>
          {STATUS_FILTERS.map((f) => (
            <Button variant="ghost"
              key={f.value}
              onClick={() => {
                setStatusFilter(f.value)
                setProjectStatusFilter(
                  f.value === "running" ? "producing"
                    : f.value === "queued" ? "waiting"
                      : f.value === "completed" || f.value === "failed"
                        ? f.value
                        : "all",
                )
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${statusFilter === f.value
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
            >
              {f.label} ({f.count(projects)})
            </Button>
          ))}
        </div>
      </div>

      {/* Grid of projects */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl border border-white/5 bg-white/[0.02]" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="vas-card p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-slate-500">
            <Search className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-slate-300">Không tìm thấy dự án nào</p>
          <p className="mt-1 text-xs text-slate-500">
            {search ? "Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc" : "Bắt đầu bằng cách tạo dự án mới"}
          </p>
          {!search && (
            <Button
              onClick={() => {
                setNewName("")
                setNewTopic("")
                setNewOutputFolder("")
                setCreateModalOpen(true)
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-amber-400"
            >
              <Plus className="h-4 w-4" />
              Tạo Project Mới
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {sorted.map((p) => (
            <div
              key={p.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121B22] transition-all duration-200 hover:border-amber-500/40 hover:shadow-lg hover:shadow-black/40"
            >
              {/* Thumbnail banner */}
              <Link to={`/projects/${p.id}`} className="relative block h-36 overflow-hidden bg-slate-900">
                <ProjectThumbnail project={p} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#121B22] via-transparent to-transparent opacity-80" />

                {/* Aspect ratio badge */}
                <span className="absolute left-2.5 top-2.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 backdrop-blur-sm">
                  {p.aspect_ratio || (p.video_type === "short" ? "9:16" : "16:9")}
                </span>

                {/* Status badge */}
                <div className="absolute right-2.5 top-2.5">
                  <Badge variant={statusVariant(p)} className="text-[10px]">
                    {STATUS_LABELS[p.status] ?? p.status}
                  </Badge>
                </div>
              </Link>

              {/* Card body */}
              <div className="flex flex-1 flex-col p-4">
                <Link to={`/projects/${p.id}`} className="group-hover:text-amber-300">
                  <h3 className="line-clamp-1 font-semibold text-slate-100 text-sm">{p.name}</h3>
                </Link>

                <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                  {p.topic || (p.video_type === "short" ? "Shorts / TikTok" : "Video dài")}
                </p>

                {/* Size and scene info */}
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{formatSize(p.size_bytes)}</span>
                  <span>{p.target_duration ? `${p.target_duration}s` : "—"}</span>
                </div>

                {/* Card actions footer */}
                <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-3">
                  <Link
                    to={`/projects/${p.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300"
                  >
                    <Play className="h-3 w-3" />
                    Mở Studio
                  </Link>
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
          <button
            type="button"
            onClick={() => {
              setNewName("")
              setNewTopic("")
              setNewOutputFolder("")
              setCreateModalOpen(true)
            }}
            className="flex h-full min-h-[240px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-700/50 bg-white/[0.01] transition-all duration-200 hover:border-amber-500/40 hover:bg-amber-500/[0.03]"
          >
            <Plus className="h-8 w-8 text-slate-600" />
            <span className="text-sm font-medium text-slate-400">Tạo project mới</span>
          </button>
        </div>
      )}

      {/* CREATE PROJECT MODAL DIALOG */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg border-white/10 bg-[#0e161c] p-6 shadow-2xl">
          {/* Top Glowing Beam */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Tạo Dự Án Mới
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Khởi tạo không gian làm việc. Các thiết lập chuyên sâu có thể chỉnh sửa trong Studio.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            {/* Tên dự án */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-200">
                Tên dự án <span className="text-amber-400">*</span>
              </Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Bí ẩn đại dương sâu thẳm · Tập 1"
                className="h-10 border-white/10 bg-white/[0.03] text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/60"
                autoFocus
              />
            </div>

            {/* Chủ đề */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-200">
                Chủ đề / Ý tưởng <span className="text-[11px] font-normal text-slate-500">(Tùy chọn)</span>
              </Label>
              <Input
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="VD: Khám phá sinh vật phát sáng dưới rãnh Mariana"
                className="h-10 border-white/10 bg-white/[0.03] text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/60"
              />
            </div>

            {/* Khung hình */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-200">Định dạng khung hình</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNewAspect("16:9")}
                  className={cn(
                    "flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all",
                    newAspect === "16:9"
                      ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/40 text-amber-200 font-semibold"
                      : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                  )}
                >
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-bold text-amber-300">16:9</span>
                  <div className="text-xs">Video dài (YouTube)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setNewAspect("9:16")}
                  className={cn(
                    "flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all",
                    newAspect === "9:16"
                      ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/40 text-amber-200 font-semibold"
                      : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                  )}
                >
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-bold text-amber-300">9:16</span>
                  <div className="text-xs">Shorts / TikTok</div>
                </button>
              </div>
            </div>

            {/* Loại quy trình & Ngôn ngữ */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-200">Loại quy trình</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProjectType("ai_studio")}
                    className={cn(
                      "flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all",
                      newProjectType === "ai_studio"
                        ? "border-amber-500 bg-amber-500/10 text-amber-200 font-medium"
                        : "border-white/10 bg-white/[0.02] text-slate-400"
                    )}
                  >
                    <Sparkles className="h-4 w-4 mb-0.5 text-amber-400" />
                    <span className="text-[11px]">AI Studio</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewProjectType("recap")}
                    className={cn(
                      "flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all",
                      newProjectType === "recap"
                        ? "border-amber-500 bg-amber-500/10 text-amber-200 font-medium"
                        : "border-white/10 bg-white/[0.02] text-slate-400"
                    )}
                  >
                    <Film className="h-4 w-4 mb-0.5 text-sky-400" />
                    <span className="text-[11px]">Recap</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-200">Ngôn ngữ</Label>
                <select
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                  className="w-full h-9 rounded-lg border border-white/10 bg-[#141d22] px-2.5 text-xs text-slate-200 outline-none focus:border-amber-500/60"
                >
                  <option value="vi">🇻🇳 Tiếng Việt</option>
                  <option value="en">🇺🇸 Tiếng Anh</option>
                  <option value="ja">🇯🇵 Tiếng Nhật</option>
                  <option value="ko">🇰🇷 Tiếng Hàn</option>
                  <option value="zh">🇨🇳 Tiếng Trung</option>
                </select>
              </div>
            </div>

            {/* Thư mục lưu trữ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-200">Thư mục dự án</Label>
              <div className="flex gap-2">
                <Input
                  value={newOutputFolder}
                  onChange={(e) => setNewOutputFolder(e.target.value)}
                  placeholder="Để trống để dùng thư mục riêng tự động"
                  className="h-9 flex-1 border-white/10 bg-white/[0.03] text-xs font-mono text-slate-200 placeholder:text-slate-600"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSelectFolder}
                  className="gap-1 text-xs border-white/10 hover:bg-white/5 h-9"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Chọn
                </Button>
              </div>
            </div>

            {/* Footer Buttons */}
            <DialogFooter className="gap-2 pt-3 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={creating || !newName.trim()}
                className="bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-[#121820] font-bold text-xs shadow-lg shadow-amber-500/20 hover:brightness-110"
              >
                {creating ? "Đang tạo..." : "🚀 Tạo dự án & Bắt đầu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
