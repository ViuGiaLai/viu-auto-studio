import { Table } from "@/components/design-system"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Hourglass, RotateCcw, Ban, Filter, Loader2, FileText } from "lucide-react"
import { api } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/utils/cn"
import type { RenderJob } from "@/types"
import { STATUS_LABELS } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/design-system"
import { Progress } from "@/components/ui/progress"

const STATUS_STYLES: Record<string, "success" | "destructive" | "secondary" | "warning"> = {
  completed: "success",
  failed: "destructive",
  cancelled: "secondary",
  queued: "secondary",
  running: "warning",
  rendering: "warning",
  generating_voice: "warning",
  voice_ready: "warning",
  building_scenes: "warning",
  preparing_media: "warning",
  media_ready: "warning",
  generating_subtitles: "warning",
  subtitle_ready: "warning",
  pending: "secondary",
  draft: "secondary",
}

const FILTERS = ["all", "running", "queued", "completed", "failed"] as const

const STEP_LABELS: Record<string, string> = {
  draft: "Bản nháp",
  queued: "Đang chờ",
  pending: "Đang chờ",
  generating_voice: "Lồng tiếng",
  voice_ready: "Giọng đọc sẵn sàng",
  preparing_media: "Chuẩn bị hình/ảnh",
  media_ready: "Media sẵn sàng",
  generating_subtitles: "Tạo phụ đề",
  subtitle_ready: "Phụ đề sẵn sàng",
  rendering: "Đang dựng phim",
  completed: "Hoàn tất",
  failed: "Lỗi",
  cancelled: "Đã hủy",
}

const stepLabel = (step: string) => STEP_LABELS[step] || step || "—"

