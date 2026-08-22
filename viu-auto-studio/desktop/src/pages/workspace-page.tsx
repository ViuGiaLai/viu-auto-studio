import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams, useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  ImageIcon,
  MessageSquare,
  Play,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Settings,
  Sparkles,
  Users,
} from "lucide-react"
import { api, startFlowBrowser } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/utils/cn"
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/design-system"
import { STATUS_LABELS } from "@/types"
import type { Character, PipelineState, Project, Scene, ScriptData } from "@/types"

type PipelineView = {
  status: string
  error: string
  steps: Array<{ key: string; label: string; status: string; progress: number; error: string }>
}

type Snapshot = {
  project: Project
  script: ScriptData | null
  scenes: Scene[]
  characters: Character[]
  pipeline: PipelineView | null
}

const STAGES = [
  { key: "script", label: "Kịch bản & Giọng", short: "Kịch bản", icon: FileText },
  { key: "storyboard", label: "Phân cảnh Visual", short: "Visual", icon: ImageIcon },
  { key: "characters", label: "Nhân vật", short: "Nhân vật", icon: Users },
  { key: "media", label: "Media", short: "Media", icon: Sparkles },
  { key: "publish", label: "Dựng phim", short: "Dựng phim", icon: Play },
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

function pipelineToView(state: PipelineState | null): PipelineView | null {
  if (!state) return null
  const steps = state.steps?.length
    ? state.steps.map((step) => ({
      key: step.key,
      label: step.label,
      status: step.status === "done" ? "done" : step.status,
      progress: step.progress ?? 0,
      error: step.error || "",
    }))
    : Object.entries(state.step_data_json || {}).map(([label, value]) => {
      let status = "pending"
      let progress = 0
      if (value === "success" || value === "skipped") {
        status = "done"
        progress = 100
      } else if (value === "failed") {
        status = "failed"
      } else if (value === "running") {
        status = "running"
        progress = 50
      } else if (typeof value === "string" && value.endsWith("%")) {
        progress = Number.parseInt(value, 10) || 0
        status = progress > 0 ? "running" : "pending"
      }
      return { key: label, label: STEP_LABEL_MAP[label] || label, status, progress, error: "" }
    })
  return {
    status: state.status,
    error: state.error_step ? `Lỗi ở bước ${state.error_step}` : state.last_log || "",
    steps,
  }
}

export default function WorkspacePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [action, setAction] = useState<"prepare" | "flow" | "retry" | null>(null)
  const [factoryPreflight, setFactoryPreflight] = useState<Awaited<ReturnType<typeof api.systemPreflight>> | null>(null)
  const [installingFactory, setInstallingFactory] = useState(false)

  const loadProjects = useCallback(async () => {
    const list = await api.listProjects()
    setProjects(list)
    const queryId = Number(searchParams.get("projectId") || 0)
    const storedId = Number(localStorage.getItem("vas.studio.projectId") || 0)
    const preferred = queryId || storedId
    const nextId = list.some((project) => project.id === preferred) ? preferred : list[0]?.id ?? null
    setSelectedProjectId(nextId)
    if (nextId && String(queryId) !== String(nextId)) {
      setSearchParams({ projectId: String(nextId) }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const loadSnapshot = useCallback(async (projectId: number, quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [project, script, scenes, characters, pipeline] = await Promise.all([
        api.getProject(projectId),
        api.getScript(projectId).catch(() => null),
        api.listScenes(projectId).catch(() => []),
        api.listCharacters(projectId).catch(() => []),
        api.pipelineStatus(projectId).then(pipelineToView).catch(() => null),
      ])
      setSnapshot({ project, script, scenes, characters, pipeline })
    } catch (error) {
      setSnapshot(null)
      toast({ title: "Không tải được dữ liệu sản xuất", description: String(error), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    loadProjects()
      .catch((error) => {
        if (active) toast({ title: "Không tải được danh sách dự án", description: String(error), variant: "destructive" })
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadProjects])

  useEffect(() => {
    if (!selectedProjectId) {
      setSnapshot(null)
      return
    }
    localStorage.setItem("vas.studio.projectId", String(selectedProjectId))
    void loadSnapshot(selectedProjectId)
    const timer = window.setInterval(() => void loadSnapshot(selectedProjectId, true), 5000)
    return () => window.clearInterval(timer)
  }, [selectedProjectId, loadSnapshot])

  const selectProject = (value: string) => {
    const id = Number(value)
    if (!id) return
    setSelectedProjectId(id)
    setSearchParams({ projectId: String(id) })
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      await loadProjects()
      if (selectedProjectId) await loadSnapshot(selectedProjectId, true)
      toast({ title: "Đã cập nhật Production Dashboard" })
    } catch (error) {
      toast({ title: "Không thể cập nhật", description: String(error), variant: "destructive" })
    } finally {
      setRefreshing(false)
    }
  }

  const openStage = (stage: string) => {
    if (!selectedProjectId) {
      toast({ title: "Chưa chọn dự án", description: "Chọn một project có sẵn để mở bước sản xuất." })
      return
    }
    navigate(`/projects/${selectedProjectId}?stage=${stage}`)
  }

  const prepareProduction = async () => {
    if (!selectedProjectId || !snapshot) return
    setAction("prepare")
    try {
      let scenes = snapshot.scenes
      const needsScenePreparation = scenes.length === 0 || scenes.some((scene) => !scene.visual_prompt)
      if (!snapshot.script?.approved) {
        const approval = await api.approveScript(selectedProjectId)
        if (approval.needs_scene_analysis || needsScenePreparation) {
          const analysis = await api.semanticAnalyze(selectedProjectId, {
            existing_narrations: scenes.map((scene) => scene.narration).filter(Boolean),
          })
          await api.buildScenes(selectedProjectId, analysis.scenes.length ? { semantic_analysis: analysis.scenes } : undefined)
        }
      } else if (needsScenePreparation) {
        const analysis = await api.semanticAnalyze(selectedProjectId, {
          existing_narrations: scenes.map((scene) => scene.narration).filter(Boolean),
        })
        await api.buildScenes(selectedProjectId, analysis.scenes.length ? { semantic_analysis: analysis.scenes } : undefined)
      }
      const prepared = await api.pipelineStartAuto(selectedProjectId)
      if (!prepared.ok) throw new Error("Backend không khởi động được bước chuẩn bị sản xuất")
      await loadSnapshot(selectedProjectId, true)
      toast({ title: "Đã tiếp tục sản xuất", description: "Kịch bản, phân cảnh và TTS đang được chuẩn bị bằng pipeline thật." })
    } catch (error) {
      toast({ title: "Không thể tiếp tục sản xuất", description: String(error), variant: "destructive" })
    } finally {
      setAction(null)
    }
  }

  const startFactory = async () => {
    if (!selectedProjectId || !snapshot) return
    setAction("flow")
    try {
      const preflight = await api.systemPreflight("factory")
      if (!preflight.ok) {
        setFactoryPreflight(preflight)
        setAction(null)
        return
      }
      const factory = await api.factoryStart(selectedProjectId, {
        media_type: "image",
        aspect: snapshot.project.aspect_ratio || "16:9",
        include_video: true,
        factory_mode: true,
      })
      const browser = await startFlowBrowser(selectedProjectId, factory.factory_session_id)
      if (!browser.ok) throw new Error(browser.message || "Không mở được Chrome Profile Google Flow")
      await loadSnapshot(selectedProjectId, true)
      toast({
        title: factory.requires_login ? "Đã mở Google Flow để đăng nhập" : "Factory Flow đã khởi động",
        description: factory.requires_login ? "Đăng nhập một lần trong Chrome Profile riêng; queue sẽ tự tiếp tục." : "Ảnh/video sẽ được tạo theo queue của project.",
      })
    } catch (error) {
      toast({ title: "Không thể khởi động Factory Flow", description: String(error), variant: "destructive" })
    } finally {
      setAction(null)
    }
  }

  const installAndContinueFactory = async () => {
    if (!factoryPreflight || !selectedProjectId || !snapshot) return
    setInstallingFactory(true)
    try {
      const installable = factoryPreflight.missing.filter((item) => item.id === "yt_dlp" || item.id === "demucs" || item.id === "pytorch")
      if (installable.length) await api.installCapability(installable.map((item) => item.id))
      const refreshed = await api.systemPreflight("factory")
      if (!refreshed.ok) throw new Error(`Factory vẫn thiếu: ${refreshed.missing.map((item) => item.label).join(", ")}`)
      setFactoryPreflight(null)
      await startFactory()
    } catch (error) {
      toast({ title: "Factory chưa sẵn sàng", description: String(error), variant: "destructive" })
    } finally {
      setInstallingFactory(false)
    }
  }

  const retryFailed = async () => {
    if (!selectedProjectId) return
    setAction("retry")
    try {
      const jobs = await api.listJobs()
      const job = jobs.find((item) => item.project_id === selectedProjectId && item.status === "failed")
      if (!job) throw new Error("Project chưa có render job thất bại để thử lại")
      await api.retryJob(job.id)
      await loadSnapshot(selectedProjectId, true)
      toast({ title: "Đã đưa job lỗi vào hàng đợi thử lại" })
    } catch (error) {
      toast({ title: "Không thể thử lại", description: String(error), variant: "destructive" })
    } finally {
      setAction(null)
    }
  }

  const copyJobLog = async () => {
    if (!selectedProjectId) return
    try {
      const jobs = await api.listJobs()
      const job = jobs.find((item) => item.project_id === selectedProjectId)
      if (!job) throw new Error("Project chưa có job để đọc nhật ký")
      const log = await api.getJobLog(job.id, 80)
      await navigator.clipboard.writeText(log.lines.join("\n"))
      toast({ title: "Đã sao chép nhật ký job" })
    } catch (error) {
      toast({ title: "Không lấy được nhật ký", description: String(error), variant: "destructive" })
    }
  }

  const stats = useMemo(() => {
    const scenes = snapshot?.scenes || []
    const total = scenes.length
    const visuals = scenes.filter((scene) => Boolean(scene.media_path || scene.image_path || scene.video_path)).length
    const voices = scenes.filter((scene) => Boolean(scene.audio_path)).length
    const failedScenes = scenes.filter((scene) => scene.status === "failed" || Boolean(scene.error_message)).length
    const scriptReady = Boolean(snapshot?.script?.approved)
    const progressParts = [scriptReady, total > 0, voices === total && total > 0, visuals === total && total > 0, snapshot?.project.status === "completed"]
    const productionProgress = Math.round((progressParts.filter(Boolean).length / progressParts.length) * 100)
    return { total, visuals, voices, failedScenes, scriptReady, productionProgress }
  }, [snapshot])

  const nextAction = stats.failedScenes > 0
    ? "retry"
    : !stats.scriptReady || stats.total === 0
      ? "prepare"
      : stats.visuals < stats.total
        ? "flow"
        : "open"

  if (loading && !snapshot) {
    return <div className="p-8 text-sm text-slate-400">Đang tải Production Dashboard…</div>
  }

  return (
    <div className="min-h-full bg-[#0B0F12] p-6 text-slate-100 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-xs font-black text-slate-950">AI STUDIO</span>
            <span className="text-sm font-semibold text-slate-300">Production Dashboard</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Nơi tiếp tục sản xuất project đã có. Quản lý và tạo project vẫn nằm ở trang Dự án.</p>
        </div>
        <div className="flex items-center gap-2">
          <FlowLoginButton />
          <Button variant="ghost" onClick={() => void refresh()} disabled={refreshing} className="gap-1.5 border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /> Cập nhật
          </Button>
          <Link to="/analytics"><Button variant="ghost" className="gap-1.5 border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"><BarChart3 className="h-4 w-4" /> Thống kê</Button></Link>
          <Link to="/settings"><Button variant="outline" size="sm" className="gap-1.5 border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"><Settings className="h-4 w-4" /> Cấu hình</Button></Link>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-cyan-400/20 bg-[#101A20] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label htmlFor="studio-project" className="text-sm font-semibold text-slate-300">Project đang sản xuất</label>
            <Select value={selectedProjectId ? String(selectedProjectId) : ""} onValueChange={selectProject}>
              <SelectTrigger id="studio-project" className="min-w-[280px] border-white/10 bg-[#0C1419] text-slate-200"><SelectValue placeholder="Chọn dự án có sẵn" /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#141d22]">
                {projects.map((project) => <SelectItem key={project.id} value={String(project.id)}>{project.name} · {STATUS_LABELS[project.status] || project.status}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedProjectId && <Button variant="ghost" onClick={() => navigate(`/projects/${selectedProjectId}`)} className="gap-1.5 text-cyan-300 hover:bg-cyan-500/10">Mở Project Editor <ArrowRight className="h-4 w-4" /></Button>}
        </div>
      </section>

      {!projects.length ? (
        <section className="mt-6 flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
          <MessageSquare className="h-10 w-10 text-slate-600" />
          <h2 className="mt-4 text-lg font-semibold text-slate-200">Chọn một dự án để bắt đầu sản xuất</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">AI Studio không tạo project mới. Hãy tạo hoặc mở project ở trang Dự án, sau đó quay lại đây để tiếp tục pipeline.</p>
          <Button onClick={() => navigate("/projects")} className="mt-5 gap-2 bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400">Chọn dự án <ArrowRight className="h-4 w-4" /></Button>
        </section>
      ) : !snapshot ? (
        <section className="mt-6 flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.03] p-8 text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-cyan-300" />
          <h2 className="mt-4 text-lg font-semibold text-slate-200">Đang tải dữ liệu project</h2>
          <p className="mt-2 text-sm text-slate-500">Đang đọc script, scenes, nhân vật và pipeline từ backend thật.</p>
        </section>
      ) : (
        <>
          {factoryPreflight && (
            <section className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><h2 className="text-base font-semibold text-amber-100">Preflight Factory Flow</h2><p className="mt-1 text-sm text-slate-300">Thiếu: {factoryPreflight.missing.map((item) => item.label).join(", ")}. Dung lượng dự kiến: {factoryPreflight.estimated_size}.</p><p className="mt-1 text-xs text-slate-400">Bạn có thể cài thành phần tùy chọn hoặc xử lý yêu cầu Chrome/Profile trong Settings.</p></div>
                <div className="flex shrink-0 gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setFactoryPreflight(null)}>Huỷ</Button><Button type="button" size="sm" onClick={() => void installAndContinueFactory()} disabled={installingFactory}>{installingFactory ? "Đang cài…" : "Cài đặt & tiếp tục"}</Button></div>
              </div>
            </section>
          )}

          <section className="mt-6 rounded-2xl border border-white/10 bg-[#101A20] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-white">{snapshot.project.name}</h1><StatusPill status={snapshot.project.status} /></div>
                <p className="mt-1 text-sm text-slate-500">{snapshot.project.topic || "Chưa có chủ đề"} · {snapshot.project.aspect_ratio} · {snapshot.project.target_duration}s mục tiêu</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void prepareProduction()} disabled={action !== null} className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 font-bold text-slate-950 hover:brightness-110"><Play className="h-4 w-4" />{action === "prepare" ? "Đang chuẩn bị…" : "Tiếp tục sản xuất"}</Button>
                <Button variant="ghost" onClick={() => void startFactory()} disabled={action !== null || stats.total === 0} className="gap-2 border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"><Sparkles className="h-4 w-4" />{action === "flow" ? "Đang mở Flow…" : "Chạy Factory Flow"}</Button>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all" style={{ width: `${stats.productionProgress}%` }} /></div><span className="text-sm font-bold text-cyan-300">{stats.productionProgress}%</span></div>
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Kịch bản" value={stats.scriptReady ? "Đã duyệt" : "Chưa duyệt"} hint={stats.scriptReady ? "Sẵn sàng cho pipeline" : "Cần duyệt trước khi sản xuất"} icon={<FileText className="h-4 w-4" />} onClick={() => openStage("script")} />
            <MetricCard label="Voiceover" value={`${stats.voices}/${stats.total}`} hint="Cảnh đã có audio" icon={<MessageSquare className="h-4 w-4" />} onClick={() => openStage("script")} />
            <MetricCard label="Phân cảnh Visual" value={`${stats.visuals}/${stats.total}`} hint="Cảnh đã có media" icon={<ImageIcon className="h-4 w-4" />} onClick={() => openStage("storyboard")} />
            <MetricCard label="Nhân vật" value={String(snapshot.characters.length)} hint="Đồng bộ trong project" icon={<Users className="h-4 w-4" />} onClick={() => openStage("characters")} />
            <MetricCard label="Lỗi cần xử lý" value={String(stats.failedScenes)} hint={stats.failedScenes ? "Cần kiểm tra ngay" : "Không phát hiện lỗi cảnh"} icon={<AlertTriangle className="h-4 w-4" />} tone={stats.failedScenes ? "danger" : "normal"} onClick={stats.failedScenes ? () => void retryFailed() : undefined} />
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="rounded-2xl border border-white/10 bg-[#101A20] p-5">
              <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-semibold text-slate-100"><Sparkles className="h-4 w-4 text-amber-400" /> Quy trình sản xuất</h2><span className="text-xs text-slate-500">Bấm một bước để mở editor đúng vị trí</span></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {STAGES.map((stage) => {
                  const Icon = stage.icon
                  const done = stage.key === "script" ? stats.scriptReady : stage.key === "storyboard" ? stats.visuals === stats.total && stats.total > 0 : stage.key === "characters" ? snapshot.characters.length > 0 : stage.key === "media" ? stats.visuals > 0 : snapshot.project.status === "completed"
                  return <button key={stage.key} type="button" onClick={() => openStage(stage.key)} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left transition-colors hover:border-cyan-400/30 hover:bg-cyan-500/[0.06]"><span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", done ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.06] text-slate-400")}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-200">{stage.label}</span><span className="block text-xs text-slate-500">{done ? "Đã sẵn sàng" : "Cần tiếp tục xử lý"}</span></span><ArrowRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-cyan-300" /></button>
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#101A20] p-5">
              <h2 className="text-base font-semibold text-slate-100">Tiến độ pipeline</h2>
              <div className="mt-4 space-y-3">{snapshot.pipeline?.steps.length ? snapshot.pipeline.steps.map((step) => <div key={step.key}><div className="mb-1 flex items-center gap-2 text-xs"><span>{statusDot(step.status)}</span><span className="font-medium text-slate-300">{step.label}</span><span className="ml-auto text-slate-500">{step.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={cn("h-full transition-all", step.status === "done" ? "bg-emerald-400" : step.status === "failed" ? "bg-red-400" : step.status === "running" ? "bg-amber-400" : "bg-slate-600")} style={{ width: `${step.progress}%` }} /></div></div>) : <p className="text-sm text-slate-500">Chưa có trạng thái pipeline.</p>}</div>
              {snapshot.pipeline?.error && <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-200"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{snapshot.pipeline.error}</div>}
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-semibold text-amber-100"><Clock className="h-4 w-4" /> Việc cần làm</h2><p className="mt-1 text-xs text-amber-200/60">Các mục này được tính từ script, scenes, characters và trạng thái pipeline thực tế.</p></div><div className="flex gap-2">{stats.failedScenes > 0 && <Button size="sm" variant="ghost" onClick={() => void retryFailed()} disabled={action !== null} className="gap-1.5 border border-red-400/25 bg-red-500/10 text-red-200"><RotateCcw className="h-3.5 w-3.5" />{action === "retry" ? "Đang thử…" : "Thử lại lỗi"}</Button>}<Button size="sm" variant="ghost" onClick={() => void copyJobLog()} className="gap-1.5 border border-white/10 bg-white/[0.04] text-slate-300"><ScrollText className="h-3.5 w-3.5" />Nhật ký</Button></div></div>
            <div className="mt-4 grid gap-2 md:grid-cols-3"><TaskItem text={!stats.scriptReady ? "Duyệt kịch bản để bắt đầu pipeline" : "Kịch bản đã duyệt"} done={stats.scriptReady} onClick={() => openStage("script")} /><TaskItem text={stats.total === 0 ? "Chưa có phân cảnh" : `${stats.total - stats.visuals} cảnh chưa có visual`} done={stats.total > 0 && stats.visuals === stats.total} onClick={() => openStage("storyboard")} /><TaskItem text={stats.total === 0 ? "Chưa có voiceover" : `${stats.total - stats.voices} voice chưa tạo`} done={stats.total > 0 && stats.voices === stats.total} onClick={() => openStage("script")} /></div>
          </section>
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value, hint, icon, tone = "normal", onClick }: { label: string; value: string; hint: string; icon: React.ReactNode; tone?: "normal" | "danger"; onClick?: () => void }) {
  return <button type="button" onClick={onClick} disabled={!onClick} className={cn("rounded-xl border p-4 text-left transition-colors", onClick ? "cursor-pointer hover:border-cyan-400/30 hover:bg-cyan-500/[0.04]" : "cursor-default", tone === "danger" ? "border-red-400/25 bg-red-500/[0.06]" : "border-white/10 bg-[#101A20]")}><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><span className={tone === "danger" ? "text-red-300" : "text-cyan-300"}>{icon}</span></div><div className="mt-2 text-xl font-bold text-slate-100">{value}</div><div className="mt-1 text-[11px] text-slate-500">{hint}</div></button>
}

function TaskItem({ text, done, onClick }: { text: string; done: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#101A20]/70 px-3 py-2.5 text-left text-xs text-slate-300 hover:border-amber-300/30"><span className={cn("flex h-5 w-5 items-center justify-center rounded-full", done ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>{done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}</span><span className="flex-1">{text}</span></button>
}

function statusDot(status: string) {
  return status === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : status === "running" ? <Clock className="h-4 w-4 animate-pulse text-amber-400" /> : status === "failed" ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <span className="inline-block h-3.5 w-3.5 rounded-full border border-slate-600/40" />
}

function FlowLoginButton() {
  const [flowState, setFlowState] = useState<{ factory_state?: string; status?: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    const poll = () => fetch("/api/flow-connection").then((response) => response.ok ? response.json() : {}).then((value) => { if (!cancelled) setFlowState(value as { factory_state?: string; status?: string }) }).catch(() => undefined)
    poll()
    const timer = window.setInterval(poll, 5000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])
  const state = flowState?.factory_state || "waiting_login"
  const label = ({ waiting_login: "Waiting Login", ready: "Ready", processing: "Processing", generate_image: "Generate Image", generate_video: "Generate Video", completed: "Completed", failed: "Failed" } as Record<string, string>)[state] || state
  return <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm" title="Trạng thái Flow của project đang chọn"><span className="text-xs text-slate-400">Flow</span><span className={cn("h-2 w-2 rounded-full", state === "failed" ? "bg-red-400" : state === "waiting_login" ? "bg-amber-400" : state === "completed" ? "bg-emerald-400" : "bg-blue-400")} /><span className="text-[11px] text-slate-400">{label}</span></div>
}

function StatusPill({ status }: { status: string }) {
  const cls = status === "completed" ? "bg-emerald-500/15 text-emerald-400" : status === "failed" ? "bg-red-500/15 text-red-400" : status === "running" || status.startsWith("generating") || status.startsWith("render") || status === "producing" ? "bg-amber-500/15 text-amber-400" : "bg-white/[0.04] text-slate-400"
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{STATUS_LABELS[status] || status || "Bản nháp"}</span>
}
