import { Table } from "@/components/design-system"
import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft, Wand2, Check, Play, Square, Pause, Clock, RotateCcw, Upload, Trash2,
  GripVertical, SplitSquareHorizontal, Combine, RefreshCw, Mic, ImageIcon,
  FileVideo, Clapperboard, AlertCircle, ListChecks, Sparkles, FolderOpen, Settings, Zap,
  ShieldCheck, ClipboardPaste, Download,
} from "lucide-react"
import { api, openExternalUrl, outputVideoUrl } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import { useEditorStore } from "@/stores/editor-store"
import { useAppStore } from "@/stores/app-store"
import type {
  Project, ScriptData, ScriptPayload, Scene, SeoSchema, SubtitleConfig, TTSConfig,
  Character,
} from "@/types"
import type { MediaAssetRead } from "@/services/pages-api"
import { mediaAssetsApi } from "@/services/pages-api"
import { ASPECT_RATIOS, LANGUAGES, SCENE_EFFECTS, STATUS_LABELS, VIDEO_TYPES } from "@/types"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/design-system"
import { cn } from "@/utils/cn"
import { ChannelConfigDialog } from "@/components/channel-config-dialog"
import { ProjectHeader, StageNavigation, StatusBadge } from "@/components/design-system"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function useJobPolling(projectId: number | null, active: boolean) {
  const { job, setJob } = useEditorStore()
  useEffect(() => {
    if (!projectId || !active) return
    const poll = () => {
      api.listJobs().then((jobs) => {
        const mine = jobs.find((j) => j.project_id === projectId)
        setJob(mine ?? null)
      }).catch(() => undefined)
    }
    poll()
    const interval = setInterval(poll, 1500)
    return () => clearInterval(interval)
  }, [projectId, active, setJob])
  return job
}

