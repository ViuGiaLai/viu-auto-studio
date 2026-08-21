import { useEffect, useState } from "react"
import { Clock, Hourglass, CheckCircle2, AlertCircle, Sparkles, Film, Mic, Image as ImageIcon, Captions, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/utils/cn"
import type { RenderJob } from "@/types"

interface RenderProgressCardProps {
  job: RenderJob
  className?: string
}

const STEP_DETAILS: Record<string, { label: string; icon: typeof Film; desc: string }> = {
  draft: { label: "Bản nháp", icon: Hourglass, desc: "Đang chờ bắt đầu xử lý..." },
  queued: { label: "Đang xếp hàng", icon: Hourglass, desc: "Đang chờ lượt xử lý trong hàng đợi..." },
  pending: { label: "Khởi tạo", icon: Hourglass, desc: "Đang khởi tạo tài nguyên và kiểm tra file..." },
  generating_voice: { label: "1/4. Tạo giọng đọc AI", icon: Mic, desc: "Đang chuyển văn bản thành giọng đọc (TTS)..." },
  voice_ready: { label: "1/4. Giọng đọc sẵn sàng", icon: Mic, desc: "Đã hoàn thành tạo giọng đọc cho tất cả các phân cảnh." },
  preparing_media: { label: "2/4. Chuẩn bị Visual Media", icon: ImageIcon, desc: "Đang tải, xử lý khung hình ảnh và video cho từng shot..." },
  media_ready: { label: "2/4. Visual Media sẵn sàng", icon: ImageIcon, desc: "Tất cả hình ảnh và video đã sẵn sàng để dựng phim." },
  generating_subtitles: { label: "3/4. Tạo phụ đề thông minh", icon: Captions, desc: "Đang khớp mốc thời gian phụ đề và tạo hiệu ứng chữ..." },
  subtitle_ready: { label: "3/4. Phụ đề sẵn sàng", icon: Captions, desc: "Đã hoàn tất cấu hình phụ đề và định dạng ASS/SRT." },
  rendering: { label: "4/4. Đang dựng & xuất video", icon: Film, desc: "FFmpeg đang ghép nối video, hiệu ứng Ken Burns, audio và render..." },
  completed: { label: "Hoàn tất 100%", icon: CheckCircle2, desc: "Video đã được render thành công và xác minh chuẩn chất lượng!" },
  failed: { label: "Thất bại", icon: AlertCircle, desc: "Xảy ra lỗi trong quá trình xử lý." },
  cancelled: { label: "Đã hủy", icon: AlertCircle, desc: "Tác vụ đã được hủy bởi người dùng." },
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

function formatHumanDuration(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return "0 giây"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m > 0) {
    return s > 0 ? `${m} phút ${s} giây` : `${m} phút`
  }
  return `${s} giây`
}

export function RenderProgressCard({ job, className }: RenderProgressCardProps) {
  const [now, setNow] = useState(Date.now())

  const isRunning = [
    "generating_voice", "voice_ready", "preparing_media",
    "media_ready", "generating_subtitles", "rendering", "running"
  ].includes(job.status)

  // Live timer tick every second while running
  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isRunning])

  // Calculate Elapsed Time
  const startTime = job.started_at ? new Date(job.started_at).getTime() : 0
  const endTime = job.completed_at ? new Date(job.completed_at).getTime() : now
  const elapsedSec = startTime > 0 ? Math.max(0, Math.floor((endTime - startTime) / 1000)) : 0

  // Calculate ETA (Estimated Time Remaining)
  const progress = Math.max(0, Math.min(100, job.progress || 0))
  let etaSec: number | null = null
  let totalEstimatedSec: number | null = null

  if (isRunning && startTime > 0 && progress > 3 && progress < 100) {
    totalEstimatedSec = Math.round((elapsedSec / progress) * 100)
    etaSec = Math.max(0, totalEstimatedSec - elapsedSec)
  }

  const stepInfo = STEP_DETAILS[job.current_step] || STEP_DETAILS[job.status] || {
    label: job.current_step || job.status || "Đang xử lý",
    icon: Sparkles,
    desc: "Đang tiến hành xử lý dự án..."
  }
  const StepIcon = stepInfo.icon

  return (
    <div className={cn("rounded-xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-sm", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg shadow-inner",
            job.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
            job.status === "failed" || job.status === "cancelled" ? "bg-red-500/20 text-red-400" :
            "bg-cyan-500/20 text-cyan-400"
          )}>
            <StepIcon className={cn("h-5 w-5", isRunning && "animate-pulse")} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{stepInfo.label}</span>
              {isRunning && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
              )}
            </div>
            <p className="text-[12px] text-slate-400 mt-0.5">{stepInfo.desc}</p>
          </div>
        </div>

        <Badge variant={
          job.status === "completed" ? "success" :
          job.status === "failed" || job.status === "cancelled" ? "destructive" :
          "warning"
        } className="px-2.5 py-1 text-xs">
          {job.status === "completed" ? "Hoàn thành" :
           job.status === "failed" ? "Lỗi" :
           job.status === "cancelled" ? "Đã hủy" : "Đang xử lý"}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-300">Tiến độ xuất video</span>
          <span className={cn(
            "font-mono font-bold text-sm",
            job.status === "completed" ? "text-emerald-400" : "text-cyan-400"
          )}>
            {progress}%
          </span>
        </div>
        <Progress value={progress} className="h-2.5 bg-slate-800" />
      </div>

      {/* Time & ETA Metrics */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
        {/* Elapsed Time */}
        <div className="flex flex-col gap-1 rounded-lg border border-white/5 bg-black/30 p-2.5">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            <span>Thời gian đã chạy</span>
          </div>
          <div className="font-mono text-sm font-semibold text-slate-200">
            {formatDuration(elapsedSec)}
          </div>
        </div>

        {/* ETA Remaining (when running) */}
        {isRunning && (
          <div className="flex flex-col gap-1 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2.5">
            <div className="flex items-center gap-1.5 text-cyan-300">
              <Hourglass className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              <span>Ước tính còn lại</span>
            </div>
            <div className="font-mono text-sm font-semibold text-cyan-200">
              {etaSec !== null ? `~${formatHumanDuration(etaSec)}` : "Đang tính toán..."}
            </div>
          </div>
        )}

        {/* Total time (when completed) */}
        {job.status === "completed" && (
          <div className="flex flex-col gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Tổng thời gian</span>
            </div>
            <div className="font-mono text-sm font-semibold text-emerald-200">
              {formatHumanDuration(elapsedSec)}
            </div>
          </div>
        )}

        {/* Total Estimated Duration (when running) or Status Summary */}
        {isRunning && totalEstimatedSec !== null && (
          <div className="flex flex-col gap-1 rounded-lg border border-white/5 bg-black/30 p-2.5 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-slate-400">
              <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
              <span>Dự kiến toàn bộ</span>
            </div>
            <div className="font-mono text-sm font-semibold text-amber-200">
              ~{formatHumanDuration(totalEstimatedSec)}
            </div>
          </div>
        )}
      </div>

      {/* Error display if failed */}
      {job.error_message && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span className="whitespace-pre-wrap">{job.error_message}</span>
        </div>
      )}
    </div>
  )
}
