import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  RefreshCw, Settings, BarChart3, Play, RotateCcw, ScrollText, ArrowRight,
  Sparkles, MessageSquare, Clock, AlertTriangle, CheckCircle2,
} from "lucide-react"
import { api, openExternalUrl } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/utils/cn"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/design-system"
import { Button } from "@/components/design-system"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/design-system"
import { STATUS_LABELS } from "@/types"

type Channel = { id: number; name: string; description: string; niche: string }
type Idea = {
  id: number
  title: string
  subtitle: string
  status: string
  aspect: string
  script?: { sentences: string[]; duration_s?: number }
  error?: string
  voiceProgress?: number
}

const STEP_META = [
  { key: "kịch_bản_giọng", label: "Kịch bản & Giọng" },
  { key: "phan_canh", label: "Phân cảnh Visual" },
  { key: "nhan_vat", label: "Nhân vật" },
]

const STEP_LABEL_MAP: Record<string, string> = {
  "Dữ kiện": "Thu thập dữ liệu",
  "Kịch bản": "Kịch bản",
  "Lồng tiếng": "Lồng tiếng",
  "Storyboard": "Storyboard",
  "Ảnh/Video": "Ảnh/Video",
  "Dựng phim": "Dựng phim",
  "SEO": "SEO",
}

const PROGRESS_STEPS = [
  { key: "Dữ kiện", label: "Thu thập dữ liệu" },
  { key: "Kịch bản", label: "Kịch bản" },
  { key: "Lồng tiếng", label: "Lồng tiếng" },
  { key: "Storyboard", label: "Storyboard" },
  { key: "Ảnh/Video", label: "Ảnh/Video" },
  { key: "Dựng phim", label: "Dựng phim" },
  { key: "SEO", label: "SEO" },
]

