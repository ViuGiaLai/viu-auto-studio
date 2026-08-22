import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import {
  Hourglass,
  RotateCcw,
  Ban,
  Play,
  Pause,
  ArrowUp,
  Cpu,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Clapperboard,
  Mic,
  FolderOpen,
  Eye,
  FileText,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Sliders,
  Terminal,
  Link2,
  Layers,
  ArrowRight,
  ShieldCheck,
  HardDrive,
  Copy,
  Check,
} from "lucide-react"
import { api, openLocalPath } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/utils/cn"
import type { RenderJob, JobDomain, JobStatusFilter, JobStats } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/design-system"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const DOMAIN_TABS: Array<{ id: JobDomain; label: string; icon: any; color: string }> = [
  { id: "all", label: "Tất cả tác vụ", icon: Layers, color: "text-cyan-400" },
  { id: "render", label: "Render Video", icon: Clapperboard, color: "text-amber-400" },
  { id: "ai", label: "AI Auto Edit", icon: Sparkles, color: "text-purple-400" },
  { id: "media", label: "Giọng đọc & Media", icon: Mic, color: "text-emerald-400" },
]

const STATUS_FILTERS: Array<{ id: JobStatusFilter; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "running", label: "Đang chạy" },
  { id: "queued", label: "Đang chờ" },
  { id: "completed", label: "Hoàn thành" },
  { id: "failed", label: "Lỗi" },
]

