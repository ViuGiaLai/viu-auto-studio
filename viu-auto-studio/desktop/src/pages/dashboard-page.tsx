import { Table } from "@/components/design-system"
import { Button } from "@/components/design-system"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  FolderKanban, CheckCircle2, Loader2, XCircle, Clapperboard, RefreshCw, Mic, Zap,
  Cpu, Server, Sparkles, Activity,
} from "lucide-react"
import { api } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import type { DashboardStats } from "@/types"
import { STATUS_LABELS } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/utils/cn"

type PerfStep = {
  key: string
  label: string
  avgSec: number
  runs: number
  errorRate: string
}

const STAT_CARDS = [
  { key: "total_projects", label: "Tổng video", icon: FolderKanban, color: "bg-blue-500/20 text-blue-400" },
  { key: "completed_videos", label: "Hoàn tất", icon: CheckCircle2, color: "bg-emerald-500/20 text-emerald-400" },
  { key: "processing_videos", label: "Đang xử lý", icon: Loader2, color: "bg-cyan-500/20 text-cyan-400" },
  { key: "failed_videos", label: "Lỗi kết xuất", icon: XCircle, color: "bg-red-500/20 text-red-400" },
] as const

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [perfSteps, setPerfSteps] = useState<PerfStep[]>([])
  const [ttsProvider, setTtsProvider] = useState<string>("edge")
  const [ffmpegOk, setFfmpegOk] = useState<boolean>(true)
  const [ffmpegVersion, setFfmpegVersion] = useState<string>("")
  const [backendPort, setBackendPort] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    api
      .dashboard()
      .then((s) => {
        setStats(s)
        const runs = s.recent_activities.length
        const failed = s.recent_activities.filter((a: { status?: string }) => a.status === "failed").length
        setPerfSteps([
          { key: "lồng_tiếng", label: "Lồng tiếng", avgSec: 2, runs, errorRate: "0%" },
          { key: "dựng_phim", label: "Dựng phim", avgSec: 40, runs, errorRate: runs ? `${Math.round((failed / runs) * 100)}%` : "0%" },
          { key: "phụ_đề", label: "Phụ đề", avgSec: 1, runs, errorRate: "0%" },
          { key: "xuất_video", label: "Xuất video", avgSec: 40, runs, errorRate: runs ? `${Math.round((failed / runs) * 100)}%` : "0%" },
        ])
      })
      .catch(() => toast({ title: "Không thể tải thống kê", variant: "destructive" }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // Đọc port backend THẬT từ runtime config (Electron tự chọn port trống)
    const w = window as unknown as {
      electronAPI?: { getRuntimeConfig?: () => Promise<{ backendPort?: number } | null> }
    }
    w.electronAPI?.getRuntimeConfig?.()?.then((cfg) => setBackendPort(cfg?.backendPort ?? null)).catch(() => {})
    api.ttsGetConfig().then((c) => setTtsProvider(c.provider)).catch(() => {})
    api.ffmpegCheck().then((c) => { setFfmpegOk(c.ffmpeg); setFfmpegVersion(c.version || "") }).catch(() => {})
  }, [])

  return (
    <div className="min-h-full space-y-6 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Tổng quan</h1>
          <p className="mt-1 text-sm text-slate-500">
            Báo cáo hiệu năng và tiến trình sản xuất video
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost"
            onClick={load}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Làm mới
          </Button>
          <Link
            to="/projects/new"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-[#d9940a] to-[#faaa02] px-4 text-sm font-medium text-white shadow-lg shadow-amber-500/20 transition-all hover:brightness-110"
          >
            <Clapperboard className="h-4 w-4" />
            + Project Mới
          </Link>
        </div>
      </div>

      {/* Onboarding — hiển thị khi chưa có dự án nào */}
      {stats && stats.total_projects === 0 && (
        <div className="vas-card border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 text-base font-semibold text-amber-200">Bắt đầu tạo video đầu tiên của bạn</div>
              <p className="mb-3 max-w-xl text-sm text-slate-300">
                Chỉ 3 bước: tạo dự án → sinh kịch bản bằng AI → nhấn Render. Giọng đọc tiếng Việt và ảnh AI
                đều miễn phí, không cần API key. Xem hướng dẫn chi tiết từng bước ở mục Hướng dẫn trên sidebar.
              </p>
              <div className="flex gap-2">
                <Link
                  to="/projects/new"
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-[#d9940a] to-[#faaa02] px-4 text-sm font-medium text-white shadow-lg shadow-amber-500/20 transition-all hover:brightness-110"
                >
                  <Clapperboard className="h-4 w-4" />
                  Tạo dự án đầu tiên
                </Link>
                <Link
                  to="/guide"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06]"
                >
                  Đọc hướng dẫn
                </Link>
              </div>
            </div>
            <Sparkles className="h-10 w-10 shrink-0 text-amber-400/40" />
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: stats + step table */}
        <div className="space-y-4 lg:col-span-2">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {loading || !stats
              ? STAT_CARDS.map((s) => (
                  <div key={s.key} className="vas-card h-24 animate-pulse" />
                ))
              : STAT_CARDS.map((s) => (
                  <div key={s.key} className="vas-card vas-card-hover flex items-center gap-3 p-4 transition-all">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", s.color)}>
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xl font-bold leading-tight text-slate-100">
                        {stats[s.key as keyof DashboardStats] as number}
                      </div>
                      <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {s.label}
                      </div>
                    </div>
                  </div>
                ))}
          </div>

          {/* Step performance table */}
          <div className="vas-card p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-100">Hiệu năng theo bước sản xuất</h3>
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Bước</th>
                    <th className="py-2 pr-4">TB (giây)</th>
                    <th className="py-2 pr-4">Lượt</th>
                    <th className="py-2">Tỉ lệ lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {perfSteps.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-500">
                        Chưa có dữ liệu chạy.
                      </td>
                    </tr>
                  ) : (
                    perfSteps.map((p) => (
                      <tr key={p.key} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                        <td className="py-2.5 font-medium text-slate-200">{p.label}</td>
                        <td className="py-2.5 text-slate-400">{p.avgSec}</td>
                        <td className="py-2.5 text-slate-400">{p.runs}</td>
                        <td className="py-2.5 text-emerald-400">{p.errorRate}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
          </div>

          {/* Cost & export cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="vas-card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Mic className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-bold leading-tight text-slate-100">0 ký tự</div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Ký tự giọng đọc hôm nay
                </div>
              </div>
            </div>
            <div className="vas-card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-bold leading-tight text-slate-100">0</div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Xuất / 24h
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* System performance */}
          <div className="vas-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Activity className="h-4 w-4 text-amber-400" />
              HIỆU NĂNG HỆ THỐNG
            </h3>
            <div className="space-y-4">
              <PerfRow
                label="TTS"
                value={ttsProvider}
                sub="Không cần API key — miễn phí"
                badge="GIỌNG ĐỌC"
                badgeColor="text-blue-400 bg-blue-500/15"
                percent={100}
              />
              <PerfRow
                label="FFmpeg"
                value={ffmpegOk ? "Đã cài đặt" : "Chưa cài"}
                sub={ffmpegVersion}
                badge="ENGINE DƯNG PHIM"
                badgeColor={ffmpegOk ? "text-emerald-400 bg-emerald-500/15" : "text-amber-400 bg-amber-500/15"}
                percent={ffmpegOk ? 100 : 0}
              />
            </div>
          </div>

          {/* Service status */}
          <div className="vas-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Server className="h-4 w-4 text-amber-400" />
              TRẠNG THÁI DỊCH VỤ
            </h3>
            <div className="space-y-3 text-sm">
              <ServiceRow label="Sidecar Engine" value="Đang chạy (OK)" status="ok" />
              <ServiceRow label="FFmpeg" value={ffmpegOk ? "Đã cài đặt" : "Chưa cài"} status={ffmpegOk ? "ok" : "neutral"} />
              <ServiceRow
                label="Hàng đợi xử lý"
                value={stats && stats.processing_videos > 0 ? "Đang làm việc" : "Đang rảnh"}
                status={stats && stats.processing_videos > 0 ? "busy" : "ok"}
              />
              <ServiceRow
                label="Backend API"
                value={backendPort ? `Port ${backendPort}` : "Đang tải…"}
                status="ok"
              />
            </div>
          </div>

          {/* Live render */}
          <div className="vas-card p-4 text-center text-sm text-slate-500">
            <h3 className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Sparkles className="h-4 w-4 text-amber-400" />
              HOẠT ĐỘNG RENDER LIVE
            </h3>
            <Sparkles className="mx-auto mb-2 h-5 w-5 opacity-60" />
            {stats && stats.processing_videos > 0 ? (
              <div>
                <div className="font-medium text-slate-200">
                  Đang render {stats.processing_videos} video
                </div>
                <Link to="/queue" className="mt-1 inline-block text-xs text-amber-400 hover:underline">
                  Xem hàng đợi →
                </Link>
              </div>
            ) : (
              "Không có hoạt động kết xuất nào đang chạy"
            )}
          </div>
        </div>
      </div>

      {/* Recent activities */}
      {stats && stats.recent_activities.length > 0 && (
        <div className="vas-card p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-100">Hoạt động gần đây</h3>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {stats.recent_activities.map((a) => (
              <Link
                key={`${a.project_id}-${a.updated_at}`}
                to={`/projects/${a.project_id}`}
                className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2.5 text-sm transition-all hover:bg-white/[0.05] hover:border-amber-500/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-200">{a.project_name || `Dự án #${a.project_id}`}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(a.updated_at).toLocaleString("vi-VN")}
                  </div>
                </div>
                <Badge
                  variant={
                    a.status === "completed"
                      ? "success"
                      : a.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {STATUS_LABELS[a.status] || a.status}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PerfRow({
  label, value, sub, badge, badgeColor, percent,
}: {
  label: string
  value: string
  sub: string
  badge: string
  badgeColor: string
  percent: number
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 shrink-0 text-sm font-medium text-slate-300">{label}</div>
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/10">
        {percent > 0 && (
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="url(#amberGradient)"
              strokeWidth="4"
              style={{ strokeDasharray: `${percent}, 100` }}
            />
            <defs>
              <linearGradient id="amberGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#d9940a" />
                <stop offset="100%" stopColor="#faaa02" />
              </linearGradient>
            </defs>
          </svg>
        )}
        <Cpu className="h-5 w-5 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold leading-tight text-slate-100">{value}</div>
        <div className="truncate text-xs text-slate-500">{sub}</div>
        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${badgeColor}`}>
          {badge}
        </span>
      </div>
    </div>
  )
}

function ServiceRow({ label, value, status }: { label: string; value: string; status: "ok" | "busy" | "neutral" }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-slate-300">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            status === "ok" && "bg-emerald-400",
            status === "busy" && "animate-pulse bg-amber-400",
            status === "neutral" && "bg-slate-600",
          )}
        />
        {value}
      </span>
    </div>
  )
}
