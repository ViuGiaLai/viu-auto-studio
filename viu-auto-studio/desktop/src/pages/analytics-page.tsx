import { useEffect, useState } from "react"
import { Download, RefreshCw } from "lucide-react"
import { globalApi, type AnalyticsRead } from "@/services/pages-api"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/design-system"

function StatCard({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#141d22] p-4">
      <div className="text-xs text-slate-400">{title}</div>
      <div className="mt-1.5 text-2xl font-bold text-slate-100">{value}</div>
      {note ? <div className="mt-1 text-[11px] text-slate-500">{note}</div> : null}
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(0)

  const load = async (range = days) => {
    try {
      setLoading(true)
      setData(await globalApi.analytics(range))
    } catch (e) {
      toast({ title: "Không tải được phân tích", description: String(e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(days)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const exportCSV = () => {
    if (!data) return
    const rows = [
      ["metric", "value"],
      ["range_days", String(data.range_days ?? days)],
      ["projects_total", String(data.projects.total)],
      ["projects_completed", String(data.projects.completed)],
      ["projects_in_progress", String(data.projects.in_progress)],
      ["projects_failed", String(data.projects.failed)],
      ["scenes_total", String(data.scenes.total)],
      ["scenes_media_ready", String(data.scenes.media_ready)],
      ["jobs_total", String(data.jobs.total)],
      ["jobs_completed", String(data.jobs.completed)],
      ["jobs_failed", String(data.jobs.failed)],
      ["render_avg_minutes", String(data.render.avg_minutes)],
      ["flow_total_tasks", String(data.flow.total_tasks)],
      ["flow_failed_tasks", String(data.flow.failed_tasks)],
      ["flow_success_rate", String(data.flow.success_rate)],
    ]
    const csv = rows.map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `phan-tich-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: "Đã xuất báo cáo CSV từ SQLite" })
  }

  const statusBars = [
    { label: "pending", color: "bg-slate-500" },
    { label: "running", color: "bg-blue-500" },
    { label: "waiting_for_review", color: "bg-amber-500" },
    { label: "completed", color: "bg-emerald-500" },
    { label: "failed", color: "bg-red-500" },
    { label: "cancelled", color: "bg-white/20" },
  ]
  const jobTotal = Math.max(1, data?.jobs.total ?? 0)

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Phân tích</h1>
          <p className="mt-1 text-sm text-slate-400">KPI lấy trực tiếp từ SQLite. Không có số liệu mẫu.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {[
            { value: 0, label: "Toàn bộ" },
            { value: 7, label: "7 ngày" },
            { value: 30, label: "30 ngày" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDays(opt.value)}
              className={`rounded-md border px-2.5 py-1 text-xs ${days === opt.value ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-white/10 text-slate-400"}`}
            >
              {opt.label}
            </button>
          ))}
          <Button variant="outline" size="sm" className="border-amber-500/40 text-amber-300" onClick={exportCSV} disabled={!data}>
            <Download className="mr-2 h-3.5 w-3.5" /> Xuất CSV
          </Button>
          <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => void load()}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Video hoàn thành" value={String(data?.projects.completed ?? 0)} />
        <StatCard
          title="Tỷ lệ Flow thành công"
          value={data && data.flow.total_tasks > 0 ? `${Math.round(data.flow.success_rate)}%` : "—"}
          note={data && data.flow.total_tasks === 0 ? "Chưa có task Flow" : `${data?.flow.total_tasks ?? 0} task`}
        />
        <StatCard
          title="Thời gian render TB"
          value={data && (data.render.completed ?? 0) > 0 ? `${data.render.avg_minutes.toFixed(1)} phút` : "—"}
          note={`${data?.render.completed ?? 0} lần render hoàn tất`}
        />
        <StatCard title="Task Flow lỗi" value={String(data?.flow.failed_tasks ?? 0)} />
        <StatCard title="Dự án" value={String(data?.projects.total ?? 0)} note={`${data?.projects.in_progress ?? 0} đang sản xuất`} />
        <StatCard title="Cảnh có media" value={`${data?.scenes.media_ready ?? 0}/${data?.scenes.total ?? 0}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-[#141d22] p-5">
          <h2 className="text-sm font-semibold text-slate-200">Độ tin cậy nhà cung cấp</h2>
          <div className="mt-3 space-y-3">
            {(data?.providers ?? []).map((p) => (
              <div key={p.name} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate text-slate-300">{p.name}</span>
                <div className="flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${p.total ? p.rate : 0}%` }} />
                  </div>
                </div>
                <span className="w-14 text-right font-mono text-xs text-emerald-400">{p.total ? `${p.rate}%` : "—"}</span>
                <span className="w-24 text-right text-[11px] text-slate-500">{p.total} lần · {p.failed} lỗi</span>
              </div>
            ))}
            {(!data?.providers || data.providers.every((p) => p.total === 0)) && (
              <div className="py-6 text-center text-xs text-slate-500">Chưa có lần chạy để tính độ tin cậy.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-[#141d22] p-5">
          <h2 className="text-sm font-semibold text-slate-200">Trạng thái task</h2>
          <div className="mt-4 flex items-center gap-2">
            {statusBars.map((s) => {
              const count = data?.jobs.by_status?.[s.label] ?? 0
              const pct = (count / jobTotal) * 100
              return (
                <div key={s.label} className="flex-1 text-center">
                  <div className="flex h-16 flex-col-reverse overflow-hidden rounded-md bg-white/5">
                    <div className={s.color} style={{ height: `${pct}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">{s.label.replace(/_/g, " ")}</div>
                  <div className="text-[10px] text-slate-400">{count}</div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-white/10 bg-[#0c1318] p-2.5">
              <div className="text-lg font-bold text-slate-100">{data?.jobs.total ?? 0}</div>
              <div className="text-[11px] text-slate-500">Tổng task</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0c1318] p-2.5">
              <div className="text-lg font-bold text-emerald-400">{data?.jobs.completed ?? 0}</div>
              <div className="text-[11px] text-slate-500">Hoàn thành</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0c1318] p-2.5">
              <div className="text-lg font-bold text-red-400">{data?.jobs.failed ?? 0}</div>
              <div className="text-[11px] text-slate-500">Thất bại</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