function estimateDuration(text: string): string {
  const words = (text || "").trim().split(/\s+/).length
  if (words === 0) return "0s"
  const seconds = Math.ceil((words / 2.5) + words * 0.12)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

const SUBTITLE_PRESETS: Array<{ name: string; cfg: Partial<SubtitleConfig> }> = [
  { name: "Mặc định", cfg: { font_size: 48, position: "bottom", primary_color: "#FFFFFF" } },
  { name: "Caption Shorts", cfg: { font_size: 64, position: "bottom", primary_color: "#FFD700" } },
  { name: "Thanh lịch", cfg: { font_size: 42, position: "bottom", primary_color: "#E8E8E8", border_width: 0 } },
]

// ---------------------------------------------------------------------------
// New Project Form
// ---------------------------------------------------------------------------
function NewProjectForm({ onCreated }: { onCreated: (id: number) => void }) {
  const [name, setName] = useState("")
  const [topic, setTopic] = useState("")
  const [videoType, setVideoType] = useState("long")
  const [aspect, setAspect] = useState("16:9")
  const [language, setLanguage] = useState("vi")
  const [duration, setDuration] = useState(120)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast({ title: "Thiếu tên dự án", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const p = await api.createProject({
        name: name.trim(),
        topic: topic.trim() || undefined,
        video_type: videoType,
        aspect_ratio: aspect,
        language,
        target_duration: duration,
      })
      toast({ title: "Đã tạo dự án", description: p.name })
      onCreated(p.id)
    } catch (err) {
      toast({ title: "Tạo dự án thất bại", description: String(err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-10 max-w-2xl space-y-5 rounded-lg border bg-[#141d22] p-8">
      <div className="text-center">
        <Clapperboard className="mx-auto h-10 w-10 text-amber-400" />
        <h2 className="mt-2 text-xl font-bold">Dự án mới</h2>
        <p className="mt-1 text-sm text-slate-500">Định nghĩa video bạn muốn tạo</p>
      </div>
      <div className="space-y-1.5">
        <Label>Tên dự án *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Series AI cho người mới" />
      </div>
      <div className="space-y-1.5">
        <Label>Chủ đề video</Label>
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Trí tuệ nhân tạo là gì?" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Loại video</Label>
          <Select value={videoType} onValueChange={setVideoType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VIDEO_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tỷ lệ khung hình</Label>
          <Select value={aspect} onValueChange={setAspect}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASPECT_RATIOS.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ngôn ngữ</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Độ dài mục tiêu (giây)</Label>
          <Input type="number" min={15} max={1800} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Đang tạo..." : "Tạo dự án"}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Step 1: Idea & Script (AI generation + paste)
// ---------------------------------------------------------------------------
function ScriptCreator({ project, onDone }: { project: Project; onDone: () => void }) {
  const [mode, setMode] = useState<"ai" | "paste">("ai")
  const [loading, setLoading] = useState(false)
  const [aiResult, setAiResult] = useState<ScriptPayload | null>(null)

  const [topic, setTopic] = useState(project.topic || "")
  const [videoType, setVideoType] = useState(project.video_type || "long")
  const [aspect, setAspect] = useState(project.aspect_ratio || "16:9")
  const [language, setLanguage] = useState(project.language || "vi")
  const [targetDuration, setTargetDuration] = useState(project.target_duration || 120)
  const [hook, setHook] = useState("")
  const [angle, setAngle] = useState("")
  const [outline, setOutline] = useState("")
  const [style, setStyle] = useState("")
  const [audience, setAudience] = useState("")
  const [thumbConcept, setThumbConcept] = useState("")
  const [thumbPrompt, setThumbPrompt] = useState("")

  const [pasteText, setPasteText] = useState("")
  const [pasteTitle, setPasteTitle] = useState("")

  const generate = async () => {
    if (!topic.trim() && !aiResult) {
      toast({ title: "Hãy nhập chủ đề video", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const result = await api.aiGenerateScript({
        topic: topic.trim(),
        video_type: videoType,
        aspect_ratio: aspect,
        language,
        target_duration: targetDuration,
        hook: hook.trim() || undefined,
        angle: angle.trim() || undefined,
        outline: outline.trim() ? outline.split("\n").filter(Boolean) : undefined,
        writing_style: style.trim() || undefined,
        audience: audience.trim() || undefined,
        thumbnail_concept: thumbConcept.trim() || undefined,
        thumbnail_prompt_en: thumbPrompt.trim() || undefined,
      })
      setAiResult(result)
      toast({ title: "AI đã viết kịch bản thành công" })
    } catch (e) {
      toast({
        title: "AI trả về lỗi",
        description: String(e),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const submitScript = async (payload: ScriptPayload) => {
    try {
      await api.saveScript(project.id, payload)
      toast({ title: "Đã lưu kịch bản", description: "Chuyển sang bước chỉnh sửa kịch bản" })
      onDone()
    } catch (e) {
      toast({ title: "Lưu kịch bản thất bại", description: String(e), variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6">
      <div className="vas-card p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-100">Chế độ tạo kịch bản</h3>
        <div className="flex gap-2">
          <Button variant={mode === "ai" ? "default" : "outline"} onClick={() => setMode("ai")}>
            <Wand2 className="h-4 w-4" />
            AI tự viết kịch bản
          </Button>
          <Button variant={mode === "paste" ? "default" : "outline"} onClick={() => setMode("paste")}>
            <Clapperboard className="h-4 w-4" />
            Tự dán kịch bản
          </Button>
        </div>
      </div>

      {mode === "ai" ? (
        <div className="vas-card p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-100">Định hướng cho AI</h3>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Chủ đề video *</Label>
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Đối tượng xem</Label>
                <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="VD: người mới bắt đầu" />
              </div>
              <div className="space-y-1.5">
                <Label>Hook mở đầu</Label>
                <Input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="VD: Bạn có biết 90% người..." />
              </div>
              <div className="space-y-1.5">
                <Label>Góc tiếp cận</Label>
                <Input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="VD: kể chuyện, phân tích" />
              </div>
              <div className="space-y-1.5">
                <Label>Phong cách viết</Label>
                <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="VD: hài hước, trang trọng" />
              </div>
              <div className="space-y-1.5">
                <Label>Độ dài mục tiêu (giây)</Label>
                <Input type="number" value={targetDuration} onChange={(e) => setTargetDuration(Number(e.target.value))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Dàn ý (mỗi dòng một mục)</Label>
                <Textarea value={outline} onChange={(e) => setOutline(e.target.value)} placeholder="Mở đầu&#10;Phần chính 1&#10;Phần chính 2&#10;Kết luận" rows={4} />
              </div>
              <div className="space-y-1.5">
                <Label>Concept thumbnail</Label>
                <Input value={thumbConcept} onChange={(e) => setThumbConcept(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prompt thumbnail (tiếng Anh)</Label>
                <Input value={thumbPrompt} onChange={(e) => setThumbPrompt(e.target.value)} />
              </div>
            </div>
            <Button onClick={generate} disabled={loading} className="w-full bg-gradient-to-r from-amber-500 to-amber-300 hover:from-amber-400 hover:to-amber-200">
              {loading ? "AI đang viết..." : <><Sparkles className="h-4 w-4" /> Tạo kịch bản bằng AI</>}
            </Button>
          </div>
        </div>
      ) : (
        <div className="vas-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
              <Clapperboard className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-100">Duyệt ý tưởng</h3>
              <p className="text-xs text-slate-500">Lần đầu thuê trọ: 10 thử phải kiểm tra trước khi đưa tiề...</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-200">Nhập kịch bản (text thuần):</Label>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={14}
                className="border-amber-500/20"
                placeholder={"Dán kịch bản vào đây...\n\nMỗi câu nên nằm trên 1 dòng.\nHệ thống sẽ tự tách câu nếu bạn dán cả đoạn văn."}
              />
            </div>
            <p className="text-xs text-slate-500">
              ℹ Không cần nhập thời gian. AI sẽ đọc giọng rồi tự trích xuất timing chuẩn cho từng câu.
            </p>
            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
              <Button variant="outline" onClick={() => setMode("ai")}>Huỷ</Button>
              <Button
                onClick={() =>
                  submitScript({
                    title: pasteTitle.trim() || project.name,
                    hook: "",
                    angle: "",
                    outline: [],
                    full_script: pasteText.trim(),
                    thumbnail_concept: "",
                    thumbnail_prompt: "",
                    seo: { youtube_title: pasteTitle.trim() || project.name, description: "", hashtags: [], tags: [] },
                  })
                }
                className="bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-[#372a01] font-semibold hover:brightness-110"
              >
                <ShieldCheck className="h-4 w-4" /> Tự động lên kịch bản
              </Button>
              <Button
                onClick={() =>
                  submitScript({
                    title: pasteTitle.trim() || project.name,
                    hook: "",
                    angle: "",
                    outline: [],
                    full_script: pasteText.trim(),
                    thumbnail_concept: "",
                    thumbnail_prompt: "",
                    seo: { youtube_title: pasteTitle.trim() || project.name, description: "", hashtags: [], tags: [] },
                  })
                }
                className="bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-[#372a01] font-semibold hover:brightness-110"
              >
                <ClipboardPaste className="h-4 w-4" /> Import kịch bản
              </Button>
            </div>
          </div>
        </div>
      )}

      {aiResult && (
        <div className="vas-card p-5 border-amber-500/30">
          <h3 className="mb-4 text-base font-semibold text-slate-100">Kết quả từ AI</h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">Tiêu đề</div>
              <div className="text-sm">{aiResult.title}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">Hook</div>
              <div className="text-sm">{aiResult.hook}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">Dàn ý</div>
              <ul className="list-inside list-disc text-sm">
                {aiResult.outline.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">Kịch bản đầy đủ</div>
              <div className="max-h-60 overflow-y-auto rounded-lg border p-3 text-sm whitespace-pre-wrap">
                {aiResult.full_script}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">SEO YouTube</div>
              <div className="rounded-lg border p-3 text-xs text-slate-500">
                <div>{aiResult.seo.youtube_title}</div>
                <div className="mt-1">{(aiResult.seo.hashtags || []).join(" ")}</div>
              </div>
            </div>
            <Button onClick={() => submitScript(aiResult)}>
              <Check className="h-4 w-4" />
              Lưu và dùng kịch bản này
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Script editor (full-text edit, split, reorder)
// ---------------------------------------------------------------------------
function ScriptEditor({ project, onBuildScenes }: { project: Project; onBuildScenes: () => void }) {
  const { script, setScript, dirtyScript, setDirtyScript } = useEditorStore()
  const [text, setText] = useState("")

  useEffect(() => {
    if (script) return
    api
      .getScript(project.id)
      .then((s) => {
        if (s?.full_script !== undefined) setScript(s)
      })
      .catch(() => undefined)
  }, [project.id, script, setScript])
  const [saving, setSaving] = useState(false)
  const [autoSaveTimer, setAutoSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [seoGenerating, setSeoGenerating] = useState(false)

  useEffect(() => {
    if (script?.full_script !== undefined) {
      setText(script.full_script || "")
    }
  }, [script])

  const startAutoSave = (value: string) => {
    setText(value)
    setDirtyScript(true)
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    setAutoSaveTimer(
      setTimeout(() => {
        void (async () => {
          if (!script) return
          setSaving(true)
          try {
            await api.saveScript(project.id, { ...script, full_script: value })
            setScript({ ...script, full_script: value })
            setDirtyScript(false)
          } catch (e) {
            toast({ title: "Lưu tự động thất bại", description: String(e) })
          } finally {
            setSaving(false)
          }
        })()
      }, 1500),
    )
  }

  const splitScript = async () => {
    try {
      await api.splitScript(project.id, text)
      toast({ title: "Kịch bản đã được tách câu", description: "Duyệt kịch bản để tiếp tục chia cảnh" })
    } catch (e) {
      toast({ title: "Tách câu thất bại", description: String(e), variant: "destructive" })
    }
  }

  const approve = async () => {
    try {
      const res = await api.approveScript(project.id)
      if (res.approved) toast({ title: "Đã duyệt kịch bản", description: "Bạn có thể chia cảnh ngay" })
    } catch (e) {
      toast({ title: "Duyệt thất bại", description: String(e), variant: "destructive" })
    }
  }

  const generateSeoAi = async () => {
    setSeoGenerating(true)
    try {
      const res = await api.generateSeo(project.id)
      // Cập nhật bản sao trong store để tab SEO hiển thị ngay
      const fresh = await api.getScript(project.id)
      if (fresh) setScript(fresh)
      toast({
        title: "SEO đã được sinh bằng AI",
        description: "Xem kết quả bên dưới — bạn có thể chỉnh sửa trực tiếp trong kịch bản nếu cần",
      })
    } catch (e) {
      toast({ title: "Sinh SEO thất bại", description: String(e), variant: "destructive" })
    } finally {
      setSeoGenerating(false)
    }
  }

  if (!script) {
    return (
      <div className="vas-card p-5">
        <div className="flex flex-col items-center gap-3 py-14">
          <ListChecks className="h-10 w-10 text-slate-500/40" />
          <div className="text-sm text-slate-500">Chưa có kịch bản. Hãy tạo kịch bản ở tab "Ý tưởng".</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="vas-card p-5">
        <div className="mb-4 text-base font-semibold text-slate-100">
          <div className="flex items-center justify-between">
            <span className="block mb-0">
              Trình soạn thảo kịch bản
              {dirtyScript && <Badge variant="warning" className="ml-2">Có thay đổi chưa lưu</Badge>}
              {saving && <Badge variant="secondary" className="ml-2">Đang lưu...</Badge>}
            </span>
            <div className="text-xs text-slate-500">
              Ước tính thời lượng: {estimateDuration(text)}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <Textarea value={text} onChange={(e) => startAutoSave(e.target.value)} rows={20} className="font-mono text-sm leading-relaxed" />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={splitScript} variant="outline">
              <SplitSquareHorizontal className="h-4 w-4" />
              Tách thành câu
            </Button>
            <Button onClick={approve} variant="outline">
              <Check className="h-4 w-4" />
              Duyệt kịch bản
            </Button>
            <Button onClick={onBuildScenes} className="bg-gradient-to-r from-amber-500 to-amber-300 hover:from-amber-400 hover:to-amber-200">
              <Clapperboard className="h-4 w-4" />
              Chia thành phân cảnh
            </Button>
          </div>
        </div>
      </div>

      {script.seo && (
        <div className="vas-card p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-100">SEO YouTube</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="text-xs text-slate-500">Tiêu đề YouTube</div>
              <div>{script.seo.youtube_title}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-500">Hashtags</div>
              <div>{(script.seo.hashtags || []).join(" ")}</div>
            </div>
            <div className="col-span-2 space-y-1">
              <div className="text-xs text-slate-500">Mô tả</div>
              <div className="text-slate-500/80">{script.seo.description}</div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" onClick={generateSeoAi} disabled={seoGenerating}>
              <Sparkles className="h-3.5 w-3.5" />
              {seoGenerating ? "Đang sinh…" : "Sinh lại bằng AI"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Storyboard (scene cards)
// ---------------------------------------------------------------------------
function Storyboard({ project }: { project: Project }) {
  const { scenes, setScenes, subtitleConfig } = useEditorStore()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzingScene, setAnalyzingScene] = useState<number | null>(null)
  const [splittingScene, setSplittingScene] = useState<number | null>(null)
  const [regeneratingMedia, setRegeneratingMedia] = useState<number | null>(null)

  // Flow Connector task queue state
  const [taskState, setTaskState] = useState<{
    state: string
    paused: boolean
    counts: Record<string, number>
    total: number
    completed: number
  } | null>(null)
  const [workerOnline, setWorkerOnline] = useState(false)

  const load = () => {
    api.listScenes(project.id).then(setScenes).catch(() => undefined)
  }
  useEffect(load, [project.id, setScenes])

  // Poll Flow Connector task queue + worker status
  useEffect(() => {
    const poll = () => {
      api.mediaTasksState(project.id).then(setTaskState).catch(() => undefined)
      api.connectorWorkerStatus().then((w) => setWorkerOnline(Boolean(w.registered))).catch(() => undefined)
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [project.id])

  const updateScene = async (scene: Scene, patch: Partial<Scene>) => {
    try {
      await api.updateScene(project.id, scene.id, patch)
      load()
    } catch (e) {
      toast({ title: "Cập nhật cảnh thất bại", description: String(e), variant: "destructive" })
    }
  }

  const handleFilePick = async (scene: Scene, file: File) => {
    // Copy media into project directory via upload endpoint
    const form = new FormData()
    form.append("file", file)
    try {
      const res = await fetch(`/api/upload/media?project_id=${project.id}`, { method: "POST", body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { media_path: string; media_type: string }
      await api.setSceneMedia(project.id, scene.id, data.media_path, data.media_type)
      toast({ title: "Đã gán media cho cảnh" })
      load()
    } catch (e) {
      toast({ title: "Gán media thất bại", description: String(e), variant: "destructive" })
    }
  }

  const toggleSelect = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const move = async (from: number, to: number) => {
    if (to < 0 || to >= scenes.length || from === to) return
    const arr = [...scenes]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    try {
      await api.reorderScenes(
        project.id,
        arr.map((s) => s.id),
      )
      setScenes(arr)
    } catch (e) {
      toast({ title: "Đổi thứ tự thất bại", description: String(e), variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-500">{scenes.length} cảnh · kéo thẻ để đổi thứ tự</div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={analyzing}
            className="gap-1.5 bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white shadow-lg shadow-amber-500/20 hover:brightness-110"
            onClick={async () => {
              setAnalyzing(true)
              try {
                const data = await api.semanticAnalyze(project.id, {
                  existing_narrations: scenes.map((s) => s.narration),
                })
                await api.buildScenes(project.id, { semantic_analysis: data.scenes })
                toast({ title: "Đã phân cảnh AI theo ngữ nghĩa", description: `${data.scenes.length} cảnh mới — mỗi cảnh có prompt hình riêng theo nội dung toàn cảnh. Hãy kiểm tra và render.` })
                load()
              } catch (e) {
                toast({ title: "Phân cảnh AI thất bại", description: String(e), variant: "destructive" })
              } finally {
                setAnalyzing(false)
              }
            }}
          >
            <Sparkles className={cn("h-3.5 w-3.5", analyzing && "animate-pulse")} />
            {analyzing ? "Đang phân tích…" : "Phân cảnh AI thông minh"}
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/20 hover:brightness-110"
            onClick={async () => {
              try {
                const res = await api.createMediaTasks(project.id, {})
                toast({
                  title: "Đã tạo task tạo media cho " + res.created + " cảnh",
                  description: "Extension Flow Connector sẽ tự mở Google Flow, tạo media và tải file thật về từng cảnh. Mở tab Flow để theo dõi tiến trình — cảnh đã có media không bị chạy lại.",
                })
                load()
              } catch (e) {
                toast({ title: "Tạo task Flow Connector thất bại", description: String(e), variant: "destructive" })
              }
            }}
          >
            <Zap className="h-3.5 w-3.5" />
            Sinh media tự động (Flow Connector)
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
            onClick={async () => {
              try {
                const res = await fetch(`/api/flow/project-url?project_id=${project.id}`)
                const data = (await res.json()) as { url: string }
                const url = data.url || `https://labs.google/fx/vi/tools/flow/project/${project.id}`
                openExternalUrl(url)
                toast({ title: "Đã mở Google Flow (Labs) trong trình duyệt", description: "Tạo ảnh/clip ở đó, rồi chọn media cho từng cảnh ở dưới." })
              } catch (e) {
                toast({ title: "Mở Google Flow thất bại", description: String(e), variant: "destructive" })
              }
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Mở Google Flow (Labs) để tạo media
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="outline" onClick={setSelected.bind(null, new Set())}>
              Bỏ chọn ({selected.size})
            </Button>
          )}
        </div>
      </div>

      {/* Flow Connector task queue status panel */}
      {taskState && taskState.total > 0 && (
        <div className="vas-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={cn(
              "gap-1.5",
              taskState.state === "finished" && "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15",
              taskState.state === "paused" && "bg-amber-500/15 text-amber-300 hover:bg-amber-500/15",
              taskState.state === "running" && "bg-amber-500/15 text-amber-300 hover:bg-amber-500/15",
            )}>
              {taskState.state === "running" ? <Clock className="h-3 w-3 animate-pulse" /> : taskState.state === "paused" ? <Pause className="h-3 w-3" /> : taskState.state === "finished" ? <Check className="h-3 w-3" /> : <ListChecks className="h-3 w-3" />}
              <span>{taskState.state === "running" ? "Đang chạy" : taskState.state === "paused" ? "Tạm dừng" : taskState.state === "finished" ? "Hoàn tất" : taskState.state}</span>
            </Badge>
            <span className="text-sm text-slate-400">{taskState.completed}/{taskState.total} cảnh đã có media</span>
            {(taskState.counts.failed ?? 0) > 0 && (
              <Badge variant="destructive">{(taskState.counts.failed ?? 0)} cảnh lỗi (tự thử lại)</Badge>
            )}
            <Badge variant={workerOnline ? "success" : "secondary"}>
              <Zap className="mr-1 h-3 w-3" /> Extension {workerOnline ? "đang kết nối" : "chưa kết nối"}
            </Badge>
            <div className="ml-auto flex items-center gap-2">
              {taskState.state === "running" && (
                <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10" onClick={async () => {
                  try {
                    await api.mediaTasksPause(project.id)
                    toast({ title: "Đã tạm dừng hàng đợi tạo media", description: "Extension sẽ dừng nhận task mới. Task đang chạy sẽ hoàn thành." })
                  } catch (e) {
                    toast({ title: "Tạm dừng thất bại", description: String(e), variant: "destructive" })
                  }
                }}>
                  <Pause className="mr-1 h-3.5 w-3.5" /> Tạm dừng
                </Button>
              )}
              {taskState.state === "paused" && (
                <Button size="sm" className="gap-1.5 bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white" onClick={async () => {
                  try {
                    await api.mediaTasksResume(project.id)
                    toast({ title: "Đã tiếp tục hàng đợi tạo media", description: "Extension sẽ nhận lại các cảnh chưa có media." })
                  } catch (e) {
                    toast({ title: "Tiếp tục thất bại", description: String(e), variant: "destructive" })
                  }
                }}>
                  <Play className="h-3.5 w-3.5" /> Tiếp tục
                </Button>
              )}
              {(taskState.state === "running" || taskState.state === "paused") && (
                <Button size="sm" variant="outline" className="border-red-500/40 text-red-300 hover:bg-red-500/10" onClick={async () => {
                  if (!confirm("Hủy toàn bộ task media chưa hoàn thành? Cảnh đã có media không bị ảnh hưởng.")) return
                  try {
                    await api.mediaTasksCancel(project.id)
                    toast({ title: "Đã hủy task chưa hoàn thành", description: "Cảnh đã hoàn thành vẫn giữ media." })
                  } catch (e) {
                    toast({ title: "Hủy thất bại", description: String(e), variant: "destructive" })
                  }
                }}>
                  <Square className="mr-1 h-3.5 w-3.5" /> Hủy task chưa xong
                </Button>
              )}
            </div>
          </div>
          <div className="mt-3">
            <Progress value={taskState.total > 0 ? Math.round((taskState.completed / taskState.total) * 100) : 0} className="h-1.5" />
          </div>
          {!workerOnline && (
            <p className="mt-3 text-xs text-amber-300/80">
              Extension Flow Connector chưa kết nối. Hãy cài extension vào Chrome, mở tab Google Flow một lần và đảm bảo extension đang bật — các task sẽ tự chạy khi extension kết nối.
            </p>
          )}
        </div>
      )}

      {scenes.length === 0 ? (
        <div className="vas-card p-5">
          <div className="flex flex-col items-center gap-3 py-14">
            <ListChecks className="h-10 w-10 text-slate-500/40" />
            <div className="text-sm text-slate-500">Chưa có cảnh nào. Hãy duyệt và chia cảnh ở tab trước.</div>
          </div>
        </div>
      ) : (
        scenes.map((scene, index) => (
          <div
            key={scene.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, index)
              setDragIndex(null)
            }}
            className={cn("vas-card p-5 transition-colors", selected.has(scene.id) && "border-amber-500/40")}
          >
            <div className="space-y-4 py-4">
              <div className="flex items-start gap-3">
                <Button variant="ghost"
                  onClick={() => toggleSelect(scene.id)}
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold",
                    selected.has(scene.id) ? "border-primary bg-primary/10 text-amber-400" : "border-input text-slate-500",
                  )}
                >
                  {index + 1}
                </Button>
                <GripVertical className="mt-1 h-4 w-4 shrink-0 text-slate-500/40" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Lời thuyết minh</Label>
                    <Textarea
                      value={scene.narration}
                      onChange={(e) => updateScene(scene, { narration: e.target.value })}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Prompt hình ảnh (AI viết theo nội dung TOÀN cảnh)</Label>
                    <div className="flex gap-2">
                      <Input
                        value={scene.visual_prompt}
                        onChange={(e) => updateScene(scene, { visual_prompt: e.target.value })}
                        className="text-sm"
                      />
                      <Button size="icon" variant="ghost" title="AI viết lại prompt theo toàn cảnh" disabled={analyzingScene === scene.id} onClick={async () => {
                        try {
                          setAnalyzingScene(scene.id)
                          const res = await api.regenerateScenePrompt(project.id, scene.id)
                          await updateScene(scene, { visual_prompt: res.visual_prompt })
                          toast({ title: "Đã AI viết lại prompt", description: "Ảnh cũ sẽ được sinh lại khi render theo prompt mới." })
                        } catch (e) {
                          toast({ title: "AI viết lại prompt thất bại", description: String(e), variant: "destructive" })
                        } finally {
                          setAnalyzingScene(null)
                        }
                      }}>
                        <Sparkles className={cn("h-4 w-4", analyzingScene === scene.id && "animate-pulse text-amber-400")} />
                      </Button>
                    </div>
                    {scene.style_prompt ? (
                      <p className="truncate rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300" title={scene.style_prompt}>
                        🎨 {scene.style_prompt}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs hover:bg-white/[0.04]">
                      <Upload className="h-3.5 w-3.5" />
                      {scene.media_path ? "Thay media" : "Chọn ảnh/video"}
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleFilePick(scene, f)
                          e.target.value = ""
                        }}
                      />
                    </label>
                    {scene.media_path && (
                      <Badge variant="success"><FileVideo className="mr-1 h-3 w-3" /> Đã có media</Badge>
                    )}
                    {scene.audio_path && (
                      <Badge variant="secondary"><Mic className="mr-1 h-3 w-3" /> Đã có giọng</Badge>
                    )}
                    {scene.duration > 0 && (
                      <span className="text-xs text-slate-500">{scene.duration.toFixed(1)}s</span>
                    )}
                    <Select value={scene.effect} onValueChange={(v) => updateScene(scene, { effect: v })}>
                      <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCENE_EFFECTS.map((ef) => (
                          <SelectItem key={ef.value} value={ef.value}>{ef.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {scene.status === "error" && scene.error_message && (
                      <Badge variant="destructive">Lỗi: {scene.error_message.slice(0, 60)}</Badge>
                    )}
                  </div>
                  {scene.media_path && (
                    <div className="overflow-hidden rounded-lg border bg-white/[0.03]/50">
                      {scene.media_type === "image" ? (
                        <img
                          src={`/api/media/file?path=${encodeURIComponent(scene.media_path)}`}
                          alt="scene media"
                          className="max-h-48 w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <video
                          src={`/api/media/file?path=${encodeURIComponent(scene.media_path)}`}
                          controls
                          className="max-h-48 w-full"
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button size="icon" variant="ghost" title="Chia cảnh (AI theo ngữ nghĩa)" disabled={splittingScene === scene.id} onClick={async () => {
                    try {
                      setSplittingScene(scene.id)
                      await api.semanticSplitScene(project.id, scene.id)
                      toast({ title: "Đã AI chia cảnh", description: "Cảnh được chia theo diễn biến nội dung — mỗi nửa có prompt hình riêng." })
                      load()
                    } catch (e) {
                      toast({ title: "Chia cảnh thất bại", description: String(e), variant: "destructive" })
                    } finally {
                      setSplittingScene(null)
                    }
                  }}>
                    <SplitSquareHorizontal className={cn("h-4 w-4", splittingScene === scene.id && "animate-pulse text-amber-400")} />
                  </Button>
                  {index > 0 && (
                    <Button size="icon" variant="ghost" title="Gộp với cảnh trên" onClick={async () => {
                      try {
                        await api.mergeScenes(project.id, scenes[index - 1].id, scene.id)
                        toast({ title: "Đã gộp cảnh" })
                        load()
                      } catch (e) {
                        toast({ title: "Gộp cảnh thất bại", description: String(e), variant: "destructive" })
                      }
                    }}>
                      <Combine className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" title="Sinh lại ảnh AI (UTO Flow)" disabled={regeneratingMedia === scene.id} onClick={async () => {
                    try {
                      setRegeneratingMedia(scene.id)
                      const s = await api.regenerateMedia(project.id, scene.id)
                      toast({ title: "Đã sinh lại ảnh AI", description: `Cảnh ${scene.order_index}: ảnh mới từ UTO Flow${s.media_path ? "" : ""}` })
                      load()
                    } catch (e) {
                      toast({ title: "Sinh ảnh AI thất bại", description: String(e), variant: "destructive" })
                    } finally {
                      setRegeneratingMedia(null)
                    }
                  }}>
                    <ImageIcon className={cn("h-4 w-4", regeneratingMedia === scene.id && "animate-pulse text-amber-400")} />
                  </Button>
                  <Button size="icon" variant="ghost" title="Tạo lại giọng đọc" onClick={async () => {
                    try {
                      await api.regenerateVoice(project.id, scene.id, {})
                      toast({ title: "Đã tạo lại giọng" })
                      load()
                    } catch (e) {
                      toast({ title: "Tạo lại giọng thất bại", description: String(e), variant: "destructive" })
                    }
                  }}>
                    <Mic className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Xóa cảnh" onClick={async () => {
                    if (!confirm("Xóa cảnh này?")) return
                    try {
                      await api.deleteScene(project.id, scene.id)
                      load()
                    } catch (e) {
                      toast({ title: "Xóa cảnh thất bại", description: String(e), variant: "destructive" })
                    }
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Subtitles
// ---------------------------------------------------------------------------
function SubtitleConfigPanel({ project }: { project: Project }) {
  const { subtitleConfig, setSubtitleConfig } = useEditorStore()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const exportSrt = async () => {
    try {
      // Tải file SRT từ backend — trigger download thật
      const link = document.createElement("a")
      link.href = api.exportSubtitles(project.id)
      link.download = `phu-de-du-an-${project.id}.srt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast({ title: "Đã xuất file SRT", description: "Mở file bằng trình soạn thảo hoặc import vào Premiere/CapCut" })
    } catch (e) {
      toast({ title: "Xuất SRT thất bại", description: String(e), variant: "destructive" })
    }
  }

  const preview = async () => {
    try {
      const scenes = await api.listScenes(project.id)
      const firstWithAudio = scenes.find((s) => s.audio_path)
      const text = (scenes.find((s) => s.narration) || { narration: "" }).narration
      if (!firstWithAudio) {
        toast({ title: "Chưa có cảnh nào có audio để xem trước", variant: "destructive" })
        return
      }
      const width = project.aspect_ratio === "9:16" ? 1080 : 1920
      const height = project.aspect_ratio === "9:16" ? 1920 : 1080
      const res = await api.subtitlePreview(
        project.id,
        text || "Đây là dòng phụ đề mẫu cho Viu Auto Studio.",
        firstWithAudio.audio_path,
        subtitleConfig,
        width,
        height,
      )
      setPreviewUrl(res.ass_path)
      toast({ title: "Đã tạo xem trước phụ đề", description: `${res.entry_count} dòng` })
    } catch (e) {
      toast({ title: "Xem trước phụ đề thất bại", description: String(e), variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6">
      <div className="vas-card p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-100">Cấu hình phụ đề</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Font</Label>
            <Input value={subtitleConfig.font} onChange={(e) => setSubtitleConfig({ font: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Cỡ chữ: {subtitleConfig.font_size}px</Label>
            <Slider value={[subtitleConfig.font_size]} min={16} max={120} step={2}
              onValueChange={(v) => setSubtitleConfig({ font_size: v[0] })} />
          </div>
          <div className="space-y-1.5">
            <Label>Màu chữ</Label>
            <Input type="color" value={subtitleConfig.primary_color}
              onChange={(e) => setSubtitleConfig({ primary_color: e.target.value })} className="h-10 w-full p-1" />
          </div>
          <div className="space-y-1.5">
            <Label>Màu viền</Label>
            <Input type="color" value={subtitleConfig.border_color}
              onChange={(e) => setSubtitleConfig({ border_color: e.target.value })} className="h-10 w-full p-1" />
          </div>
          <div className="space-y-1.5">
            <Label>Độ dày viền: {subtitleConfig.border_width}px</Label>
            <Slider value={[subtitleConfig.border_width]} min={0} max={8} step={1}
              onValueChange={(v) => setSubtitleConfig({ border_width: v[0] })} />
          </div>
          <div className="space-y-1.5">
            <Label>Vị trí</Label>
            <Select value={subtitleConfig.position} onValueChange={(v) => setSubtitleConfig({ position: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom">Dưới</SelectItem>
                <SelectItem value="center">Giữa</SelectItem>
                <SelectItem value="top">Trên</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Granularity</Label>
            <Select value={subtitleConfig.granularity} onValueChange={(v) => setSubtitleConfig({ granularity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sentence">Theo câu</SelectItem>
                <SelectItem value="phrase">Theo cụm từ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ký tự tối đa/dòng: {subtitleConfig.max_chars_per_line}</Label>
            <Slider value={[subtitleConfig.max_chars_per_line]} min={20} max={100} step={5}
              onValueChange={(v) => setSubtitleConfig({ max_chars_per_line: v[0] })} />
          </div>
          <div className="col-span-2 flex flex-wrap gap-2">
            {SUBTITLE_PRESETS.map((p) => (
              <Button key={p.name} size="sm" variant="outline" onClick={() => setSubtitleConfig(p.cfg)}>
                {p.name}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={exportSrt}>
              <Download className="h-4 w-4" />
              Xuất SRT
            </Button>
            <Button size="sm" className="ml-auto" onClick={preview}>
              <Play className="h-4 w-4" />
              Xem trước
            </Button>
          </div>
        </div>
      </div>
      {previewUrl && (
        <div className="vas-card p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-100">Bản xem trước phụ đề (ASS)</h3>
          <div>
            <div className="rounded-lg border bg-white/[0.03]/50 p-3">
              <video
                src={outputVideoUrl(project.id, "preview")}
                controls
                className="w-full max-h-[60vh]"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Video preview 1280x720 — phụ đề sẽ được embed theo cấu hình trên khi render cuối.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 5: Preview & Render + Job Queue
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Stage 4 — Nhân vật (dự án)
// ---------------------------------------------------------------------------
function EditorCharacters({ project }: { project: Project }) {
  const [chars, setChars] = useState<Character[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")

  useEffect(() => { load() }, [])
  async function load() {
    try {
      const list = await api.listCharacters(project.id)
      setChars(list)
    } catch { /* ignore */ }
  }
  const add = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const c = await api.createCharacter({
        project_id: project.id,
        name: name.trim(),
        description: desc.trim(),
      })
      setChars((prev) => [c, ...prev])
      setName(""); setDesc("")
      toast({ title: "Đã thêm nhân vật", description: c.name })
    } catch (e) {
      toast({ title: "Thêm nhân vật thất bại", description: String(e), variant: "destructive" })
    } finally { setLoading(false) }
  }
  const remove = async (c: Character) => {
    if (!window.confirm(`Xóa nhân vật "${c.name}"?`)) return
    await api.deleteCharacter(c.id).catch(() => undefined)
    setChars((prev) => prev.filter((x) => x.id !== c.id))
  }
  return (
    <div className="space-y-4">
      <div className="vas-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Thêm nhân vật mới trong dự án</h3>
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên nhân vật" className="w-56" />
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Mô tả (vai trò, ngoại hình)" className="flex-1 min-w-52" />
          <Button onClick={add} disabled={loading || !name.trim()}>Thêm</Button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Nhân vật toàn cục được quản lý ở menu "Nhân vật". Nhân vật tại đây thuộc dự án, dùng làm prompt nhất quán nhân vật.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {chars.length === 0 && (
          <div className="vas-card flex flex-col items-center gap-2 p-6 text-sm text-slate-500">
            Chưa có nhân vật nào trong dự án.
          </div>
        )}
        {chars.map((c) => (
          <div key={c.id} className="vas-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{c.name}</div>
                <div className="mt-1 line-clamp-2 text-xs text-slate-500">{c.description || "—"}</div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-slate-500" onClick={() => remove(c)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-2 flex gap-1.5">
              {c.is_host && <Badge className="bg-primary/20 text-primary hover:bg-primary/20">Chủ nhà</Badge>}
              {c.is_fixed && <Badge variant="outline">Cố định</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stage 5 — Media (asset thật đã FFprobe xác minh)
// ---------------------------------------------------------------------------
function EditorMedia({ project }: { project: Project }) {
  const [assets, setAssets] = useState<MediaAssetRead[]>([])
  useEffect(() => { load() }, [])
  async function load() {
    try {
      const list = await mediaAssetsApi.list({ project_id: project.id })
      setAssets(list)
    } catch { /* ignore */ }
  }
  const reverify = async (a: MediaAssetRead) => {
    try {
      const { asset } = await mediaAssetsApi.reverify(a.id)
      toast({ title: "Đã xác minh lại", description: asset.verify_state })
      load()
    } catch (e) {
      toast({ title: "File không hợp lệ", description: String(e), variant: "destructive" })
    }
  }
  const remove = async (a: MediaAssetRead) => {
    if (!window.confirm("Xóa asset này khỏi danh sách (không xóa file)?")) return
    await mediaAssetsApi.delete(a.id).catch(() => undefined)
    load()
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Media của dự án được Flow Connector tải về và FFprobe xác minh (codec, độ phân giải, thời lượng). Không có ảnh giả.
        </p>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Làm mới</Button>
      </div>
      <div className="vas-card overflow-hidden">
        <Table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.03] text-left text-slate-400">
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Loại</th>
              <th className="px-3 py-2">Nguồn</th>
              <th className="px-3 py-2">Codec / Phân giải</th>
              <th className="px-3 py-2">Thời lượng</th>
              <th className="px-3 py-2">Xác minh</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Chưa có media. Chạy "Sinh media tự động (Flow Connector)" ở giai đoạn Phân cảnh.</td></tr>
            )}
            {assets.map((a) => (
              <tr key={a.id} className="border-b border-white/5 last:border-0">
                <td className="max-w-52 truncate px-3 py-2">{a.file_path.split("/").pop() ?? a.file_path}</td>
                <td className="px-3 py-2 text-slate-400">{a.kind || "—"}</td>
                <td className="px-3 py-2 text-slate-400">{a.provider || "—"}</td>
                <td className="px-3 py-2 text-slate-400">{a.codec || "—"}{a.resolution ? ` · ${a.resolution}` : ""}</td>
                <td className="px-3 py-2 text-slate-400">{a.duration ? `${a.duration.toFixed(1)}s` : "—"}</td>
                <td className="px-3 py-2">{STATE_BADGE(a.verify_state)}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => reverify(a)} title="Xác minh lại"><RefreshCw className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={() => remove(a)} title="Xóa"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  )
}

function STATE_BADGE(state: string) {
  const color =
    state === "verified" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : state === "failed" ? "bg-red-500/15 text-red-400 border-red-500/30"
    : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] ${color}`}>{state}</span>
}

// ---------------------------------------------------------------------------
// Xuất bản / Render
// ---------------------------------------------------------------------------
function RenderPanel({ project }: { project: Project }) {
  const { job } = useEditorStore()
  const [crf, setCrf] = useState(21)
  const [fps, setFps] = useState(30)
  const [preset, setPreset] = useState("medium")
  const [enableSubs, setEnableSubs] = useState(true)
  const [musicVol, setMusicVol] = useState(0.25)
  const [rendering, setRendering] = useState(false)

  const canRender = !job || job.status === "completed" || job.status === "failed" || job.status === "cancelled"
  const inProgress =
    job?.status === "generating_voice" || job?.status === "voice_ready" || job?.status === "preparing_media" ||
    job?.status === "media_ready" || job?.status === "generating_subtitles" || job?.status === "rendering"

  const start = async () => {
    setRendering(true)
    try {
      const res = await api.renderStart(project.id, {
        crf, fps, preset, enable_subtitles: enableSubs, music_volume: musicVol,
      })
      if (res.ok && res.job_id) {
        toast({ title: "Đã bắt đầu pipeline render", description: "Theo dõi tiến trình bên dưới" })
      } else {
        toast({ title: "Không thể bắt đầu", description: res.message, variant: "destructive" })
      }
    } catch (e) {
      toast({ title: "Bắt đầu render thất bại", description: String(e), variant: "destructive" })
    } finally {
      setRendering(false)
    }
  }

  const cancel = async () => {
    if (!job) return
    try {
      await api.cancelJob(job.id)
      toast({ title: "Đã hủy render" })
    } catch (e) {
      toast({ title: "Hủy render thất bại", description: String(e), variant: "destructive" })
    }
  }

  const retry = async () => {
    if (!job) return
    try {
      await api.retryJob(job.id, {})
      toast({ title: "Đang thử lại render, tiếp tục từ bước lỗi" })
    } catch (e) {
      toast({ title: "Retry thất bại", description: String(e), variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6">
      <div className="vas-card p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-100">Cấu hình render</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Chất lượng CRF: {crf}</Label>
              <Slider value={[crf]} min={15} max={35} step={1} onValueChange={(v) => setCrf(v[0])} />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Tốt nhất (file lớn)</span><span>Nhẹ (file nhỏ)</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Encoder preset: {preset}</Label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["ultrafast", "fast", "medium", "slow"].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>FPS</Label>
              <Input type="number" value={fps} onChange={(e) => setFps(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Âm lượng nhạc nền: {(musicVol * 100).toFixed(0)}%</Label>
              <Slider value={[musicVol]} min={0} max={1} step={0.05} onValueChange={(v) => setMusicVol(v[0])} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enableSubs} onCheckedChange={setEnableSubs} id="enable-subs" />
            <Label htmlFor="enable-subs">Embed phụ đề vào video</Label>
          </div>
          <div className="rounded-lg border bg-white/[0.03]/50 p-3 text-xs text-slate-500">
            Output: MP4 H.264 (libx264) + AAC · {project.aspect_ratio === "9:16" ? "1080x1920" : "1920x1080"} ·
            hiệu ứng zoom/pan, fade giữa cảnh, tự giảm nhạc khi có voice, logo watermark, intro/outro tùy chọn
          </div>
          <div className="flex gap-2">
            <Button
              onClick={start}
              disabled={!canRender || rendering || inProgress}
              className="bg-gradient-to-r from-amber-500 to-amber-300 hover:from-amber-400 hover:to-amber-200"
            >
              <Play className="h-4 w-4" />
              {inProgress ? "Đang xử lý..." : "Bắt đầu render"}
            </Button>
            {(inProgress) && (
              <Button variant="destructive" onClick={cancel}>
                <Square className="h-4 w-4" />
                Hủy
              </Button>
            )}
            {job?.status === "failed" && (
              <Button variant="outline" onClick={retry}>
                <RotateCcw className="h-4 w-4" />
                Thử lại từ bước lỗi
              </Button>
            )}
            {job?.status === "completed" && (
              <Button variant="outline" onClick={retry}>
                <RotateCcw className="h-4 w-4" />
                Render lại
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Job status */}
      {job && (
        <div className="vas-card p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-100">Trạng thái pipeline</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>
                Bước: <strong>{job.current_step || "—"}</strong>
              </span>
              <Badge
                variant={
                  job.status === "completed"
                    ? "success"
                    : job.status === "failed" || job.status === "cancelled"
                      ? "destructive"
                      : "warning"
                }
              >
                {STATUS_LABELS[job.status] || job.status}
              </Badge>
            </div>
            <Progress value={job.progress} />
            {job.error_message && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span className="whitespace-pre-wrap">{job.error_message}</span>
              </div>
            )}
            {job.status === "completed" && job.output_path && (
              <div className="space-y-2">
                <video src={outputVideoUrl(project.id, "output")} controls className="w-full max-h-[50vh] rounded-lg border" />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => api.openProjectFolder(project.id).catch(() => undefined)}>
                    <FolderOpen className="h-4 w-4" />
                    Mở thư mục đầu ra
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!job && (
        <div className="vas-card p-5">
          <div className="flex flex-col items-center gap-3 py-10">
            <FileVideo className="h-10 w-10 text-slate-500/40" />
            <div className="text-sm text-slate-500">Chưa có job render nào. Nhấn "Bắt đầu render" để khởi động pipeline.</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main editor page
// ---------------------------------------------------------------------------
export default function ProjectEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isNew = pathname.endsWith("/projects/new") || id === "new"
  const projectId = isNew ? null : Number(id)
  const { project, setProject, setScenes, setJob } = useEditorStore()
  const { backendOnline } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("idea")
  const [channels, setChannels] = useState<Array<{ id: number; name: string }>>([])
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const job = useJobPolling(projectId, projectId !== null)

  useEffect(() => {
    if (isNew) {
      setLoading(false)
      return
    }
    if (!projectId) return
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p)
        setActiveTab(p.status === "draft" ? "idea" : "script")
      })
      .catch((e) => toast({ title: "Không mở được dự án", description: String(e), variant: "destructive" }))
      .finally(() => setLoading(false))
    api.listChannels().then(setChannels).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isNew])

  useEffect(() => {
    if (job) setJob(job)
  }, [job, setJob])

  if (loading) {
    return <div className="p-8"><Progress value={40} className="w-40 animate-pulse" /></div>
  }

  if (!backendOnline) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div className="text-sm text-slate-500">
          Backend chưa hoạt động. Nếu đang chạy phiên bản desktop, backend sẽ tự khởi động cùng ứng dụng.
        </div>
        <Link to="/" className="text-sm text-amber-400 hover:underline">Quay lại Dashboard</Link>
      </div>
    )
  }

  if (isNew) {
    return (
      <div className="p-8">
        <NewProjectForm onCreated={(newId) => navigate(`/projects/${newId}`, { replace: true })} />
      </div>
    )
  }

  if (!project) return null

  return (
    <div className="min-h-full bg-[#0B0F12]">
      <ProjectHeader
        title={project.name}
        status={<StatusBadge status={project.status}>{STATUS_LABELS[project.status] || project.status}</StatusBadge>}
        subtitle={<><span>{project.aspect_ratio}</span><span>·</span><span>{project.target_duration}s mục tiêu</span><span>·</span><span>{project.channel_id ? channels.find((c) => c.id === project.channel_id)?.name ?? `Kênh #${project.channel_id}` : "Không kênh"}</span></>}
        actions={<><Link to="/projects"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4" />Dự án</Button></Link><Button variant="outline" size="sm" onClick={() => setConfigDialogOpen(true)}><Settings className="h-4 w-4" />Cấu hình kênh</Button><Button size="sm" onClick={() => api.openProjectFolder(project.id).catch(() => undefined)}><FolderOpen className="h-4 w-4" />Thư mục dự án</Button></>}
      />
      <Progress value={project.progress} className="h-1 rounded-none bg-[#111B21]" />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <StageNavigation value={activeTab} onValueChange={setActiveTab} />
        <div className="p-5">
        <TabsContent value="idea" className="mt-4">
          <ScriptCreator project={project} onDone={() => setActiveTab("script")} />
        </TabsContent>

        <TabsContent value="script" className="mt-4">
          <ScriptEditor
            project={project}
            onBuildScenes={async () => {
              try {
                await api.buildScenes(project.id)
                toast({ title: "Đã chia cảnh thành công" })
                setActiveTab("storyboard")
              } catch (e) {
                toast({ title: "Chia cảnh thất bại", description: String(e), variant: "destructive" })
              }
            }}
          />
        </TabsContent>

        <TabsContent value="storyboard" className="mt-4">
          <Storyboard project={project} />
        </TabsContent>

        <TabsContent value="characters" className="mt-4">
          <EditorCharacters project={project} />
        </TabsContent>

        <TabsContent value="media" className="mt-4">
          <EditorMedia project={project} />
        </TabsContent>

        <TabsContent value="subtitles" className="mt-4">
          <SubtitleConfigPanel project={project} />
        </TabsContent>

        <TabsContent value="publish" className="mt-4">
          <RenderPanel project={project} />
        </TabsContent>
        </div>
      </Tabs>

      {project.channel_id && (
        <ChannelConfigDialog
          channelId={project.channel_id}
          channelName={channels.find((c) => c.id === project.channel_id)?.name ?? `Kênh #${project.channel_id}`}
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
        />
      )}
    </div>
  )
}