export default function QueuePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [jobs, setJobs] = useState<RenderJob[]>([])
  const [stats, setStats] = useState<JobStats>({
    running: 0,
    queued: 0,
    completed: 0,
    failed: 0,
    paused: 0,
    total_active: 0,
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<JobDomain>("all")
  const [selectedStatus, setSelectedStatus] = useState<JobStatusFilter>("all")

  // Job Detail Modal State
  const [detailJob, setDetailJob] = useState<RenderJob | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [logContent, setLogContent] = useState<string>("")
  const [copiedLog, setCopiedLog] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const loadData = async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const [jobsData, statsData] = await Promise.all([
        api.listJobs(selectedDomain, selectedStatus),
        api.jobStats(),
      ])
      setJobs(jobsData)
      setStats(statsData)
    } catch {
      // silently retry on background poll
    } finally {
      setLoading(false)
      if (manual) setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(() => loadData(false), 2500)
    return () => clearInterval(interval)
  }, [selectedDomain, selectedStatus])

  const openDetail = async (job: RenderJob) => {
    setDetailJob(job)
    setDetailModalOpen(true)
    setLogContent("Đang tải log chi tiết từ tiến trình...")
    try {
      const full = await api.jobGetDetail(job.id)
      setDetailJob(full)
      setLogContent(full.log_lines?.join("\n") || "Không có bản ghi log nào.")
    } catch {
      setLogContent("Không thể tải log.")
    }
  }

  const copyLogsToClipboard = () => {
    if (!logContent) return
    navigator.clipboard.writeText(logContent)
    setCopiedLog(true)
    setTimeout(() => setCopiedLog(false), 2000)
    toast({ title: "Đã sao chép log vào clipboard" })
  }

  const handlePrioritize = async (id: number) => {
    setActionLoading(id)
    try {
      const res = await api.jobPrioritize(id)
      toast({ title: res.message })
      await loadData(false)
    } catch (err) {
      toast({ title: "Không thể đổi mức ưu tiên", description: String(err), variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  const handlePauseResume = async (job: RenderJob) => {
    setActionLoading(job.id)
    try {
      if (job.status === "paused") {
        const res = await api.jobResume(job.id)
        toast({ title: res.message })
      } else {
        const res = await api.jobPause(job.id)
        toast({ title: res.message })
      }
      await loadData(false)
    } catch (err) {
      toast({ title: "Thao tác thất bại", description: String(err), variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async (id: number) => {
    setActionLoading(id)
    try {
      await api.cancelJob(id)
      toast({ title: "Đã hủy tác vụ và dọn dẹp file tạm an toàn" })
      await loadData(false)
    } catch (err) {
      toast({ title: "Không thể hủy tác vụ", description: String(err), variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  const handleRetry = async (id: number) => {
    setActionLoading(id)
    try {
      const res = await api.retryJob(id)
      toast({ title: res.message || "Đã đưa job vào hàng đợi thử lại" })
      await loadData(false)
    } catch (err) {
      toast({ title: "Không thể thử lại", description: String(err), variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  // Active / Running jobs
  const runningJobs = jobs.filter((j) =>
    ["processing", "preparing", "finalizing", "running", "rendering"].includes(j.status)
  )

  // Queued & Paused jobs
  const queuedJobs = jobs.filter((j) => ["queued", "paused"].includes(j.status))

  // Finished jobs (completed / failed / cancelled)
  const finishedJobs = jobs.filter((j) => ["completed", "failed", "cancelled"].includes(j.status))

  return (
    <div className="min-h-full space-y-6 p-6 xl:p-8 pb-20">
      {/* 1. TOP HEADER & STAT CARDS */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-500/10">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Trung Tâm Điều Phối Tác Vụ
                </h1>
                {stats.total_active > 0 ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                    {stats.total_active} đang chạy/chờ
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                    Hàng đợi rảnh rỗi
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Điều phối trung tâm: Render phần cứng, AI Director Auto-Edit, TTS hàng loạt &amp; Quản lý tài nguyên đa luồng.
              </p>
            </div>
          </div>

          {/* Real Dynamic Hardware & Scheduler Capabilities from Backend */}
          <div className="flex items-center gap-2.5 self-start lg:self-auto">
            {stats.hardware_engine && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#10171e] border border-white/10 text-[11px] text-slate-300">
                <Cpu className={cn("h-3.5 w-3.5", stats.is_hardware_accelerated ? "text-emerald-400" : "text-cyan-400")} />
                <span>
                  {stats.hardware_engine}
                  {stats.cpu_cores ? ` · ${stats.cpu_cores} Cores` : ""}
                </span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              className="h-9 px-3 text-xs gap-1.5 border-white/10 bg-[#10171e] hover:bg-white/5 text-slate-300"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 text-cyan-400", refreshing && "animate-spin")} />
              <span>Làm mới</span>
            </Button>
          </div>
        </div>

        {/* 4 MODERN STAT CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Running Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/10 via-[#10171e] to-[#0d1318] p-4 border border-amber-500/25 shadow-lg shadow-amber-500/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Đang chạy</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Zap className="h-3.5 w-3.5 animate-pulse" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-white font-mono">{stats.running}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Tác vụ đang chiếm worker</div>
          </div>

          {/* Queued Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/10 via-[#10171e] to-[#0d1318] p-4 border border-blue-500/25 shadow-lg shadow-blue-500/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Đang chờ</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                <Clock className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-white font-mono">{stats.queued}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Xếp hàng &amp; chờ phụ thuộc</div>
          </div>

          {/* Completed Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/10 via-[#10171e] to-[#0d1318] p-4 border border-emerald-500/25 shadow-lg shadow-emerald-500/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Hoàn thành</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-white font-mono">{stats.completed}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Đã xuất bản thành công</div>
          </div>

          {/* Failed Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500/10 via-[#10171e] to-[#0d1318] p-4 border border-rose-500/25 shadow-lg shadow-rose-500/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Gặp lỗi</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
                <AlertCircle className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-white font-mono">{stats.failed}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Tác vụ cần kiểm tra log</div>
          </div>
        </div>
      </div>

      {/* 2. UNIFIED STUDIO FILTER BAR */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#10171e] p-1.5 rounded-2xl border border-white/10 shadow-sm">
        {/* Domain Tabs */}
        <div className="flex flex-wrap items-center gap-1">
          {DOMAIN_TABS.map((tab) => {
            const Icon = tab.icon
            const active = selectedDomain === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedDomain(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all",
                  active
                    ? "bg-gradient-to-r from-cyan-950/90 to-blue-950/90 border border-cyan-500/40 text-cyan-200 shadow-sm shadow-cyan-500/10 font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", tab.color)} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1 self-start md:self-auto bg-black/30 p-1 rounded-xl border border-white/5 text-xs">
          {STATUS_FILTERS.map((st) => (
            <button
              key={st.id}
              onClick={() => setSelectedStatus(st.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all",
                selectedStatus === st.id
                  ? "bg-white/15 text-white font-semibold shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. SECTION: ACTIVE RUNNING JOBS (HERO CARDS) */}
      {runningJobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
            Đang Thực Thi Trực Tiếp ({runningJobs.length})
          </div>

          <div className="grid gap-3.5">
            {runningJobs.map((job) => (
              <div
                key={job.id}
                className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-[#10171e] to-[#0b1015] p-5 shadow-xl shadow-amber-500/5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        {job.domain === "render" ? "🎬" : job.domain === "ai" ? "🤖" : "🎙"} {job.title}
                      </span>
                      <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]">
                        {job.domain?.toUpperCase()} WORKER
                      </Badge>
                      <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]">
                        Ưu tiên: {job.priority?.toUpperCase()}
                      </Badge>
                      {job.schema_version && (
                        <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                          v{job.schema_version}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2.5">
                      <span>Dự án: <strong className="text-slate-200">{job.project_name}</strong></span>
                      <span>·</span>
                      <span>Khởi tạo: {job.started_at ? new Date(job.started_at).toLocaleTimeString() : "Vừa xong"}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono tracking-tight">{job.progress}%</div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-end gap-1.5 mt-0.5">
                      <Cpu className="h-3 w-3 text-cyan-400" />
                      <span>{job.worker_id || stats.hardware_engine || "Hardware Worker"}</span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Performance Metrics */}
                <div className="space-y-2">
                  <Progress value={job.progress} className="h-2.5 bg-black/50 border border-white/10" />
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-medium text-amber-200 flex items-center gap-1.5">
                      <RefreshCw className="h-3 w-3 animate-spin text-amber-400" />
                      {job.current_step || "Đang xử lý..."}
                    </span>
                    <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                      {job.speed_multiplier && job.speed_multiplier > 1.0 && (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          {job.speed_multiplier.toFixed(1)}× realtime
                        </span>
                      )}
                      {job.eta_seconds ? <span>~{job.eta_seconds}s còn lại</span> : null}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 bg-black/40 hover:bg-black/60 border-white/10 text-slate-200"
                    onClick={() => openDetail(job)}
                  >
                    <Terminal className="h-3.5 w-3.5 text-amber-400" />
                    Chi tiết &amp; Log
                  </Button>

                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                    disabled={actionLoading === job.id}
                    onClick={() => handleCancel(job.id)}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Hủy tác vụ
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. SECTION: QUEUED & PAUSED TASKS */}
      {queuedJobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
            <Clock className="h-3.5 w-3.5 text-blue-400" />
            Đang Chờ Thực Thi ({queuedJobs.length})
          </div>

          <div className="grid gap-3">
            {queuedJobs.map((job) => {
              const isPaused = job.status === "paused"
              return (
                <div
                  key={job.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border transition-all",
                    isPaused
                      ? "bg-[#10171e]/60 border-dashed border-amber-500/30"
                      : "bg-[#10171e] border-white/10 hover:border-cyan-500/30 shadow-sm"
                  )}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white flex items-center gap-2">
                        {job.domain === "render" ? "🎬" : job.domain === "ai" ? "🤖" : "🎙"} {job.title}
                      </span>
                      {isPaused ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                          TẠM DỪNG
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30 text-[10px]">
                          ĐANG CHỜ
                        </Badge>
                      )}
                      {job.priority === "high" && (
                        <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 text-[10px]">
                          ƯU TIÊN CAO
                        </Badge>
                      )}
                      {job.depends_on && job.depends_on.length > 0 && (
                        <Badge variant="outline" className="bg-cyan-500/10 text-cyan-300 border-cyan-500/30 text-[10px] flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          Chờ Job: #{job.depends_on.join(", #")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <span>Dự án: <strong className="text-slate-300">{job.project_name}</strong></span>
                      <span>·</span>
                      <span className="text-slate-400">{job.current_step || "Chờ phân bổ worker..."}</span>
                    </div>
                  </div>

                  {/* Actions for Queued job */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 bg-white/5 hover:bg-white/10 border-white/10"
                      disabled={actionLoading === job.id || job.priority === "high"}
                      onClick={() => handlePrioritize(job.id)}
                      title="Ưu tiên job này lên đầu hàng đợi"
                    >
                      <ArrowUp className="h-3 w-3 text-amber-400" />
                      Ưu tiên
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 bg-white/5 hover:bg-white/10 border-white/10"
                      disabled={actionLoading === job.id}
                      onClick={() => handlePauseResume(job)}
                    >
                      {isPaused ? (
                        <>
                          <Play className="h-3 w-3 text-emerald-400" />
                          Tiếp tục
                        </>
                      ) : (
                        <>
                          <Pause className="h-3 w-3 text-amber-400" />
                          Tạm dừng
                        </>
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-rose-400 hover:bg-rose-500/10"
                      disabled={actionLoading === job.id}
                      onClick={() => handleCancel(job.id)}
                    >
                      <Ban className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 5. SECTION: COMPLETED & FAILED HISTORY */}
      {finishedJobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            Lịch Sử Tác Vụ ({finishedJobs.length})
          </div>

          <div className="grid gap-2.5">
            {finishedJobs.map((job) => {
              const isCompleted = job.status === "completed"
              const isFailed = job.status === "failed"
              const isCancelled = job.status === "cancelled"

              return (
                <div
                  key={job.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#10171e] border border-white/5 hover:border-white/15 transition-all text-xs"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-200">
                        {job.domain === "render" ? "🎬" : job.domain === "ai" ? "🤖" : "🎙"} {job.title}
                      </span>
                      {isCompleted && (
                        <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">
                          HOÀN THÀNH
                        </Badge>
                      )}
                      {isFailed && (
                        <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30 text-[10px]">
                          LỖI XỬ LÝ
                        </Badge>
                      )}
                      {isCancelled && (
                        <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 text-[10px]">
                          ĐÃ HỦY
                        </Badge>
                      )}
                      <span className="text-slate-400">· Dự án: <strong className="text-slate-300">{job.project_name}</strong></span>
                    </div>

                    {isFailed && job.error_message && (
                      <div className="text-[11px] text-rose-400 bg-rose-500/5 p-2 rounded-lg border border-rose-500/20 font-mono">
                        {job.error_message}
                      </div>
                    )}

                    <div className="text-[11px] text-slate-400 flex items-center gap-3">
                      <span>Hoàn tất lúc: {job.completed_at ? new Date(job.completed_at).toLocaleTimeString() : "--"}</span>
                      {job.output_path && (
                        <>
                          <span>·</span>
                          <span className="text-cyan-400 font-mono truncate max-w-xs">{job.output_path}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {job.output_path && isCompleted && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                        onClick={() => openLocalPath(job.output_path || "")}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Mở file
                      </Button>
                    )}

                    {isFailed && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30"
                        disabled={actionLoading === job.id}
                        onClick={() => handleRetry(job.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Thử lại
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1 text-slate-400 hover:text-white"
                      onClick={() => openDetail(job)}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      Log
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 6. RICH EMPTY STATE (When no jobs exist or filter returns empty) */}
      {jobs.length === 0 && !loading && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#121B24] to-[#0A1015] border border-white/10 p-8 sm:p-12 text-center space-y-8 shadow-2xl">
          {/* Ambient Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(0,156,216,0.08),transparent_60%)] pointer-events-none" />

          {/* Central Hero Icon */}
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-500/15 via-[#14232f] to-[#0d161d] border border-cyan-500/30 text-cyan-400 shadow-2xl shadow-cyan-500/10">
            <Layers className="h-9 w-9" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Hàng Đợi Sẵn Sàng Tiếp Nhận Tác Vụ</h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Chưa có tác vụ nào đang chờ xử lý. Khi bạn xuất video, chạy AI Director Auto-Edit hoặc tổng hợp giọng đọc TTS hàng loạt, tiến trình sẽ xuất hiện trực tiếp tại đây.
            </p>
          </div>

          {/* 3 Action Quick Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
            <div
              onClick={() => navigate("/studio")}
              className="group cursor-pointer rounded-2xl bg-[#10171e]/80 hover:bg-[#15202a] border border-white/10 hover:border-cyan-500/40 p-4 transition-all hover:shadow-lg hover:shadow-cyan-500/5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <Clapperboard className="h-4 w-4" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1" />
              </div>
              <div className="font-semibold text-white text-sm">Xuất Video &amp; Render</div>
              <div className="text-xs text-slate-400">
                Tăng tốc mã hóa video bằng {stats.hardware_engine || "bộ mã hóa tối ưu"}.
              </div>
            </div>

            <div
              onClick={() => navigate("/studio")}
              className="group cursor-pointer rounded-2xl bg-[#10171e]/80 hover:bg-[#15202a] border border-white/10 hover:border-cyan-500/40 p-4 transition-all hover:shadow-lg hover:shadow-cyan-500/5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1" />
              </div>
              <div className="font-semibold text-white text-sm">AI Auto Edit Studio</div>
              <div className="text-xs text-slate-400">Tự động phân tích nhịp giọng nói, chia multi-shot và ghép visual.</div>
            </div>

            <div
              onClick={() => navigate("/voices")}
              className="group cursor-pointer rounded-2xl bg-[#10171e]/80 hover:bg-[#15202a] border border-white/10 hover:border-cyan-500/40 p-4 transition-all hover:shadow-lg hover:shadow-cyan-500/5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <Mic className="h-4 w-4" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1" />
              </div>
              <div className="font-semibold text-white text-sm">Lồng Tiếng TTS Hàng Loạt</div>
              <div className="text-xs text-slate-400">Tạo giọng đọc AI Edge TTS và tự động đồng bộ phụ đề.</div>
            </div>
          </div>

          {/* System Scheduler Status Footer (100% Dynamic from Backend) */}
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Bộ điều phối: <strong>Hoạt động bình thường</strong>
            </span>
            {stats.concurrency_slots && (
              <span className="flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-cyan-400" />
                Slot điều phối:{" "}
                <strong>
                  Render: {stats.concurrency_slots.render} | AI: {stats.concurrency_slots.ai} | Media: {stats.concurrency_slots.media}
                </strong>
              </span>
            )}
            {stats.hardware_engine && (
              <span className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-400" />
                Bộ mã hóa: <strong>{stats.hardware_engine}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 7. LIVE LOG & DIAGNOSTIC MODAL */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-3xl bg-[#0e161c] border-white/15 text-slate-100 p-6 rounded-2xl shadow-2xl">
          <DialogHeader className="border-b border-white/10 pb-4">
            <DialogTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                  <Terminal className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-white flex items-center gap-2">
                    Tác Vụ #{detailJob?.id}: {detailJob?.title}
                  </div>
                  <div className="text-xs text-slate-400 font-normal">
                    Dự án: {detailJob?.project_name} · Domain: {detailJob?.domain?.toUpperCase()} · Schema: v{detailJob?.schema_version || 1}
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={copyLogsToClipboard}
                className="h-8 text-xs gap-1.5 bg-white/5 hover:bg-white/10 border-white/10"
              >
                {copiedLog ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedLog ? "Đã sao chép" : "Sao chép log"}
              </Button>
            </DialogTitle>
          </DialogHeader>

          {/* Dependencies Tree in Modal */}
          {detailJob?.dependencies && detailJob.dependencies.length > 0 && (
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2 text-xs">
              <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-cyan-400" />
                Tác vụ phụ thuộc (Pipeline Dependencies):
              </div>
              <div className="grid gap-1.5">
                {detailJob.dependencies.map((dep: any) => (
                  <div key={dep.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                    <span className="font-medium text-slate-200">#{dep.id}: {dep.title}</span>
                    <Badge variant="outline" className={cn(
                      "text-[10px]",
                      dep.status === "completed" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    )}>
                      {dep.status?.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Terminal Log Console */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-400">Bản ghi thực thi (Execution Tail Logs):</div>
            <pre className="h-80 overflow-y-auto rounded-xl bg-[#080d11] p-4 text-[11px] font-mono text-slate-300 border border-white/10 leading-relaxed whitespace-pre-wrap select-text">
              {logContent}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