export default function QueuePage() {
  const [params, setParams] = useSearchParams()
  const [jobs, setJobs] = useState<RenderJob[]>([])
  const [loading, setLoading] = useState(true)
  const initialFilter = FILTERS.includes(params.get("status") as (typeof FILTERS)[number])
    ? (params.get("status") as (typeof FILTERS)[number])
    : "all"
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(initialFilter)
  const [logJob, setLogJob] = useState<number | null>(null)
  const [logContent, setLogContent] = useState<string>("")
  const [logOpen, setLogOpen] = useState(false)

  const openLog = async (id: number) => {
    setLogJob(id)
    setLogOpen(true)
    setLogContent("Đang tải log…")
    try {
      const res = await api.getJobLog(id)
      const text = Array.isArray(res.lines) ? res.lines.join("\n") : "Không có log cho lệnh này."
      setLogContent(text || "Không có log cho lệnh này.")
    } catch {
      setLogContent("Không thể tải log.")
    }
  }

  const load = () => {
    api
      .listJobs()
      .then(setJobs)
      .catch(() => toast({ title: "Không thể tải hàng đợi", variant: "destructive" }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const next = params.get("status")
    if (next && FILTERS.includes(next as (typeof FILTERS)[number])) setFilter(next as (typeof FILTERS)[number])
    const jobId = Number(params.get("job") || "")
    if (jobId) void openLog(jobId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const filtered =
    filter === "all"
      ? jobs
      : filter === "running"
        ? jobs.filter((j) =>
            ["running", "rendering", "generating_voice", "building_scenes", "preparing_media", "generating_subtitles"].includes(j.status),
          )
        : filter === "queued"
          ? jobs.filter((j) => ["queued", "pending"].includes(j.status))
          : jobs.filter((j) => j.status === filter)
  const selectedJobId = Number(params.get("job") || "")

  const counts = {
    all: jobs.length,
    running: jobs.filter((j) =>
      ["running", "rendering", "generating_voice", "building_scenes", "preparing_media", "generating_subtitles"].includes(j.status),
    ).length,
    queued: jobs.filter((j) => ["queued", "pending"].includes(j.status)).length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  }

  const cancel = async (id: number) => {
    try {
      await api.cancelJob(id)
      toast({ title: "Đã hủy lệnh render" })
      load()
    } catch (e) {
      toast({ title: "Không thể hủy", description: String(e), variant: "destructive" })
    }
  }

  const retry = async (id: number) => {
    try {
      await api.retryJob(id)
      toast({ title: "Đang thử lại từ bước lỗi..." })
      load()
    } catch (e) {
      toast({ title: "Không thể thử lại", description: String(e), variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Hàng đợi</h1>
          <p className="mt-1 text-sm text-slate-500">Quản lý các lệnh render đang chạy, chờ và hoàn tất</p>
        </div>
        <Button onClick={load} variant="outline" className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Làm mới
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {FILTERS.map((f) => (
          <Button variant="ghost"
            key={f}
            onClick={() => {
              setFilter(f)
              const next = new URLSearchParams(params)
              if (f === "all") next.delete("status")
              else next.set("status", f)
              setParams(next, { replace: true })
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 border border-transparent",
              filter === f
                ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300",
            )}
          >
            {f === "all" ? "Tất cả" : f === "running" ? "Đang chạy" : f === "queued" ? "Đang chờ" : f === "completed" ? "Hoàn tất" : "Lỗi"}{" "}
            ({counts[f]})
          </Button>
        ))}
      </div>

      <div className="vas-card p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-100">
          Lệnh render
        </h3>
        <div>
          {loading ? (
            <div className="space-y-2 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-white/[0.03]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border border-dashed rounded-lg py-16 text-center">
              <Hourglass className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <div className="font-medium">Chưa có lệnh render nào</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Khi bạn chạy Render, lệnh sẽ xuất hiện ở đây.
                </div>
              </div>
              <Link to="/projects" className="mt-2 text-sm font-medium text-primary hover:underline">
                Đến trang Dự án →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">Dự án</th>
                    <th className="py-2 pr-4">Bước hiện tại</th>
                    <th className="py-2 pr-4">Trạng thái</th>
                    <th className="py-2 pr-4">Tiến độ</th>
                    <th className="py-2 pr-4">Thời gian</th>
                    <th className="py-2">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((j) => (
                    <tr key={j.id} className={cn("border-b border-white/5 last:border-0 hover:bg-white/[0.02]", selectedJobId === j.id && "bg-cyan-500/10")}>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{j.id}</td>
                      <td className="py-3 pr-4">
                        <Link
                          to={`/projects/${j.project_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          Dự án #{j.project_id}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{stepLabel(j.current_step)}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={STATUS_STYLES[j.status] ?? "secondary"}>
                          {j.status === "running" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {STATUS_LABELS[j.status] || j.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Progress value={j.progress} className="h-1.5 w-20" />
                          <span className="font-mono text-xs font-semibold text-slate-300">{j.progress}%</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs font-mono">
                        {(() => {
                          if (!j.started_at) return <span className="text-slate-500">—</span>
                          const start = new Date(j.started_at).getTime()
                          const end = j.completed_at ? new Date(j.completed_at).getTime() : Date.now()
                          const durSec = Math.max(0, Math.floor((end - start) / 1000))
                          const m = Math.floor(durSec / 60)
                          const s = durSec % 60
                          const timeStr = `${m > 0 ? `${m}m ` : ""}${s}s`

                          const isRun = ["running", "rendering", "generating_voice", "preparing_media", "generating_subtitles"].includes(j.status)
                          if (isRun && j.progress > 5 && j.progress < 100) {
                            const totalEst = Math.round((durSec / j.progress) * 100)
                            const eta = Math.max(0, totalEst - durSec)
                            const em = Math.floor(eta / 60)
                            const es = eta % 60
                            const etaStr = `${em > 0 ? `${em}m ` : ""}${es}s`
                            return <span className="text-cyan-300">{timeStr} <span className="text-slate-500 font-sans">(còn ~{etaStr})</span></span>
                          }
                          if (j.status === "completed") {
                            return <span className="text-emerald-400">✓ {timeStr}</span>
                          }
                          return <span className="text-slate-400">{timeStr}</span>
                        })()}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          {j.status === "failed" && (
                            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => retry(j.id)}>
                              <RotateCcw className="h-3 w-3" />
                              Thử lại
                            </Button>
                          )}
                          {["running", "rendering", "generating_voice", "preparing_media", "generating_subtitles"].includes(j.status) && (
                            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => cancel(j.id)}>
                              <Ban className="h-3 w-3" />
                              Hủy
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="gap-1 text-xs text-slate-400 hover:text-slate-200" onClick={() => openLog(j.id)}>
                            <FileText className="h-3 w-3" />
                            Log
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Xem log lệnh render */}
      {logOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setLogOpen(false)}>
          <div className="max-h-[75vh] w-full max-w-3xl overflow-hidden rounded-xl border border-white/10 bg-[#141d22]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="font-medium text-slate-100">Log lệnh render #{logJob}</div>
              <Button size="sm" variant="ghost" onClick={() => setLogOpen(false)}>✕</Button>
            </div>
            <pre className="max-h-[calc(75vh-56px)] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-slate-300">
              {logContent || "(chưa có log)"}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
