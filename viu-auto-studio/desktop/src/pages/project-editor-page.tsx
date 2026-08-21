import { Table } from "@/components/design-system"
import { useEffect, useMemo, useRef, useState } from "react"

import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft, Wand2, Check, Play, Square, Pause, Clock, RotateCcw, Upload, Trash2,
  GripVertical, SplitSquareHorizontal, Combine, RefreshCw, Mic, ImageIcon,
  FileVideo, Clapperboard, AlertCircle, ListChecks, Sparkles, FolderOpen, Settings, Zap,
    ShieldCheck, ClipboardPaste, Download, Save, Plus, Copy, ChevronLeft, ChevronRight,

} from "lucide-react"
import { api, mediaUrl, openLocalPath, outputVideoUrl, selectDirectory, startFlowBrowser } from "@/services/api"
import { RenderProgressCard } from "@/components/render-progress-card"

import { toast } from "@/hooks/use-toast"
import { useEditorStore } from "@/stores/editor-store"
import { useAppStore } from "@/stores/app-store"
import type {
  Project, ScriptData, ScriptPayload, Scene, SeoSchema, SubtitleConfig, TTSConfig,
    Character, TimelineClip, TimelineProject,
} from "@/types"

import type { MediaAssetRead } from "@/services/pages-api"
import { mediaAssetsApi } from "@/services/pages-api"

import { ASPECT_RATIOS, LANGUAGES, SCENE_EFFECTS, STATUS_LABELS, VIDEO_TYPES } from "@/types"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/design-system"

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
import { VideoEditor } from "@/components/video-editor"

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

const OUTPUT_PRESETS = [
  { id: "youtube", title: "YouTube ngang", detail: "16:9 · 1920×1080 · 30 FPS", icon: "▰" },
  { id: "shorts", title: "Shorts / TikTok", detail: "9:16 · 1080×1920 · 30 FPS", icon: "▯" },
  { id: "square", title: "Video vuông", detail: "1:1 · 1080×1080 · 30 FPS", icon: "□" },
  { id: "4k", title: "Chất lượng cao", detail: "16:9 · 3840×2160 · 30 FPS", icon: "◈" },
] as const