export default function WorkspacePage() {
  const navigate = useNavigate()
  const { channelId } = useParams()
  const [channels, setChannels] = useState<Channel[]>([])
  const [selected, setSelected] = useState<Channel | null>(null)
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [videoType, setVideoType] = useState("🎬 Video dài")
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [generating, setGenerating] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState<number | null>(null)
  const [activeStep, setActiveStep] = useState("kịch_bản_giọng")
  const [pipeline, setPipeline] = useState<{
    status: string
    error: string
    steps: Array<{ key: string; label: string; status: string; progress: number; error: string }>
  } | null>(null)
  const [scripts, setScripts] = useState<Record<number, { title: string; sentences: string[] }>>({})
  const [jobs, setJobs] = useState<
    Array<{ id: number; project_id: number; status: string; current_step: string; error_message: string; progress: number }>
  >([])

  useEffect(() => {
    api
      .listChannels()
      .then((list) => {
        setChannels(list)
        if (channelId) {
          const found = list.find((c) => String(c.id) === channelId) || null
          setSelected(found)
        } else {
          setSelected(list[0] ?? null)
        }
      })
      .catch(() => toast({ title: "Không thể tải kênh", variant: "destructive" }))
      .finally(() => setChannelsLoading(false))
  }, [channelId])

  useEffect(() => {
    if (!selected) return
    api
      .listProjects()
      .then(async (projects) => {
        const channelProjects = projects.filter(
          (p) => (p as { channel_id?: number | null }).channel_id === selected.id,
        )
        const ideasList: Idea[] = channelProjects.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.topic || "",
          status: p.status,
          aspect: p.aspect_ratio === "9:16" ? "📱 9:16" : "🖼 16:9",
        }))
        setIdeas(ideasList)
        setSelectedIdea(ideasList[0]?.id ?? null)

        const scriptsMap: Record<number, { title: string; sentences: string[] }> = {}
        for (const p of channelProjects.slice(0, 5)) {
          try {
            const script = await api.getScript(p.id)
            if (script?.approved && script.full_script) {
              scriptsMap[p.id] = { title: script.title || p.name, sentences: script.full_script.split("\n").filter(Boolean) }
            }
          } catch {
            /* skip */
          }
        }
        setScripts(scriptsMap)

        try {
          const jobsList = await api.listJobs()
          setJobs(jobsList.slice(0, 10))
        } catch {
          /* skip */
        }
      })
      .catch(() => {
        /* ignore */
      })
  }, [selected])

  useEffect(() => {
    if (!selectedIdea || selectedIdea <= 0) {
      setPipeline(null)
      return
    }
    api
      .pipelineStatus(selectedIdea)
      .then((state) => {
        const steps = Object.entries(state.step_data_json || {}).map(([label, status]) => {
          let s = "pending"
          let p = 0
          if (status === "success") { s = "done"; p = 100 }
          else if (status === "skipped") { s = "done"; p = 100 }
          else if (status === "failed") { s = "failed"; p = 0 }
          else if (status === "running") { s = "running"; p = 50 }
          else if (typeof status === "string" && status.endsWith("%")) {
            p = parseInt(status.replace("%", ""))
            s = p > 0 ? "running" : "pending"
          }
          return { key: label, label: STEP_LABEL_MAP[label] || label, status: s, progress: p, error: "" }
        })
        const errorStep = state.error_step || ""
        setPipeline({
          status: state.status,
          error: errorStep ? `Lỗi ở bước ${errorStep}` : "",
          steps,
        })
      })
      .catch(() => setPipeline(null))
  }, [selectedIdea])

  const idea = ideas.find((i) => i.id === selectedIdea) ?? null
  const ideaScript = idea ? scripts[idea.id] : undefined
  const ideaJob = jobs.find((j) => j.project_id === selectedIdea)
  const voiceProgress = useMemo(() => {
    if (!ideaJob) return null
    if (ideaJob.status === "running") return ideaJob.progress
    return null
  }, [ideaJob])

  const handleGenerate = async () => {
    if (!selected) return
    setGenerating(true)
    try {
      await api.createProject({
        name: `Tập #${ideas.filter((i) => i.id > 0).length + 1} — ${selected.name}`,
        channel_id: selected.id,
        topic: selected.niche || selected.description || "Chủ đề mới",
        video_type: videoType.includes("dài") ? "long" : "short",
        aspect_ratio: videoType.includes("dài") ? "16:9" : "9:16",
        language: "vi",
        target_duration: videoType.includes("dài") ? 240 : 90,
      })
      toast({ title: "Đã tạo tập mới cho kênh", description: "Hãy tiếp tục ở tab Dự án để viết kịch bản." })
      const list = await api.listProjects()
      const mine = list
        .filter((p) => (p as { channel_id?: number | null }).channel_id === selected.id)
        .map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.topic || "",
          status: p.status,
          aspect: p.aspect_ratio === "9:16" ? "📱 9:16" : "🖼 16:9",
        }))
      setIdeas(mine)
      setSelectedIdea(mine[0]?.id ?? null)
    } catch (e) {
      toast({ title: "Không thể sinh tập", description: String(e), variant: "destructive" })
    } finally {
      setGenerating(false)
    }
  }

  const stepProgressColor = (status: string) => {
    if (status === "done") return "progress-fill-green"
    if (status === "running") return "progress-fill-orange"
    if (status === "failed") return "progress-fill-red"
    return "progress-fill-gray"
  }

  return (
    <div className="min-h-full p-8">
      {/* Channel bar header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {channelsLoading ? (
            <span className="text-sm text-slate-500">Đang tải kênh...</span>
          ) : (
            channels.map((c) => (
              <Button variant="ghost"
                key={c.id}
                onClick={() => setSelected(c)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-200",
                  selected?.id === c.id
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                    : "border-white/8 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-300",
                )}
              >
                🦌 {c.name}
              </Button>
            ))
          )}
          <span className="rounded-lg bg-gradient-to-r from-[#d9940a] to-[#faaa02] px-2.5 py-1 text-xs font-bold text-white shadow-md">
            AI STUDIO
          </span>
          <span className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400">
            🎬 Video
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FlowLoginButton />
          <Button variant="ghost"
            onClick={() => navigate("/analytics")}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-slate-300 transition-colors hover:bg-white/[0.06]"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Thống kê
          </Button>
          <Link to="/settings">
            <Button variant="outline" size="sm" className="gap-1.5 border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]">
              <Settings className="h-3.5 w-3.5" />
              Cấu hình
            </Button>
          </Link>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        {selected
          ? `Kênh ${selected.name} — dây chuyền sản xuất tập mới`
          : "Chưa có kênh nào. Hãy tạo kênh ở trang Dự án."}
        {" — bấm Sinh ý tưởng để bắt đầu"}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[300px_1fr_340px]">
        {/* Left: Ý tưởng */}
        <div className="vas-card self-start p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">💡 Ý tưởng</h3>
          <Select value={videoType} onValueChange={setVideoType}>
            <SelectTrigger className="mb-3 border-white/10 bg-white/[0.03] text-slate-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#141d22]">
              <SelectItem value="🎬 Video dài">🎬 Video dài (16:9)</SelectItem>
              <SelectItem value="📱 Video ngắn">📱 Video ngắn (9:16)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost"
            onClick={handleGenerate}
            disabled={generating || !selected}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#f97316] to-[#ef4444] px-3 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition-all hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {generating ? "Đang sinh..." : "✨ Sinh"}
          </Button>

          <div className="space-y-2">
            {ideas.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-slate-500">
                Chưa có tập thật. Bấm Sinh để tạo dự án mới trên kênh này.
              </div>
            )}
            {ideas.map((i) => (
              <Button variant="ghost"
                key={i.id}
                onClick={() => setSelectedIdea(i.id)}
                className={cn(
                  "w-full rounded-lg border p-2.5 text-left text-sm transition-all duration-200",
                  selectedIdea === i.id
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-medium text-slate-200">{i.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">{i.aspect}</span>
                </div>
                <div className="truncate text-xs text-slate-500">{i.subtitle}</div>
                <StatusPill status={i.status} />
              </Button>
            ))}
          </div>
        </div>

        {/* Center */}
        <div className="space-y-4">
          {/* Steps bar */}
          <div className="flex items-center gap-1 rounded-lg border border-white/8 bg-[#141d22] p-1">
            {STEP_META.map((s) => (
              <Button variant="ghost"
                key={s.key}
                onClick={() => setActiveStep(s.key)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-all duration-200",
                  activeStep === s.key
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-slate-400 hover:bg-white/[0.05]",
                )}
              >
                {s.label}
                {s.key === "phan_canh" && pipeline?.status === "failed" && (
                  <span className="ml-1.5 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400">failed</span>
                )}
              </Button>
            ))}
          </div>

          {/* Error banner */}
          {pipeline?.error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div>
                <span className="font-semibold text-red-300">⚠ Lỗi ở bước {pipeline.steps.find((s) => s.status === "failed")?.label || "product"} — </span>
                <span className="text-slate-300">{pipeline.error}</span>
                <Link to="/settings" className="ml-1 text-amber-400 hover:underline">
                  Mở Cấu hình để sửa →
                </Link>
              </div>
            </div>
          )}

          {/* Idea title card */}
          {idea && idea.id > 0 && (
            <div className="vas-card p-5">
              <h2 className="text-lg font-bold text-slate-100">{ideaScript?.title ?? idea.title}</h2>
              <p className="mt-1 italic text-slate-500">"{idea.subtitle}"</p>
            </div>
          )}

          {/* Voiceover card */}
          <div className="vas-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">🎙 Giọng đọc (voiceover)</h3>
            {voiceProgress !== null ? (
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                  <Clock className="h-4 w-4 animate-pulse text-amber-400" />
                  Đang tạo lại giọng đọc — {voiceProgress}%
                </div>
                <div className="progress-track">
                  <div className="progress-fill progress-fill-orange" style={{ width: `${voiceProgress}%` }} />
                </div>
              </div>
            ) : idea && idea.id > 0 ? (
              <div className="text-sm text-slate-500">
                Giọng đọc sẽ được tạo tự động khi chạy render. Mỗi cảnh có giọng đọc riêng.
              </div>
            ) : (
              <div className="text-sm text-slate-500">Chọn một tập bên trái để xem trạng thái giọng đọc.</div>
            )}
          </div>

          {/* Script card */}
          <div className="vas-card p-4">
            <h3 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-200">
              <span>📋 Kịch bản</span>
              {ideaScript && <span className="text-xs font-normal text-slate-500">{ideaScript.sentences.length} câu</span>}
            </h3>
            {ideaScript ? (
              <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                {ideaScript.sentences.slice(0, 40).map((s, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/[0.04]">
                    <span className="w-8 shrink-0 font-mono text-slate-600">
                      {Math.floor(idx * 5 / 60)}:{String((idx * 5) % 60).padStart(2, "0")}
                    </span>
                    <span>{s}</span>
                  </div>
                ))}
                <div className="pt-1 text-right text-xs text-slate-600">
                  Tập #{idea?.id} · {ideaScript.sentences.length} câu
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-slate-500">
                Chưa có kịch bản. Hãy tạo và duyệt kịch bản ở tab Kịch bản.
              </div>
            )}
          </div>
        </div>

        {/* Right: Tiến độ sản xuất */}
        <div className="vas-card self-start p-4">
          <h3 className="text-sm font-semibold text-slate-200">Tiến độ sản xuất</h3>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-slate-500">Trạng thái:</span>
            <span
              className={cn(
                "font-semibold",
                (pipeline?.status ?? "") === "completed" && "text-emerald-400",
                (pipeline?.status ?? "") === "failed" && "text-red-400",
                ["running", "rendering", "generating_voice", "building_scenes", "preparing_media", "generating_subtitles"].includes(pipeline?.status ?? "") && "text-amber-400",
                (!pipeline || pipeline.status === "idle" || pipeline.status === "draft") && "text-slate-600",
              )}
            >
              {STATUS_LABELS[pipeline?.status ?? "idle"] || pipeline?.status || "Chưa bắt đầu"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {pipeline?.steps.length ? (
              pipeline.steps.map((s) => (
                <div key={s.key} className="text-xs">
                  <div className="mb-1 flex items-center gap-2">
                    {statusDot(s.status)}
                    <span className="font-medium text-slate-300">{s.label}</span>
                    <span className="ml-auto text-slate-600">{s.progress}%</span>
                  </div>
                  <div className="progress-track h-1.5">
                    <div className={`progress-fill ${stepProgressColor(s.status)}`} style={{ width: `${s.progress}%` }} />
                  </div>
                  {s.status === "failed" && s.error && (
                    <div className="mt-1 rounded border border-red-500/30 bg-red-500/10 p-2 text-red-300">
                      {s.error}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-4 text-center text-sm text-slate-500">
                Chọn một tập để xem tiến độ.
              </div>
            )}
          </div>

          {pipeline?.status === "failed" && (
            <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
              <div className="flex gap-2">
                <Link to={selectedIdea ? `/projects/${selectedIdea}` : "/projects"} className="flex-1">
                  <Button variant="ghost" className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#f97316] to-[#ef4444] px-3 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition-all hover:brightness-110">
                    <Play className="h-3.5 w-3.5" />
                    Tiếp tục
                  </Button>
                </Link>
                <Button variant="ghost"
                  onClick={async () => {
                    if (!selectedIdea || selectedIdea <= 0) return
                    try {
                      const list = await api.listJobs()
                      const job = list.find((j) => j.project_id === selectedIdea && j.status === "failed")
                      if (job) {
                        await api.retryJob(job.id)
                        toast({ title: "Đang thử lại từ bước lỗi..." })
                      }
                    } catch (e) {
                      toast({ title: "Không thể thử lại", description: String(e), variant: "destructive" })
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/[0.06]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Từ bước lỗi
                </Button>
                <Button variant="ghost"
                  onClick={async () => {
                    if (!selectedIdea || selectedIdea <= 0) return
                    try {
                      const list = await api.listJobs()
                      const job = list.find((j) => j.project_id === selectedIdea)
                      if (job) {
                        const log = await api.getJobLog(job.id, 50)
                        const text = log.lines.join("\n")
                        navigator.clipboard.writeText(text)
                        toast({ title: "Nhật ký đã sao chép" })
                      }
                    } catch {
                      toast({ title: "Không lấy được nhật ký", variant: "destructive" })
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/[0.06]"
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  Nhật ký
                </Button>
              </div>
              <Link
                to="/queue"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/15"
              >
                Xem Queue kênh này
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function statusDot(status: string) {
  return status === "done" ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
  ) : status === "running" ? (
    <Clock className="h-4 w-4 animate-pulse text-amber-400" />
  ) : status === "failed" ? (
    <AlertTriangle className="h-4 w-4 text-red-400" />
  ) : (
    <span className="h-4 w-4 rounded-full border border-slate-600/40" />
  )
}

function FlowLoginButton() {
  const [open, setOpen] = useState(false)
  const [flowState, setFlowState] = useState<{ logged_in: boolean } | null>(null)
  // Flow login state is tracked from the backend settings (flow_logged_in).
  useEffect(() => {
    api
      .settingsGet()
      .then((s) => setFlowState({ logged_in: (s as unknown as { flow_logged_in?: boolean })?.flow_logged_in === true }))
      .catch(() => setFlowState({ logged_in: false }))
  }, [])
  const doLogin = async () => {
    try {
      await api.flowLogin()
      openExternalUrl("https://labs.google/")
      toast({ title: "Đã mở Google Labs để đăng nhập Flow", description: "Hoàn tất đăng nhập, sau đó quay lại Workspace." })
    } catch (e) {
      toast({ title: "Mở trang đăng nhập Flow thất bại", description: String(e), variant: "destructive" })
    }
  }
  return (
    <>
      <Button variant="ghost"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm transition-colors hover:bg-white/[0.06]"
        title="Tài khoản Google Flow"
      >
        <span className="text-xs text-slate-400">Flow</span>
        <span className={cn("h-2 w-2 rounded-full", flowState?.logged_in ? "bg-emerald-400" : "bg-red-400/70")} />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-24" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-xl border border-white/10 bg-[#0c1318] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-200">Tài khoản Google Flow</h3>
                <p className="mt-1 text-xs text-slate-500">Quản lý đăng nhập Flow để tạo ảnh/video từ Labs</p>
              </div>
              <Button variant="ghost"
                onClick={doLogin}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-emerald-500"
              >
                + Thêm
              </Button>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-slate-300">
              {flowState?.logged_in
                ? "Đã đăng nhập Flow. Kênh sẽ dùng phiên mặc định khi tạo media."
                : "Chưa thêm tài khoản nào. Bấm \"+ Thêm\" để đăng nhập, hoặc dùng phiên mặc định:"}
            </p>
            <Button variant="ghost"
              onClick={doLogin}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.06]"
            >
              Đăng nhập nhanh (phiên mặc định)
            </Button>
            <p className="mt-4 text-xs text-slate-500">
              Quản lý đầy đủ (bật/tắt, xóa, thử lại) ở Cài đặt → Tài khoản Flow.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-emerald-500/15 text-emerald-400"
      : status === "failed"
        ? "bg-red-500/15 text-red-400"
        : status === "running" || status.startsWith("generating") || status.startsWith("render")
          ? "bg-amber-500/15 text-amber-400"
          : "bg-white/[0.04] text-slate-500"
  return <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{status}</span>
}