const RENDER_PROFILES = [
  { id: "fastest", title: "⚡ Nhanh nhất", detail: "Hardware GPU / Ultrafast (Mặc định)" },
  { id: "balanced", title: "⚖️ Cân bằng", detail: "Chất lượng tốt · 1080p 30 FPS" },
  { id: "high", title: "🎬 Chất lượng cao", detail: "Độ sắc nét tối đa · CRF 18" },
] as const

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
    const [channelType, setChannelType] = useState<"recap" | "ai_studio">("ai_studio")
  const [channelId, setChannelId] = useState<number | null>(null)
  const [channels, setChannels] = useState<Array<{ id: number; name: string }>>([])
  const [videoType, setVideoType] = useState("long")

  const [aspect, setAspect] = useState("16:9")
  const [language, setLanguage] = useState("vi")
  const [duration, setDuration] = useState(120)
  const [outputFolder, setOutputFolder] = useState("")
  const [loading, setLoading] = useState(false)

    useEffect(() => {
    api.listChannels().then((items) => {
      setChannels(items)
      if (items.length === 1) setChannelId(items[0].id)
    }).catch(() => undefined)
  }, [])

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
        channel_id: channelId,
        topic: topic.trim() || undefined,

        video_type: videoType,
        aspect_ratio: aspect,
        language,
        target_duration: duration,
        project_type: channelType === "recap" ? "recap" : "ai_studio",
        output_folder: outputFolder.trim() || undefined,
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
        <h2 className="mt-2 text-xl font-bold">Tạo Project Mới</h2>
        <p className="mt-1 text-sm text-slate-500">Định nghĩa video bạn muốn tạo</p>
      </div>
      <div className="space-y-1.5">
        <Label>Tên Project *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Series AI cho người mới" />
      </div>
      <div className="space-y-1.5">
        <Label>Chủ đề video</Label>
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Trí tuệ nhân tạo là gì?" />
      </div>

      {/* Channel type selection cards */}
      <div className="space-y-2">
        <Label>Loại kênh</Label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: "recap" as const, icon: "🎬", title: "Recap", desc: "Tóm tắt nội dung, phim, sự kiện" },
            { value: "ai_studio" as const, icon: "🤖", title: "AI Studio", desc: "Kịch bản gốc do AI sáng tác" },
          ] as const).map((card) => (
            <button
              key={card.value}
              type="button"
              onClick={() => setChannelType(card.value)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all",
                channelType === card.value
                  ? "border-amber-500/60 bg-amber-500/10 shadow-amber-500/10 shadow-lg"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20",
              )}
            >
              <span className="text-2xl">{card.icon}</span>
              <span className={cn("text-sm font-semibold", channelType === card.value ? "text-amber-300" : "text-slate-200")}>{card.title}</span>
              <span className="text-[11px] text-slate-500">{card.desc}</span>
            </button>
          ))}
        </div>
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

            <div className="space-y-1.5">
        <Label>Kênh sản xuất</Label>
        <Select value={channelId ? String(channelId) : "none"} onValueChange={(value) => setChannelId(value === "none" ? null : Number(value))}>
          <SelectTrigger><SelectValue placeholder="Chọn kênh" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Không gắn kênh</SelectItem>
            {channels.map((channel) => <SelectItem key={channel.id} value={String(channel.id)}>{channel.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-slate-500">Kênh quyết định giọng, phong cách viết, model media và chế độ duyệt.</p>
      </div>

      {/* Output folder */}
      <div className="space-y-1.5">

        <Label>Output Folder (tuỳ chọn)</Label>
        <div className="flex gap-2">
          <Input
            value={outputFolder}
            onChange={(e) => setOutputFolder(e.target.value)}
            placeholder="Mặc định: thư mục projects trong app"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                const folder = await selectDirectory()
                if (folder) setOutputFolder(folder)
              } catch { /* noop */ }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-slate-300 transition-colors hover:bg-white/[0.08]"
          >
            <FolderOpen className="h-4 w-4" />
            Browse
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => window.history.back()}
        >
          Huỷ
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] text-white shadow-lg shadow-purple-500/20 hover:brightness-110"
          disabled={loading}
        >
          {loading ? "Đang tạo..." : "Tạo Project"}
        </Button>
      </div>
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
  const [niche, setNiche] = useState("")

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
        niche: niche || undefined,
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
                <Label>Niche profile</Label>
                <Select value={niche || "general"} onValueChange={(v) => setNiche(v === "general" ? "" : v)}>
                  <SelectTrigger className="w-full bg-[#141d22] border-white/10 text-sm text-slate-200">
                    <SelectValue placeholder="Tổng quát" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141d22] border-white/10 text-slate-200">
                    <SelectItem value="general">Tổng quát</SelectItem>
                    <SelectItem value="tech">Công nghệ và AI</SelectItem>
                    <SelectItem value="education">Giáo dục và giải thích</SelectItem>
                    <SelectItem value="finance">Tài chính phổ thông</SelectItem>
                    <SelectItem value="cooking">Ẩm thực</SelectItem>
                    <SelectItem value="entertainment">Giải trí và bình luận</SelectItem>
                  </SelectContent>
                </Select>
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
function ScriptEditor({ project, onBuildScenes, onApproveAndContinue }: { project: Project; onBuildScenes: () => void; onApproveAndContinue: () => Promise<void> }) {
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
  const [approving, setApproving] = useState(false)

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
    setApproving(true)
    try {
      if (script && text.trim() !== (script.full_script || "").trim()) {
        await api.saveScript(project.id, { ...script, full_script: text })
        setScript({ ...script, full_script: text })
        setDirtyScript(false)
      }
      await onApproveAndContinue()
    } catch (e) {
      toast({ title: "Pipeline sau duyệt thất bại", description: String(e), variant: "destructive" })
    } finally {
      setApproving(false)
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
                        <Button onClick={approve} variant="outline" disabled={approving}>
              <Check className={cn("h-4 w-4", approving && "animate-pulse")} />
              {approving ? "Đang chạy pipeline…" : "Duyệt kịch bản & chạy tiếp"}
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
  const [factoryStarting, setFactoryStarting] = useState(false)
  const [flowConnection, setFlowConnection] = useState<{ factory_state?: string; factory_project_id?: number | null; status?: string; last_error?: string } | null>(null)
  
  // AI Shot Proposal Dialog State
  const [aiProposalScene, setAiProposalScene] = useState<Scene | null>(null)
  const [aiProposedShots, setAiProposedShots] = useState<any[]>([])
  const [generatingProposal, setGeneratingProposal] = useState(false)

  // Flow Connector task queue state

  const [taskState, setTaskState] = useState<{
    state: string
    paused: boolean
    counts: Record<string, number>
    run_status: string
    factory_session_id: string
    total: number
    completed: number
  } | null>(null)
  const [workerOnline, setWorkerOnline] = useState(false)


  // Helper to auto-balance and recalculate sequential start/end timestamps for shots with proportional scaling & minDuration
  const balanceShotsTimestamps = (shots: any[], totalDuration: number) => {
    if (!shots || shots.length === 0) return []
    const targetTotal = totalDuration > 0 ? Number(totalDuration.toFixed(1)) : 6.0
    const count = shots.length
    const minDur = 0.5

    if (count === 1) {
      return [{
        ...shots[0],
        order_index: 0,
        duration: targetTotal,
        start_time: 0.0,
        end_time: targetTotal,
      }]
    }

    let balanced = shots.map(s => ({ ...s, duration: Math.max(minDur, Number(s.duration) || minDur) }))
    const currentSum = balanced.reduce((sum, s) => sum + s.duration, 0)

    if (Math.abs(currentSum - targetTotal) > 0.05) {
      const ratio = targetTotal / currentSum
      balanced = balanced.map((s, i) => {
        let d = Number((s.duration * ratio).toFixed(1))
        d = Math.max(minDur, d)
        return { ...s, duration: d }
      })
    }

    // Assign sequential timestamps and ensure final end_time is exactly targetTotal
    let runningTime = 0.0
    return balanced.map((s, idx) => {
      const st = Number(runningTime.toFixed(1))
      let dur = Number(s.duration.toFixed(1))
      if (idx === count - 1) {
        dur = Math.max(minDur, Number((targetTotal - runningTime).toFixed(1)))
      }
      const et = idx === count - 1 ? targetTotal : Number((st + dur).toFixed(1))
      runningTime = et
      return {
        ...s,
        order_index: idx,
        duration: dur,
        start_time: st,
        end_time: et,
      }
    })
  }

  const load = () => {
    api.listScenes(project.id).then(setScenes).catch(() => undefined)
  }
  useEffect(load, [project.id, setScenes])

  // Poll Flow Connector task queue + worker status
  useEffect(() => {
    const poll = () => {
      api.mediaTasksState(project.id).then(setTaskState).catch(() => undefined)
      api.flowConnection().then(setFlowConnection).catch(() => undefined)
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

  // Stats computed from scenes
  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 0), 0)
  const mediaCount = scenes.filter((s) => Boolean(s.image_path || (s.media_path && s.media_type === "image"))).length
  const clipCount = scenes.filter((s) => Boolean(s.video_path || (s.media_path && s.media_type === "video"))).length
  const missingMedia = scenes.filter((s) => !s.image_path && !s.video_path && !s.media_path).length
  const completedScenes = scenes.filter((s) => Boolean((s.video_path || s.image_path || s.media_path) && s.audio_path)).length

  const formatDur = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    return `${m}:${String(s).padStart(2, "0")}`
  }

  const startFactory = async () => {
    setFactoryStarting(true)
    try {
      const res = await api.factoryStart(project.id, {
        media_type: "image",
        aspect: project.aspect_ratio || "16:9",
        include_video: true,
        factory_mode: true,
      })
      const browser = await startFlowBrowser(project.id, res.factory_session_id)
      if (!browser.ok) {
        toast({ title: "Không khởi động được Chrome Flow", description: browser.message, variant: "destructive" })
      } else if (res.requires_login) {
        toast({ title: "Đang mở Google Flow", description: browser.message || "Hệ thống đang tự kết nối và mở phiên làm việc..." })
      } else if (res.factory_state === "queued") {
        toast({ title: "Đã xếp hàng Factory", description: `Dự án này ở vị trí ${res.queue_position}. Flow sẽ tự chạy khi dự án trước hoàn tất.` })
      } else {
        toast({ title: "Factory Mode đã chạy", description: `Đã xếp ${res.created} task và tự kết nối Flow Connector.` })
      }
      load()
    } catch (e) {
      toast({ title: "Khởi động Factory thất bại", description: String(e), variant: "destructive" })
    } finally {
      setFactoryStarting(false)
    }
  }

  return (

    <div className="space-y-4">
      {/* Consolidated Unified Control Bar: Gọn gàng, tiết kiệm không gian */}
      {scenes.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#12191e] p-3.5 shadow-sm space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Stats Pills & Status */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-white/5 border border-white/10 px-2 py-1 font-semibold text-slate-200">
                {scenes.length} cảnh · {formatDur(totalDuration)}
              </span>
              <span className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-slate-300">
                {mediaCount} ảnh · {clipCount} clip
              </span>
              <span className={cn(
                "rounded-md px-2 py-1 font-medium border",
                completedScenes === scenes.length
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-amber-500/15 border-amber-500/30 text-amber-300"
              )}>
                {completedScenes}/{scenes.length} hoàn thành
              </span>

              {taskState && taskState.total > 0 && (
                <div className="flex items-center gap-1.5">
                  <Badge variant={taskState.state === "finished" ? "success" : "secondary"} className="h-6 text-[11px]">
                    {taskState.state === "running" ? <Clock className="mr-1 h-3 w-3 animate-pulse" /> : <Check className="mr-1 h-3 w-3" />}
                    Flow: {taskState.state === "finished" ? "Hoàn tất" : taskState.state} ({taskState.completed}/{taskState.total})
                  </Badge>
                  <Badge variant={workerOnline ? "success" : "secondary"} className="h-6 text-[11px]">
                    <Zap className="mr-1 h-3 w-3" /> Extension {workerOnline ? "online" : "connecting"}
                  </Badge>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={analyzing}
                className="h-8 gap-1.5 text-xs bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white shadow-sm hover:brightness-110"
                onClick={async () => {
                  setAnalyzing(true)
                  try {
                    const data = await api.semanticAnalyze(project.id, {
                      existing_narrations: scenes.map((s) => s.narration),
                    })
                    await api.buildScenes(project.id, { semantic_analysis: data.scenes })
                    toast({ title: "Đã phân cảnh AI theo ngữ nghĩa", description: `${data.scenes.length} cảnh mới — mỗi cảnh có prompt hình riêng theo nội dung toàn cảnh.` })
                    load()
                  } catch (e) {
                    toast({ title: "Phân cảnh AI thất bại", description: String(e), variant: "destructive" })
                  } finally {
                    setAnalyzing(false)
                  }
                }}
              >
                <Sparkles className={cn("h-3.5 w-3.5", analyzing && "animate-pulse")} />
                {analyzing ? "Đang phân tích…" : "Phân cảnh AI"}
              </Button>

              {missingMedia > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={factoryStarting}
                  className="h-8 gap-1.5 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                  onClick={startFactory}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", factoryStarting && "animate-spin")} />
                  Chạy lại Factory ({missingMedia})
                </Button>
              )}

              <Button
                size="sm"
                disabled={factoryStarting}
                className="h-8 gap-1.5 text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm hover:brightness-110"
                onClick={startFactory}
              >
                <Zap className={cn("h-3.5 w-3.5", factoryStarting && "animate-pulse")} />
                {factoryStarting ? "Đang khởi động…" : "Chạy Factory (Flow)"}
              </Button>
            </div>
          </div>

          <Progress value={scenes.length > 0 ? Math.round((completedScenes / scenes.length) * 100) : 0} className="h-1 bg-white/5" />
        </div>
      )}

      {/* Flow Connector details when error or waiting */}
      {taskState && taskState.total > 0 && (flowConnection?.factory_state === "waiting_login" || flowConnection?.last_error) && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-2">
          <div className="flex items-center justify-between">
            <span>Thông báo Flow: {flowConnection?.last_error || "Chrome đang chờ đăng nhập Google Flow..."}</span>
            {(taskState.state === "running" || taskState.state === "queued" || taskState.state === "paused") && (
              <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/40 text-red-300 hover:bg-red-500/10" onClick={async () => {
                if (!confirm("Dừng phiên Factory của dự án này? Cảnh đã có media không bị ảnh hưởng.")) return
                try {
                  await api.mediaTasksCancel(project.id)
                  toast({ title: "Đã dừng Factory", description: "Chỉ phiên của dự án này bị dừng; cảnh đã hoàn thành vẫn được giữ." })
                } catch (e) {
                  toast({ title: "Dừng Factory thất bại", description: String(e), variant: "destructive" })
                }
              }}>
                <Square className="mr-1 h-3 w-3" /> Dừng Factory
              </Button>
            )}
          </div>
          {flowConnection?.factory_state === "waiting_login" && (
            <p className="text-[11px] text-amber-300/80">
              Chrome profile riêng của Viu đang chờ đăng nhập Google Flow. Đăng nhập một lần trong cửa sổ Chrome được mở tự động; sau khi Flow có prompt editor, queue sẽ tự tiếp tục.
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
        scenes.map((scene, index) => {
          const masterDuration = scene.duration > 0 ? Number(scene.duration.toFixed(1)) : 6.0

          // Normalize shots array: fallback to 1 default shot if empty
          const rawShots = (scene.shots && scene.shots.length > 0)
            ? scene.shots
            : [{
                id: `shot_${scene.id}_default`,
                order_index: 0,
                media_path: scene.media_path || "",
                image_path: scene.image_path || "",
                video_path: scene.video_path || "",
                media_type: scene.media_type || "image",
                visual_prompt: scene.visual_prompt || "",
                transition_description: scene.transition_description || "",
                effect: scene.effect || "zoom_in",
                duration: masterDuration,
                start_time: 0.0,
                end_time: masterDuration,
              }]

          const sceneShots = balanceShotsTimestamps(rawShots, masterDuration)
          const totalShotsDuration = Number(sceneShots.reduce((sum, s) => sum + (s.duration || 0), 0).toFixed(1))
          const isSynced = Math.abs(totalShotsDuration - masterDuration) < 0.15

          const handleAddShot = () => {
            const nextIdx = sceneShots.length
            const newShot = {
              id: `shot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              order_index: nextIdx,
              media_path: "",
              image_path: "",
              video_path: "",
              media_type: "image",
              visual_prompt: `${scene.visual_prompt || "Cinematic shot"} (Shot #${nextIdx + 1})`,
              transition_description: "pan_left",
              effect: "pan_left",
              duration: 2.0,
              start_time: 0.0,
              end_time: 2.0,
            }
            const balanced = balanceShotsTimestamps([...sceneShots, newShot], masterDuration)
            updateScene(scene, { shots: balanced } as any)
            toast({ title: `Đã thêm Shot #${nextIdx + 1}`, description: "Đã tự động cân bằng thời lượng các shot theo audio." })
          }

          // Open AI Proposal Dialog instead of silent overwrite
          const handleOpenAiProposal = () => {
            setGeneratingProposal(true)
            setAiProposalScene(scene)
            
            const count = masterDuration >= 10.0 ? 3 : masterDuration >= 5.0 ? 2 : 1
            const avg = Number((masterDuration / count).toFixed(1))
            const basePrompt = scene.visual_prompt || "Cinematic detailed scene, photorealistic lighting"
            const motions = ["zoom_in", "pan_left", "pan_right", "zoom_out"]
            
            const proposed = Array.from({ length: count }).map((_, i) => {
              const st = Number((i * avg).toFixed(1))
              const dur = (i === count - 1) ? Number((masterDuration - (avg * (count - 1))).toFixed(1)) : avg
              const et = Number((st + dur).toFixed(1))
              return {
                id: `proposed_shot_${i + 1}`,
                order_index: i,
                media_path: i === 0 ? (scene.media_path || scene.image_path || "") : "",
                image_path: i === 0 ? (scene.image_path || "") : "",
                video_path: i === 0 ? (scene.video_path || "") : "",
                media_type: "image",
                visual_prompt: i === 0 ? basePrompt : `${basePrompt} (Shot #${i + 1}: góc máy cận cảnh và chi tiết mới)`,
                transition_description: `Shot ${i + 1}`,
                effect: motions[i % motions.length],
                duration: dur,
                start_time: st,
                end_time: i === count - 1 ? masterDuration : et,
              }
            })
            
            setAiProposedShots(proposed)
            setGeneratingProposal(false)
          }

          const handleDeleteShot = (shotId: string) => {
            if (sceneShots.length <= 1) {
              toast({ title: "Không thể xoá", description: "Mỗi cảnh cần tối thiểu 1 shot visual." })
              return
            }
            const remaining = sceneShots.filter((s) => s.id !== shotId)
            const balanced = balanceShotsTimestamps(remaining, masterDuration)
            updateScene(scene, { shots: balanced } as any)
            toast({ title: "Đã xoá shot", description: "Đã tự động cân đối lại thời lượng các shot còn lại." })
          }

          const handleUpdateShot = (shotId: string, patch: any) => {
            let updated = sceneShots.map((s) => s.id === shotId ? { ...s, ...patch } : s)
            // If duration was changed, re-balance other shots
            if (patch.duration !== undefined) {
              const newDur = Math.max(0.5, Math.min(masterDuration - 0.5, Number(patch.duration)))
              const otherCount = updated.length - 1
              if (otherCount > 0) {
                const remainingPool = Math.max(0.5 * otherCount, masterDuration - newDur)
                const otherAvg = Number((remainingPool / otherCount).toFixed(1))
                updated = updated.map(s => {
                  if (s.id === shotId) return { ...s, duration: newDur }
                  return { ...s, duration: otherAvg }
                })
              }
              updated = balanceShotsTimestamps(updated, masterDuration)
            }
            
            const mainPatch: any = { shots: updated }
            if (shotId === sceneShots[0].id) {
              if (patch.visual_prompt !== undefined) mainPatch.visual_prompt = patch.visual_prompt
              if (patch.effect !== undefined) mainPatch.effect = patch.effect
            }
            updateScene(scene, mainPatch)
          }

          const handleRegenerateShotMedia = async (shot: any) => {
            try {
              setRegeneratingMedia(scene.id)
              const s = await api.regenerateMedia(project.id, scene.id)
              if (s.media_path) {
                handleUpdateShot(shot.id, { media_path: s.media_path, image_path: s.media_path, media_type: s.media_type || "image" })
              }
              toast({ title: "Đã sinh lại ảnh AI cho Shot", description: "Media mới đã được gán vào shot." })
              load()
            } catch (e) {
              toast({ title: "Sinh lại ảnh thất bại", description: String(e), variant: "destructive" })
            } finally {
              setRegeneratingMedia(null)
            }
          }

          return (
            <div
              key={scene.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) move(dragIndex, index)
                setDragIndex(null)
              }}
              className={cn(
                "rounded-xl border transition-all shadow-sm bg-[#12191e] overflow-hidden space-y-0",
                selected.has(scene.id) ? "border-amber-500/60 ring-1 ring-amber-500/20" : "border-white/10 hover:border-white/20"
              )}
            >
              {/* 1. SCENE HEADER & NARRATION BAR */}
              <div className="p-3.5 bg-black/40 border-b border-white/5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSelect(scene.id)}
                      className={cn(
                        "h-6 w-6 p-0 shrink-0 font-bold text-xs rounded border",
                        selected.has(scene.id) ? "border-amber-400 bg-amber-400/15 text-amber-300" : "border-white/10 text-slate-400 bg-white/5"
                      )}
                    >
                      {index + 1}
                    </Button>
                    <GripVertical className="h-3.5 w-3.5 text-slate-500 cursor-grab" />
                    <span className="font-bold text-slate-100">SCENE #{index + 1}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400">Lời thuyết minh xuyên suốt</span>
                    <span className="text-[11px] font-mono text-amber-300/90 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 font-semibold">
                      🎙 {masterDuration.toFixed(1)}s audio
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {scene.audio_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] px-2 border-white/10 bg-white/5 text-slate-300 hover:text-amber-300 gap-1"
                        onClick={() => {
                          const audio = new Audio(mediaUrl(scene.audio_path!))
                          audio.play().catch(() => {})
                        }}
                      >
                        <Play className="h-3 w-3 fill-current" /> Nghe giọng
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-slate-400 hover:text-red-400"
                      title="Xoá cảnh này"
                      onClick={async () => {
                        if (!confirm(`Xoá cảnh #${index + 1}?`)) return
                        try {
                          await api.deleteScene(project.id, scene.id)
                          toast({ title: "Đã xoá cảnh" })
                          load()
                        } catch (e) {
                          toast({ title: "Xoá cảnh thất bại", description: String(e), variant: "destructive" })
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400/70 hover:text-red-400" />
                    </Button>
                  </div>
                </div>

                {/* Ô Nhập Lời Thuyết Minh Của Cả Cảnh */}
                <Textarea
                  value={scene.narration}
                  onChange={(e) => updateScene(scene, { narration: e.target.value })}
                  rows={2}
                  className="text-xs min-h-[44px] bg-black/50 border-white/10 leading-relaxed font-sans text-slate-100"
                  placeholder="Nhập lời thuyết minh cho phân cảnh này..."
                />
              </div>

              {/* 2. VISUAL SHOTS SUB-TIMELINE */}
              <div className="p-3.5 space-y-3 bg-[#0d1419]/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-200">🎬 VISUAL SHOTS</span>
                    <span className="text-[11px] text-slate-400">({sceneShots.length} shot hình/video)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px] border-amber-500/30 text-amber-300 hover:bg-amber-500/10 gap-1"
                      onClick={handleOpenAiProposal}
                    >
                      <Sparkles className="h-3 w-3" /> ✨ AI chia shots
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px] border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 gap-1"
                      onClick={handleAddShot}
                    >
                      <Plus className="h-3 w-3" /> + Thêm shot
                    </Button>
                  </div>
                </div>

                {/* Danh sách các Shot Cards */}
                <div className={cn(
                  "grid gap-3",
                  sceneShots.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                )}>
                  {sceneShots.map((shot, sIndex) => (
                    <div
                      key={shot.id || sIndex}
                      className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-2.5 hover:border-white/20 transition shadow-inner"
                    >
                      {/* Shot Title & Timeline Duration Inputs */}
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-amber-300">Shot #{sIndex + 1}</span>
                          <span className="text-slate-400 font-mono">
                            {shot.start_time.toFixed(1)}s → {shot.end_time.toFixed(1)}s
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-500">Thời lượng:</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0.5"
                            max={masterDuration}
                            value={shot.duration}
                            onChange={(e) => handleUpdateShot(shot.id, { duration: Number(e.target.value) })}
                            className="w-12 h-5 rounded bg-black/60 border border-white/10 text-center font-mono text-[10px] text-amber-300"
                            title="Chỉnh thời lượng shot (tự cân đối các shot khác)"
                          />
                          <span className="text-[10px] text-slate-500">s</span>
                        </div>
                      </div>

                      {/* Thumbnail Media Box 16:9 */}
                      <div className="relative aspect-video w-full rounded-md overflow-hidden border border-white/10 bg-black/60 flex items-center justify-center group shadow-sm">
                        {(shot.image_path || (shot.media_type === "image" && shot.media_path) || (sIndex === 0 && scene.image_path)) ? (
                          <img
                            src={mediaUrl(shot.image_path || shot.media_path || (sIndex === 0 ? scene.image_path : "") || "")}
                            alt="Shot preview"
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            loading="lazy"
                          />
                        ) : (shot.video_path || (shot.media_type === "video" && shot.media_path) || (sIndex === 0 && scene.video_path)) ? (
                          <video
                            src={mediaUrl(shot.video_path || shot.media_path || (sIndex === 0 ? scene.video_path : "") || "")}
                            controls
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-slate-500">
                            <ImageIcon className="h-6 w-6 text-slate-600/70" />
                            <span className="text-[10px]">Chưa có media</span>
                          </div>
                        )}

                        {/* Action Overlays on Media */}
                        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
                          <label className="cursor-pointer rounded bg-black/80 hover:bg-black/95 text-white border border-white/20 px-1.5 py-0.5 text-[9px] font-medium shadow transition flex items-center gap-1 backdrop-blur-sm">
                            <Upload className="h-2.5 w-2.5" />
                            {(shot.image_path || shot.video_path || shot.media_path) ? "Đổi" : "Tải ảnh"}
                            <input
                              type="file"
                              accept="image/*,video/*"
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0]
                                if (f) {
                                  const form = new FormData()
                                  form.append("file", f)
                                  try {
                                    const res = await fetch(`/api/upload/media?project_id=${project.id}`, { method: "POST", body: form })
                                    const data = await res.json()
                                    handleUpdateShot(shot.id, { media_path: data.media_path, image_path: data.media_path, media_type: data.media_type })
                                    toast({ title: `Đã gán media cho Shot #${sIndex + 1}` })
                                  } catch (err) {
                                    toast({ title: "Tải media thất bại", description: String(err), variant: "destructive" })
                                  }
                                }
                                e.target.value = ""
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      {/* Prompt input for this shot */}
                      <div className="space-y-1">
                        <Input
                          value={shot.visual_prompt}
                          onChange={(e) => handleUpdateShot(shot.id, { visual_prompt: e.target.value })}
                          className="text-[11px] italic text-slate-300 h-7 bg-black/40 border-white/10"
                          placeholder={`Prompt độc lập cho Shot #${sIndex + 1}...`}
                        />
                      </div>

                      {/* Camera motion effect & quick actions */}
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <Select
                          value={shot.effect || "zoom_in"}
                          onValueChange={(v) => handleUpdateShot(shot.id, { effect: v })}
                        >
                          <SelectTrigger className="h-6 text-[10px] bg-black/40 border-white/10 px-2 py-0 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SCENE_EFFECTS.map((ef) => (
                              <SelectItem key={ef.value} value={ef.value}>
                                {ef.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-slate-400 hover:text-amber-300"
                            title="Sinh lại ảnh riêng cho shot này"
                            disabled={regeneratingMedia === scene.id}
                            onClick={() => handleRegenerateShotMedia(shot)}
                          >
                            <RefreshCw className={cn("h-3 w-3", regeneratingMedia === scene.id && "animate-spin text-amber-400")} />
                          </Button>
                          {sceneShots.length > 1 && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-slate-400 hover:text-red-400"
                              onClick={() => handleDeleteShot(shot.id)}
                              title="Xoá shot này"
                            >
                              <Trash2 className="h-3 w-3 text-red-400/80" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 3. TIMELINE SYNC FOOTER BAR TRỰC QUAN */}
                <div className="mt-2 flex flex-wrap items-center justify-between rounded-lg border border-white/5 bg-black/25 px-3 py-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-300">🎙 Narration: <b>{masterDuration.toFixed(1)}s</b></span>
                    <span className="text-slate-600">|</span>
                    <span className="font-mono text-slate-300">🎬 Visual: <b>{sceneShots.length} shots ({totalShotsDuration.toFixed(1)}s)</b></span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSynced ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <Check className="h-3 w-3" /> Đồng bộ thời lượng
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-400 font-medium flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Lệch {Math.abs(totalShotsDuration - masterDuration).toFixed(1)}s
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 text-[10px] text-amber-300 hover:bg-amber-400/10 px-1.5"
                          onClick={() => {
                            const balanced = balanceShotsTimestamps(sceneShots, masterDuration)
                            updateScene(scene, { shots: balanced } as any)
                            toast({ title: "Đã cân bằng lại 100% theo audio" })
                          }}
                        >
                          Cân bằng lại
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })
      )}

      {/* AI SHOTS PROPOSAL PREVIEW DIALOG: Người dùng xem và duyệt trước khi áp dụng */}
      <Dialog open={Boolean(aiProposalScene)} onOpenChange={(open) => !open && setAiProposalScene(null)}>
        <DialogContent className="max-w-2xl bg-[#12191e] border-white/10 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-amber-300 font-bold">
              <Sparkles className="h-4 w-4" /> Đề xuất phân chia Visual Shots từ AI
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              AI đã phân tích lời thoại của cảnh và chia thành các góc máy/shots visual phù hợp với thời lượng âm thanh.
            </DialogDescription>
          </DialogHeader>

          {aiProposalScene && (
            <div className="space-y-4 py-2">
              {/* Lời thoại trích đoạn */}
              <div className="rounded-lg bg-black/40 border border-white/5 p-3 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">Lời thuyết minh:</span>
                  <span className="font-mono text-amber-300">🎙 {aiProposalScene.duration?.toFixed(1) || '6.0'}s</span>
                </div>
                <p className="text-xs italic text-slate-200 leading-relaxed font-sans">
                  "{aiProposalScene.narration}"
                </p>
              </div>

              {/* Danh sách các đề xuất shot */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {aiProposedShots.map((shot, idx) => (
                  <div key={idx} className="rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-400">Shot #{idx + 1}</span>
                      <span className="font-mono text-slate-400 text-[11px]">
                        {shot.start_time.toFixed(1)}s → {shot.end_time.toFixed(1)}s ({shot.duration.toFixed(1)}s)
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 bg-black/40 p-1.5 rounded border border-white/5 italic">
                      {shot.visual_prompt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAiProposalScene(null)} className="border-white/10 text-slate-300">
              Huỷ
            </Button>
            <Button
              size="sm"
              className="bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-semibold hover:brightness-110"
              onClick={() => {
                if (aiProposalScene && aiProposedShots.length > 0) {
                  updateScene(aiProposalScene, { shots: aiProposedShots } as any)
                  toast({ title: "Đã áp dụng các Shots vào Scene", description: `Đã chia thành ${aiProposedShots.length} visual shots.` })
                  setAiProposalScene(null)
                  load()
                }
              }}
            >
              <Check className="h-4 w-4 mr-1" /> Áp dụng vào Scene
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Subtitles
// ---------------------------------------------------------------------------
function SubtitleConfigPanel({ project }: { project: Project }) {
  const { subtitleConfig, setSubtitleConfig } = useEditorStore()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const applyChannelSubtitleStyle = async () => {
      try {
        const source = await api.getProjectConfig(project.id)
        if (cancelled || !source.config_json) return
        const parsed = JSON.parse(source.config_json) as Record<string, unknown>
        const channel = parsed.channel && typeof parsed.channel === "object" ? parsed.channel as Record<string, unknown> : parsed
        const style = String(channel.subtitle_style || "default")
        const presets: Record<string, Partial<SubtitleConfig>> = {
          clean: { font_size: 48, position: "bottom", primary_color: "#FFFFFF", border_width: 2 },
          bold: { font_size: 64, position: "bottom", primary_color: "#FFD700", border_width: 4 },
          cinematic: { font_size: 42, position: "bottom", primary_color: "#E8E8E8", border_width: 0 },
        }
        const preset = presets[style]
        if (preset && !cancelled) setSubtitleConfig(preset)
      } catch {
        // Project config is optional; keep the editor's existing subtitle state.
      }
    }
    void applyChannelSubtitleStyle()
    return () => { cancelled = true }
  }, [project.id, setSubtitleConfig])

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
  const [sceneCount, setSceneCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")

  useEffect(() => { load() }, [])
  async function load() {
    try {
      const [list, scenes] = await Promise.all([
        api.listCharacters(project.id),
        api.listScenes(project.id),
      ])
      setChars(list)
      setSceneCount(scenes.length)
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
          <div className="vas-card col-span-full flex items-start gap-3 border-emerald-500/20 p-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">✓</div>
            <div>
              <div className="font-medium text-slate-200">Không cần nhân vật cố định cho kịch bản này</div>
              <p className="mt-1 text-sm text-slate-500">
                {sceneCount > 0
                  ? `${sceneCount} phân cảnh đang dùng chủ thể và bối cảnh riêng theo nội dung. Không tạo nhân vật giả chỉ để lấp đầy bước này.`
                  : "Sau khi chia cảnh, hệ thống sẽ dùng nhân vật cố định ở đây nếu nội dung thật sự cần tính nhất quán."}
              </p>
              <p className="mt-2 text-xs text-slate-600">Chỉ thêm nhân vật khi một người cụ thể xuất hiện lặp lại giữa nhiều cảnh.</p>
            </div>
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
        <div>
          <p className="text-xs text-slate-500">Media thật của project, đồng bộ trực tiếp từ phân cảnh, TTS và bản render.</p>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
            <Badge variant="outline">{assets.filter((asset) => asset.kind === "media").length} ảnh/video</Badge>
            <Badge variant="outline">{assets.filter((asset) => asset.kind === "voice").length} voice</Badge>
            <Badge variant="outline">{assets.filter((asset) => asset.verify_state === "verified").length}/{assets.length} đã xác minh</Badge>
          </div>
        </div>
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
                <td className="max-w-64 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {a.kind === "media" && /\.(png|jpe?g|webp)$/i.test(a.file_path) && <img src={mediaUrl(a.file_path)} className="h-10 w-16 rounded object-cover" />}
                    {a.kind === "media" && /\.(mp4|webm|mov)$/i.test(a.file_path) && <video src={mediaUrl(a.file_path)} muted className="h-10 w-16 rounded object-cover" />}
                    <span className="truncate">{a.file_path.split(/[\\/]/).pop() ?? a.file_path}</span>
                  </div>
                </td>
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
// Timeline Editor — canonical JSON backed by SQLite
// ---------------------------------------------------------------------------
const TIMELINE_TRACKS: Array<{ id: string; label: string; color: string }> = [
  { id: "visual", label: "Video / Ảnh", color: "bg-cyan-500/70" },
  { id: "overlay", label: "Overlay", color: "bg-violet-500/70" },
  { id: "voice", label: "Voice", color: "bg-emerald-500/70" },
  { id: "music", label: "Nhạc nền", color: "bg-amber-500/70" },
  { id: "subtitle", label: "Phụ đề", color: "bg-rose-500/70" },
]

function TimelineEditor({ project, onRender }: { project: Project; onRender: () => void }) {
  const [timeline, setTimeline] = useState<TimelineProject | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [zoom, setZoom] = useState(42)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getTimeline(project.id)
      setTimeline(data)
      setSelectedId(data.clips.find((clip: TimelineProject["clips"][number]) => clip.track === "visual")?.id ?? data.clips[0]?.id ?? null)
      setDirty(false)
    } catch (e) {
      toast({ title: "Không tải được timeline", description: String(e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [project.id])

  const selected = timeline?.clips.find((clip) => clip.id === selectedId) ?? null
  const patchClip = (id: number | undefined, patch: Partial<TimelineClip>) => {
    if (!timeline || id === undefined) return
    setTimeline({ ...timeline, clips: timeline.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip) })
    setDirty(true)
  }

  const save = async () => {
    if (!timeline) return
    setSaving(true)
    try {
      const saved = await api.saveTimeline(project.id, {
        duration: timeline.duration,
        settings: timeline.settings,
        expected_version: timeline.version,
        clips: timeline.clips.map(({ id: _id, timeline_id: _timelineId, created_at: _createdAt, ...clip }) => clip),
      })
      setTimeline(saved)
      setDirty(false)
      toast({ title: "Đã lưu timeline", description: `Phiên bản ${saved.version}` })
    } catch (e) {
      toast({ title: "Lưu timeline thất bại", description: String(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const removeSelected = () => {
    if (!timeline || !selected || selected.locked) return
    setTimeline({ ...timeline, clips: timeline.clips.filter((clip) => clip.id !== selected.id) })
    setSelectedId(null)
    setDirty(true)
  }

  const shiftSelected = (delta: number) => {
    if (!selected || selected.locked) return
    const length = selected.clip_end - selected.clip_start
    const start = Math.max(0, Math.min(Math.max(0, timeline?.duration ?? selected.clip_end) - length, selected.clip_start + delta))
    patchClip(selected.id, { clip_start: start, clip_end: start + length })
  }

  const duplicateSelected = () => {
    if (!timeline || !selected) return
    const length = selected.clip_end - selected.clip_start
    const start = Math.min(Math.max(0, timeline.duration - length), selected.clip_end + 0.25)
    const duplicate: TimelineClip = {
      ...selected,
      id: -Date.now(),
      clip_start: start,
      clip_end: start + length,
      group_id: selected.group_id ? `${selected.group_id}-copy` : "copy",
      order_index: timeline.clips.length,
    }
    setTimeline({ ...timeline, clips: [...timeline.clips, duplicate] })
    setSelectedId(duplicate.id ?? null)
    setDirty(true)
  }

  const splitSelected = () => {
    if (!timeline || !selected || selected.locked) return
    const midpoint = selected.clip_start + (selected.clip_end - selected.clip_start) / 2
    if (midpoint <= selected.clip_start + 0.05 || midpoint >= selected.clip_end - 0.05) return
    const splitId = -Date.now()
    const first: TimelineClip = { ...selected, clip_end: midpoint, out_point: selected.in_point + (midpoint - selected.clip_start), id: splitId }
    const second: TimelineClip = { ...selected, clip_start: midpoint, in_point: selected.in_point + (midpoint - selected.clip_start), id: splitId - 1, order_index: selected.order_index + 1 }
    setTimeline({ ...timeline, clips: [...timeline.clips.filter((clip) => clip.id !== selected.id), first, second] })
    setSelectedId(first.id ?? null)
    setDirty(true)
  }

  const updateDuration = (value: number) => {
    if (!timeline || !Number.isFinite(value)) return
    setTimeline({ ...timeline, duration: Math.max(0.1, Math.min(86400, value)) })
    setDirty(true)
  }

  if (loading) return <div className="vas-card p-6"><Progress value={45} className="w-52 animate-pulse" /></div>
  if (!timeline) return null

  const duration = Math.max(timeline.duration, 1)

  return (
    <div className="space-y-4">
      <div className="vas-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h3 className="text-base font-semibold text-slate-100">Timeline Editor</h3>
            <p className="text-xs text-slate-500">Chỉnh sửa project JSON thật; thay đổi sẽ được dùng ở bước dựng phim.</p>
          </div>
          <Badge variant={dirty ? "warning" : "success"}>{dirty ? "Chưa lưu" : `Đã lưu v${timeline.version}`}</Badge>
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Tải lại</Button>
          <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}><Save className="h-4 w-4" />{saving ? "Đang lưu..." : "Lưu timeline"}</Button>
          <Button size="sm" className="bg-gradient-to-r from-amber-500 to-amber-300 text-black" onClick={onRender}><Play className="h-4 w-4" />Dựng phim</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="vas-card overflow-hidden p-3">
          <div className="mb-3 flex items-center gap-3 text-xs text-slate-400">
            <Label className="text-xs">Thời lượng (giây)</Label>
            <Input className="h-8 w-24" type="number" min={0.1} step={0.1} value={timeline.duration} onChange={(e) => updateDuration(Number(e.target.value))} />
            <Label className="ml-auto text-xs">Zoom</Label>
            <Button size="sm" variant="outline" onClick={() => setZoom((value) => Math.max(20, value - 8))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="w-12 text-center">{zoom}px/s</span>
            <Button size="sm" variant="outline" onClick={() => setZoom((value) => Math.min(120, value + 8))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/[0.08] bg-[#0a0f12]">
            <div className="min-w-[760px]" style={{ width: `${Math.max(760, duration * zoom + 110)}px` }}>
              <div className="ml-28 h-7 border-b border-white/[0.08] text-[10px] text-slate-600">
                {Array.from({ length: Math.ceil(duration) + 1 }, (_, second) => (
                  <span key={second} className="inline-block border-l border-white/[0.08] pl-1" style={{ width: `${zoom}px` }}>{second}s</span>
                ))}
              </div>
              {TIMELINE_TRACKS.map((track) => {
                const clips = timeline.clips.filter((clip) => clip.track === track.id)
                return (
                  <div key={track.id} className="flex min-h-[58px] border-b border-white/[0.06]">
                    <div className="flex w-28 shrink-0 items-center border-r border-white/[0.08] px-2 text-[11px] text-slate-400">{track.label}</div>
                    <div className="relative flex-1">
                      {clips.map((clip, index) => {
                        const width = Math.max(28, (clip.clip_end - clip.clip_start) * zoom)
                        const left = clip.clip_start * zoom
                        const isSelected = clip.id === selectedId
                        return (
                          <button key={clip.id ?? `${track.id}-${index}`} type="button" onClick={() => setSelectedId(clip.id ?? null)} className={cn("absolute top-2 h-10 overflow-hidden rounded border px-2 text-left text-[10px] text-white transition", track.color, isSelected ? "border-white ring-2 ring-amber-300/70" : "border-white/10 hover:border-white/40")} style={{ left, width }}>
                            <span className="block truncate">{clip.source_path ? clip.source_path.split(/[\\/]/).pop() : `${track.label} clip`}</span>
                            <span className="text-[9px] text-white/70">{(clip.clip_end - clip.clip_start).toFixed(1)}s</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="vas-card space-y-4 p-4">
          <div className="flex items-center justify-between"><h4 className="font-semibold">Clip đang chọn</h4><Badge variant="secondary">{selected?.track ?? "—"}</Badge></div>
          {selected ? (
            <>
              {selected.source_path && (selected.track === "visual" || selected.track === "overlay") && (
                /\.(png|jpe?g|webp)$/i.test(selected.source_path)
                  ? <img src={mediaUrl(selected.source_path)} className="max-h-40 w-full rounded border border-white/10 bg-black object-contain" />
                  : <video src={mediaUrl(selected.source_path)} controls className="max-h-40 w-full rounded border border-white/10 bg-black" />
              )}
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Bắt đầu</Label><Input type="number" step={0.1} value={selected.clip_start} disabled={selected.locked} onChange={(e) => { const start = Math.max(0, Number(e.target.value)); patchClip(selected.id, { clip_start: start, clip_end: Math.max(start + 0.1, selected.clip_end) }) }} /></div>
                <div><Label className="text-xs">Kết thúc</Label><Input type="number" step={0.1} value={selected.clip_end} disabled={selected.locked} onChange={(e) => { const end = Math.max(selected.clip_start + 0.1, Number(e.target.value)); patchClip(selected.id, { clip_end: end, out_point: Math.max(selected.in_point, selected.out_point + (end - selected.clip_end)) }) }} /></div>
                <div><Label className="text-xs">In point</Label><Input type="number" step={0.1} value={selected.in_point} disabled={selected.locked} onChange={(e) => patchClip(selected.id, { in_point: Math.max(0, Number(e.target.value)) })} /></div>
                <div><Label className="text-xs">Out point</Label><Input type="number" step={0.1} value={selected.out_point} disabled={selected.locked} onChange={(e) => patchClip(selected.id, { out_point: Math.max(selected.in_point, Number(e.target.value)) })} /></div>
              </div>
              <div><Label className="text-xs">Âm lượng: {(selected.volume * 100).toFixed(0)}%</Label><Slider value={[selected.volume]} min={0} max={2} step={0.05} disabled={selected.locked} onValueChange={(value) => patchClip(selected.id, { volume: value[0] })} /></div>
              {selected.track === "visual" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Chuyển động hình ảnh</Label>
                  <Select
                    value={selected.transform?.effect || "zoom_in"}
                    disabled={selected.locked}
                    onValueChange={(effect) => patchClip(selected.id, {
                      transform: { ...(selected.transform || {}), effect },
                    })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zoom_in">Zoom vào nhẹ</SelectItem>
                      <SelectItem value="zoom_out">Zoom ra nhẹ</SelectItem>
                      <SelectItem value="pan_left">Trượt máy sang trái</SelectItem>
                      <SelectItem value="pan_right">Trượt máy sang phải</SelectItem>
                      <SelectItem value="none">Giữ khung hình</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    Ảnh dùng chuyển động Ken Burns; video giữ chuyển động gốc. Kiểu nối sang cảnh kế tiếp được chọn tự động cho phù hợp.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" disabled={selected.locked} onClick={() => shiftSelected(-0.25)}><ChevronLeft className="h-4 w-4" />Lùi 0.25s</Button>
                <Button size="sm" variant="outline" disabled={selected.locked} onClick={() => shiftSelected(0.25)}>Tiến 0.25s<ChevronRight className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" disabled={selected.locked} onClick={splitSelected}><SplitSquareHorizontal className="h-4 w-4" />Tách đôi</Button>
                <Button size="sm" variant="outline" onClick={duplicateSelected}><Copy className="h-4 w-4" />Nhân bản</Button>
                <Button size="sm" variant="destructive" className="col-span-2" disabled={selected.locked} onClick={removeSelected}><Trash2 className="h-4 w-4" />Xóa clip khỏi timeline</Button>
              </div>
            </>
          ) : <p className="text-sm text-slate-500">Chọn một clip trong timeline để chỉnh sửa.</p>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Xuất bản / Render cuối
// ---------------------------------------------------------------------------
function RenderPanel({ project }: { project: Project }) {
  const { job, subtitleConfig, setSubtitleConfig } = useEditorStore()
  const [outputPreset, setOutputPreset] = useState<string>(project.aspect_ratio === "9:16" ? "shorts" : "youtube")
  const [profileId, setProfileId] = useState<string>("fastest")
  const [hardwareInfo, setHardwareInfo] = useState<{
    available: boolean
    engine: string
    encoder: string
    encoder_name: string
    is_hardware: boolean
    speed_multiplier: number
    details: string
  } | null>(null)
  const [crf, setCrf] = useState(22)
  const [fps, setFps] = useState(30)
  const [preset, setPreset] = useState("ultrafast")
  const [codec, setCodec] = useState("libx264")
  const [audioBitrate, setAudioBitrate] = useState("192k")
  const [enableSubs, setEnableSubs] = useState(true)
  const [subtitleStyle, setSubtitleStyle] = useState("highlight")
  const [subtitleFormat, setSubtitleFormat] = useState("embed")
  const [voiceVol, setVoiceVol] = useState(1)
  const [musicVol, setMusicVol] = useState(0.25)
  const [ducking, setDucking] = useState(true)
  const [normalize, setNormalize] = useState(true)
  const [transitionDuration, setTransitionDuration] = useState(0.35)
  const [rendering, setRendering] = useState(false)
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof api.renderPreflight>> | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [verifyResult, setVerifyResult] = useState<Awaited<ReturnType<typeof api.renderVerifyOutput>> | null>(null)

  const canRender = !job || job.status === "completed" || job.status === "failed" || job.status === "cancelled"
  const inProgress = ["generating_voice", "voice_ready", "preparing_media", "media_ready", "generating_subtitles", "rendering"].includes(job?.status || "")
  const selectedPreset = OUTPUT_PRESETS.find((item) => item.id === outputPreset) || OUTPUT_PRESETS[0]
  const selectedProfile = RENDER_PROFILES.find((item) => item.id === profileId) || RENDER_PROFILES[0]
  const invalidatePreflight = () => setPreflight(null)

  useEffect(() => {
    api.getRenderHardware().then(setHardwareInfo).catch(() => {})
  }, [])

  useEffect(() => {
    if (job?.status !== "completed" || !job.id) {
      setVerifyResult(null)
      return
    }
    api.renderVerifyOutput(job.id).then(setVerifyResult).catch((error) => {
      setVerifyResult({ ok: false, checks: [], duration: 0, resolution: "", fps: 0, file_size_mb: 0, message: String(error) })
    })
  }, [job?.id, job?.status])

  useEffect(() => {
    api.settingsGet().then((settings) => {
      const values = settings as unknown as Record<string, unknown>
      if (typeof values.output_preset === "string") setOutputPreset(values.output_preset)
      if (typeof values.voice_volume === "number") setVoiceVol(values.voice_volume)
      if (typeof values.music_volume === "number") setMusicVol(values.music_volume)
      if (typeof values.enable_ducking === "boolean") setDucking(values.enable_ducking)
      if (typeof values.normalize_audio === "boolean") setNormalize(values.normalize_audio)
      if (typeof values.subtitle_style === "string") setSubtitleStyle(values.subtitle_style)
      if (typeof values.subtitle_output_format === "string") setSubtitleFormat(values.subtitle_output_format)
    }).catch(() => undefined)
  }, [project.id])

  const applyProfile = (id: string) => {
    setProfileId(id)
    const values: Record<string, { crf: number; preset: string }> = {
      fastest: { crf: 22, preset: "ultrafast" },
      balanced: { crf: 20, preset: "fast" },
      high: { crf: 18, preset: "medium" },
    }
    const next = values[id]
    if (next) {
      setCrf(next.crf)
      setPreset(next.preset)
    }
    invalidatePreflight()
  }

  const runPreflight = async () => {
    setPreflightLoading(true)
    try {
      const result = await api.renderPreflight(project.id, !enableSubs)
      setPreflight(result)
      return result
    } catch (error) {
      toast({ title: "Preflight failed", description: String(error), variant: "destructive" })
      setPreflight(null)
      return null
    } finally {
      setPreflightLoading(false)
    }
  }

  const renderConfig = () => ({
    output_preset: outputPreset,
    voice_volume: voiceVol,
    enable_ducking: ducking,
    normalize_audio: normalize,
    subtitle_style: subtitleStyle,
    subtitle_output_format: subtitleFormat,
    crf,
    fps,
    preset,
    video_encoder: codec,
    audio_bitrate: audioBitrate,
    enable_subtitles: enableSubs,
    music_volume: musicVol,
    transition_duration: transitionDuration,
    subtitle_config: subtitleConfig,
  })

  const start = async () => {
    if (inProgress || rendering) return
    const check = await runPreflight()
    if (!check?.ok) {
      toast({ title: "Render is not ready", description: "Resolve the failed preflight checks before rendering.", variant: "destructive" })
      return
    }
    setRendering(true)
    try {
      const res = await api.renderStart(project.id, renderConfig())
      if (res.ok && res.job_id) toast({ title: "Render queued", description: "Output will be verified with FFprobe before completion." })
      else toast({ title: "Cannot start render", description: res.message, variant: "destructive" })
    } catch (error) {
      toast({ title: "Render failed to start", description: String(error), variant: "destructive" })
    } finally {
      setRendering(false)
    }
  }

  const cancel = async () => {
    if (!job) return
    try {
      await api.cancelJob(job.id)
      toast({ title: "Render cancelled" })
    } catch (error) {
      toast({ title: "Cancel failed", description: String(error), variant: "destructive" })
    }
  }

  const retry = async () => {
    if (!job) return
    try {
      await api.retryJob(job.id, renderConfig())
      toast({ title: "Retry started", description: "Continuing from the failed step." })
    } catch (error) {
      toast({ title: "Retry failed", description: String(error), variant: "destructive" })
    }
  }
  return (
    <div id="render-panel" className="space-y-5">
      <div className="vas-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-bold shadow-md shadow-amber-500/20">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-100">Smart Render Engine</h3>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  {hardwareInfo?.is_hardware ? "GPU Hardware Accelerated" : "CPU Multi-Threaded"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {hardwareInfo
                  ? `Đang dùng ${hardwareInfo.encoder_name} · Tốc độ ~${hardwareInfo.speed_multiplier}x realtime · Tự động tối ưu hoá`
                  : "Tự động phát hiện phần cứng và tối ưu tốc độ xuất video"}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs border-[#24313A] bg-[#101A20] text-slate-300">
            {selectedPreset.title} · MP4 H.264
          </Badge>
        </div>

        <div className="space-y-3.5">
          {/* Main 3-Column Dropdown Toolbar */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
            {/* 1. Output Preset Dropdown */}
            <div>
              <Label className="text-xs font-semibold text-slate-300 mb-1.5 block">1. Định dạng xuất video</Label>
              <Select value={outputPreset} onValueChange={(v) => { setOutputPreset(v); invalidatePreflight() }}>
                <SelectTrigger className="w-full bg-[#101A20] border-[#24313A] text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#101A20] border-[#24313A] text-xs">
                  {OUTPUT_PRESETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <span className="font-medium text-slate-200">{item.title}</span>
                      <span className="ml-2 text-slate-500 text-[11px]">({item.detail})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Render Profile Dropdown */}
            <div>
              <Label className="text-xs font-semibold text-slate-300 mb-1.5 block">2. Tốc độ & Chế độ Render</Label>
              <Select value={profileId} onValueChange={(v) => applyProfile(v)}>
                <SelectTrigger className="w-full bg-[#101A20] border-[#24313A] text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#101A20] border-[#24313A] text-xs">
                  {RENDER_PROFILES.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <span className="font-medium text-slate-200">{item.title}</span>
                      <span className="ml-2 text-slate-500 text-[11px]">({item.detail})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 3. Subtitle Dropdown & Controls */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-semibold text-slate-300">3. Phụ đề video</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">{enableSubs ? "Bật" : "Tắt"}</span>
                  <Switch checked={enableSubs} onCheckedChange={(v) => { setEnableSubs(v); invalidatePreflight() }} className="scale-75 origin-right" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  disabled={!enableSubs}
                  value={subtitleStyle}
                  onValueChange={(v) => {
                    setSubtitleStyle(v)
                    const cfg = v === "highlight"
                      ? { font_size: 56, position: "bottom", primary_color: "#FFD700", border_width: 3, granularity: "phrase" }
                      : v === "karaoke"
                        ? { font_size: 52, position: "bottom", primary_color: "#00E5FF", border_width: 3, granularity: "phrase" }
                        : { font_size: 48, position: "bottom", primary_color: "#FFFFFF", border_width: 2, granularity: "sentence" }
                    setSubtitleConfig(cfg)
                    invalidatePreflight()
                  }}
                >
                  <SelectTrigger className="w-full bg-[#101A20] border-[#24313A] text-xs h-9 disabled:opacity-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#101A20] border-[#24313A] text-xs">
                    <SelectItem value="highlight">✨ Nổi bật (Vàng kim)</SelectItem>
                    <SelectItem value="basic">📄 Cơ bản (Trắng chuẩn)</SelectItem>
                    <SelectItem value="karaoke">🎤 Karaoke (Nhịp câu)</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  disabled={!enableSubs}
                  value={subtitleFormat}
                  onValueChange={(v) => { setSubtitleFormat(v); invalidatePreflight() }}
                >
                  <SelectTrigger className="w-[125px] shrink-0 bg-[#101A20] border-[#24313A] text-xs h-9 disabled:opacity-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#101A20] border-[#24313A] text-xs">
                    <SelectItem value="embed">Nhúng video</SelectItem>
                    <SelectItem value="srt">File .SRT</SelectItem>
                    <SelectItem value="ass">File .ASS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Compact Audio Mix Row */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs">
            <div className="flex items-center gap-6 flex-1 min-w-[280px]">
              <div className="flex-1 min-w-[120px]">
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>🎙 Giọng đọc</span>
                  <span className="font-semibold text-slate-200">{Math.round(voiceVol * 100)}%</span>
                </div>
                <Slider value={[voiceVol]} min={0} max={2} step={0.05} onValueChange={(v) => { setVoiceVol(v[0]); invalidatePreflight() }} className="h-1.5" />
              </div>

              <div className="flex-1 min-w-[120px]">
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>🎵 Nhạc nền</span>
                  <span className="font-semibold text-slate-200">{Math.round(musicVol * 100)}%</span>
                </div>
                <Slider value={[musicVol]} min={0} max={1} step={0.05} onValueChange={(v) => { setMusicVol(v[0]); invalidatePreflight() }} className="h-1.5" />
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-slate-300">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch checked={ducking} onCheckedChange={(v) => { setDucking(v); invalidatePreflight() }} className="scale-75" />
                <span>Giảm nhạc khi có giọng</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch checked={normalize} onCheckedChange={(v) => { setNormalize(v); invalidatePreflight() }} className="scale-75" />
                <span>Chuẩn hóa âm</span>
              </label>
            </div>
          </div>

          {/* Collapsible Advanced Parameters */}
          <details className="rounded-xl border border-white/5 bg-white/[0.01] px-3.5 py-2 text-xs">
            <summary className="cursor-pointer text-[12px] font-medium text-slate-400 hover:text-slate-200">
              ⚙ Nâng cao (CRF {crf} · FPS {fps} · Codec {codec} · Bitrate {audioBitrate})
            </summary>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 border-t border-white/5 pt-2.5">
              <div><Label className="text-[11px]">CRF (15-40)</Label><Input type="number" min={15} max={40} value={crf} onChange={(e) => { setCrf(Number(e.target.value)); invalidatePreflight() }} className="h-8 text-xs bg-[#101A20]" /></div>
              <div><Label className="text-[11px]">FPS</Label><Input type="number" min={15} max={60} value={fps} onChange={(e) => { setFps(Number(e.target.value)); invalidatePreflight() }} className="h-8 text-xs bg-[#101A20]" /></div>
              <div>
                <Label className="text-[11px]">Preset</Label>
                <Select value={preset} onValueChange={(v) => { setPreset(v); invalidatePreflight() }}>
                  <SelectTrigger className="h-8 text-xs bg-[#101A20]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#101A20] text-xs">{["ultrafast", "veryfast", "fast", "medium", "slow"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Codec</Label>
                <Select value={codec} onValueChange={(v) => { setCodec(v); invalidatePreflight() }}>
                  <SelectTrigger className="h-8 text-xs bg-[#101A20]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#101A20] text-xs"><SelectItem value="libx264">H.264 CPU</SelectItem><SelectItem value="h264_nvenc">H.264 NVENC</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Audio bitrate</Label>
                <Select value={audioBitrate} onValueChange={(v) => { setAudioBitrate(v); invalidatePreflight() }}>
                  <SelectTrigger className="h-8 text-xs bg-[#101A20]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#101A20] text-xs">{["128k", "192k", "256k", "320k"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div className="vas-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold",
              preflight?.ok ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
            )}>
              {preflight?.ok ? "✓" : "⚡"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-100">Kiểm tra điều kiện xuất video</h3>
                {preflight?.ok && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                    Sẵn sàng xuất
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {preflight?.ok
                  ? `Đủ điều kiện xuất: FFmpeg sẵn sàng · Ổ cứng trống ${preflight.disk_free_gb.toFixed(1)} GB (cần ~${preflight.estimated_size_gb.toFixed(2)} GB)`
                  : "Kiểm tra công cụ media, giọng đọc, phụ đề và dung lượng trước khi render."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={runPreflight} disabled={preflightLoading || inProgress} className="h-8 px-2.5 text-xs text-slate-400 hover:text-slate-200">
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", preflightLoading && "animate-spin")} />
              {preflightLoading ? "Đang quét..." : "Quét lại"}
            </Button>

            <Button
              onClick={start}
              disabled={!canRender || rendering || inProgress || !preflight?.ok}
              className="h-8 bg-gradient-to-r from-amber-500 to-amber-300 text-slate-950 font-medium px-4 hover:from-amber-400 hover:to-amber-200 text-xs shadow-md"
            >
              <Play className="h-3.5 w-3.5 mr-1 fill-current" />
              {inProgress ? "Đang xử lý..." : "Bắt đầu render"}
            </Button>

            {inProgress && (
              <Button size="sm" variant="destructive" onClick={cancel} className="h-8 text-xs">
                <Square className="h-3.5 w-3.5 mr-1" />
                Hủy
              </Button>
            )}

            {(job?.status === "failed" || job?.status === "completed") && (
              <Button size="sm" variant="outline" onClick={retry} className="h-8 text-xs">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {job.status === "failed" ? "Thử lại" : "Xuất lại"}
              </Button>
            )}
          </div>
        </div>

        {preflight && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 border-t border-white/5 pt-3">
            {preflight.checks.map((check) => (
              <div
                key={check.label}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px]",
                  check.ok ? "border-emerald-500/20 bg-emerald-500/5 text-slate-300" : "border-red-500/30 bg-red-500/10 text-red-200"
                )}
                title={check.detail}
              >
                <span className={cn("font-bold text-xs shrink-0", check.ok ? "text-emerald-400" : "text-red-400")}>
                  {check.ok ? "✓" : "×"}
                </span>
                <div className="truncate">
                  <span className="font-medium text-slate-200">{check.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {preflight?.missing_scenes && preflight.missing_scenes.length > 0 && (
          <div className="mt-2 text-[11px] text-red-300 bg-red-500/10 rounded px-2.5 py-1 border border-red-500/20">
            Cảnh cần bổ sung dữ liệu: {preflight.missing_scenes.join(", ")}
          </div>
        )}
      </div>

      {job && (
        <div className="space-y-4">
          <RenderProgressCard job={job} />
          {job.status === "completed" && (
            <div className="vas-card p-5 space-y-3">
              <video
                key={`${project.id}_${job.id}_${job.completed_at}`}
                src={job.output_path ? mediaUrl(job.output_path) : outputVideoUrl(project.id, "output")}
                controls
                preload="auto"
                className="w-full max-h-[55vh] rounded-lg border border-white/10 bg-black shadow-lg"
              />
              {verifyResult && (
                <div className={cn("rounded-lg border p-3 text-xs", verifyResult.ok ? "border-emerald-400/30 bg-emerald-400/5" : "border-red-400/30 bg-red-400/5")}>
                  <div className="font-medium">{verifyResult.ok ? "✓ Output đã verify bằng FFprobe" : "× Verify output thất bại"}</div>
                  <div className="mt-1 text-slate-400">{verifyResult.resolution || "—"} · {verifyResult.fps || 0} FPS · {verifyResult.duration.toFixed(2)} giây · {verifyResult.file_size_mb.toFixed(2)} MB</div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const result = await api.openProjectFolder(project.id)
                    const target = result.output_path || job.output_path || result.path
                    const opened = await openLocalPath(target)
                    if (!opened.ok) throw new Error(opened.message)
                  } catch (error) {
                    toast({ title: "Không mở được thư mục đầu ra", description: String(error), variant: "destructive" })
                  }
                }}>
                  <FolderOpen className="h-4 w-4" />
                  Mở thư mục đầu ra
                </Button>
                {job.output_path && (
                  <Button variant="outline" size="sm" onClick={async () => { try { const opened = await openLocalPath(job.output_path); if (!opened.ok) throw new Error(opened.message) } catch (error) { toast({ title: "Không mở được video", description: String(error), variant: "destructive" }) } }}>
                    <Play className="h-4 w-4" />
                    Mở bằng trình phát ngoài
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {!job && <div className="vas-card p-5"><div className="flex flex-col items-center gap-3 py-8"><FileVideo className="h-10 w-10 text-slate-500/40" /><div className="text-sm text-slate-500">Chưa có job render. Hoàn thành checklist để bắt đầu.</div></div></div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main editor page
// ---------------------------------------------------------------------------
export default function ProjectEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
    const { pathname, search } = useLocation()

  const isNew = pathname.endsWith("/projects/new") || id === "new"
  const projectId = isNew ? null : Number(id)
  const { project, setProject, setScenes, setJob } = useEditorStore()
  const { backendOnline } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("idea")
  const userSelectedTab = useRef(false)
  const selectTab = (tab: string) => {
    userSelectedTab.current = true
    setActiveTab(tab)
  }
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
        const resumeTab = p.status === "draft"
          ? "idea"
          : ["generating_subtitles", "rendering", "completed"].includes(p.status)
            ? "publish"
            : ["preparing_media", "media_ready"].includes(p.status)
              ? "media"
              : "script"
        const requestedStage = new URLSearchParams(search).get("stage")
        const allowedStages = new Set(["idea", "script", "storyboard", "characters", "media", "publish", "subtitles"])
        setActiveTab((current) => userSelectedTab.current ? current : (requestedStage && allowedStages.has(requestedStage) ? requestedStage : resumeTab))
      })

      .catch((e) => toast({ title: "Không mở được dự án", description: String(e), variant: "destructive" }))
      .finally(() => setLoading(false))
    api.listChannels().then(setChannels).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isNew])

    useEffect(() => {
    if (job) setJob(job)
    if (job && !userSelectedTab.current && ["generating_subtitles", "rendering", "completed"].includes(job.status)) {
      setActiveTab("publish")
    }
  }, [job, setJob])

  useEffect(() => {
    if (!projectId || isNew) return
    let stopped = false
    const pollFactoryTab = async () => {
      try {
        const connection = await api.flowConnection()
        if (stopped || connection.factory_project_id !== projectId) return
        if (userSelectedTab.current) return
        if (["completed"].includes(connection.factory_state || "")) {
          setActiveTab("publish")
        } else if (["processing", "generate_image", "generate_video", "ready", "waiting_login"].includes(connection.factory_state || "")) {
          setActiveTab("media")
        }
      } catch {
        // Backend may be starting; normal project polling will retry next interval.
      }
    }
    void pollFactoryTab()
    const timer = window.setInterval(() => void pollFactoryTab(), 3000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [projectId, isNew])

  const openChannelConfig = () => {
    if (!projectId) return
    setConfigDialogOpen(true)
  }

  const changeProjectFolder = async () => {
    if (!projectId) return
    const selected = await selectDirectory()
    if (!selected) return
    try {
      const updated = await api.updateProject(projectId, { project_directory: selected })
      setProject(updated)
      toast({ title: "Đã đổi thư mục dự án", description: updated.project_directory })
    } catch (e) {
      toast({ title: "Không đổi được thư mục dự án", description: String(e), variant: "destructive" })
    }
  }

  const approveAndContinue = async () => {
    if (!projectId || !project) return
    const approval = await api.approveScript(projectId)
    setActiveTab("storyboard")

    const existingScenes = await api.listScenes(projectId)
    if (approval.needs_scene_analysis || existingScenes.length === 0 || existingScenes.some((scene) => !scene.visual_prompt)) {
      let analysis: { scenes: any[] } = { scenes: [] }
      try {
        analysis = await api.semanticAnalyze(projectId, {
          existing_narrations: existingScenes.map((scene) => scene.narration).filter(Boolean),
        })
      } catch (err) {
        console.warn("Semantic analysis failed, fallback to direct buildScenes:", err)
      }
      if (analysis.scenes && analysis.scenes.length > 0) {
        await api.buildScenes(projectId, { semantic_analysis: analysis.scenes })
      } else {
        await api.buildScenes(projectId)
      }
      const refreshedProject = await api.getProject(projectId)
      setProject(refreshedProject)
    }

    // Chờ semantic scene preparation hoàn tất trước khi TTS/Factory nhận task.
    const deadline = Date.now() + 120_000
    let scenesReady = false
    while (Date.now() < deadline) {
      const [state, scenes] = await Promise.all([
        api.pipelineStatus(projectId).catch(() => null),
        api.listScenes(projectId),
      ])
      if (scenes.length > 0 && scenes.every((scene) => Boolean(scene.visual_prompt))) {
        scenesReady = true
        break
      }
      // A previous connector run may have failed at media generation while the
      // script/storyboard is still completely valid for a fresh Factory run.
      if (state?.status === "failed" && state.error_step !== "Ảnh/Video") {
        throw new Error(state.last_log || "Pipeline chuẩn bị thất bại")
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (!scenesReady) throw new Error("Quá thời gian chờ phân cảnh có visual prompt")

    setActiveTab("characters")
    await new Promise((resolve) => setTimeout(resolve, 350))
    setActiveTab("media")
    const prepared = await api.pipelineStartAuto(projectId)
    if (!prepared.ok) throw new Error("Không thể khởi động bước TTS và chuẩn bị media")

    const mediaDeadline = Date.now() + 120_000
    let voiceReady = false
    while (Date.now() < mediaDeadline) {
      const scenes = await api.listScenes(projectId)
      const state = await api.pipelineStatus(projectId).catch(() => null)
      if (scenes.length > 0 && scenes.every((scene) => Boolean(scene.audio_path))) {
        voiceReady = true
        break
      }
      if (state?.status === "failed" && state.error_step !== "Ảnh/Video") {
        throw new Error(state.last_log || "Pipeline TTS thất bại")
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (!voiceReady) throw new Error("Quá thời gian chờ TTS tạo giọng thật cho các cảnh")

    const factory = await api.factoryStart(projectId, {
      media_type: "image",
      aspect: project.aspect_ratio || "16:9",
      include_video: true,
      factory_mode: true,
    })
    const browser = await startFlowBrowser(projectId, factory.factory_session_id)
    if (!browser.ok) {
      throw new Error(browser.message || "Không khởi động được Chrome Flow")
    }
    setActiveTab("media")
    toast({
      title: factory.requires_login ? "Đã duyệt & đang mở Google Flow" : "Đã duyệt và khởi động Factory",
      description: factory.requires_login
        ? "Chrome profile riêng đã mở. Flow Connector sẽ tự động vào editor và tạo media cho toàn bộ phân cảnh."
        : "Phân cảnh, giọng, media và hàng đợi dựng phim đã được khởi động tự động.",
    })
  }

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
      {/* Sticky Header & 7-Stage Workflow Navigation Bar: Luôn cố định khi cuộn */}
      <div className="sticky top-0 z-30 bg-[#0B0F12]/95 backdrop-blur-md border-b border-white/5 shadow-md">
        <ProjectHeader
          title={project.name}
          status={<StatusBadge status={project.status}>{STATUS_LABELS[project.status] || project.status}</StatusBadge>}
          subtitle={<><span>{project.aspect_ratio}</span><span>·</span><span>{project.target_duration}s mục tiêu</span><span>·</span><span>{project.channel_id ? channels.find((c) => c.id === project.channel_id)?.name ?? `Kênh #${project.channel_id}` : "Không kênh"}</span></>}
          actions={<><Link to="/projects"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4" />Dự án</Button></Link><Button variant="outline" size="sm" onClick={openChannelConfig}><Settings className="h-4 w-4" />Cấu hình kênh</Button><Button size="sm" onClick={async () => {
            try {
              const result = await api.openProjectFolder(project.id)
              const opened = await openLocalPath(result.path)
              if (!opened.ok) throw new Error(opened.message)
            } catch (e) {
              toast({ title: "Không mở được thư mục dự án", description: String(e), variant: "destructive" })
            }
          }}><FolderOpen className="h-4 w-4" />Thư mục dự án</Button><Button variant="outline" size="sm" onClick={changeProjectFolder}><FolderOpen className="h-4 w-4" />Đổi thư mục</Button></>}
        />
        <Progress value={project.progress} className="h-1 rounded-none bg-[#111B21]" />
        <StageNavigation value={activeTab} onValueChange={selectTab} />
      </div>

      <Tabs value={activeTab} onValueChange={selectTab}>
        <div className="p-5">
        <TabsContent value="idea" className="mt-4">
          <ScriptCreator project={project} onDone={() => setActiveTab("script")} />
        </TabsContent>

        <TabsContent value="script" className="mt-4">
          <ScriptEditor
            project={project}
            onApproveAndContinue={approveAndContinue}
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

        <TabsContent value="publish" className="mt-4">
          <VideoEditor project={project} onExport={() => setActiveTab("subtitles")} />
        </TabsContent>

        <TabsContent value="subtitles" className="mt-4">
          <RenderPanel project={project} />
        </TabsContent>

        </div>
      </Tabs>

      <ChannelConfigDialog
        projectId={project.id}
        channelId={project.channel_id}
        channelName={project.channel_id ? channels.find((c) => c.id === project.channel_id)?.name ?? `Kênh #${project.channel_id}` : `${project.name} · cấu hình riêng`}
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSaved={() => {
          void api.getProject(project.id).then(setProject).catch(() => undefined)
        }}
      />

    </div>
  )
}
