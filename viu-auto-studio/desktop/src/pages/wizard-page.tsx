import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  ArrowLeft, ArrowRight, Check, Info, Layers, Mic2, Palette, Bot as Robot, Save, Sparkles, Wand2,
} from "lucide-react"
import { api, selectDirectory } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/design-system"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"

/**
 * Wizard tạo dự án 4 bước (theo ảnh tham chiếu 02_Tao_Du_An):
 * Bước 1 Thông tin / 2 Cấu hình kênh / 3 Giọng & Hình / 4 Tự động hóa
 * Mọi nút có chức năng thật: Lưu nháp (draft), Hủy, Tiếp tục, Hoàn thành tạo dự án & mở Studio.
 */

type WizardConfig = {
  name: string
  topic: string
  projectType: "ai_studio" | "recap"
  videoType: "long" | "short"
  aspectRatio: "16:9" | "9:16"
  language: string
  targetDuration: number
  // Bước 2 Kênh
  imageSource: "ai" | "library" | "mixed"
  videoKind: "documentary" | "storytelling" | "recap" | "listicle"
  niche: string
  seriesStyle: string
  channelDescription: string
  contentDirection: string
  writingStyle: string
  hookStyle: string
  audience: string
  // Bước 3 Giọng & Hình
  ttsProvider: "edge"
  ttsVoice: "vi-VN-HoaiMyNeural"
  ttsSpeed: number
  ttsPitch: number
  consistency: boolean
  identityLock: number
  flowEnabled: boolean
  localLibrary: boolean
  mixedSource: boolean
  mixMode: "image" | "video" | "both"
  sceneDuration: string
  imageModel: string
  videoModel: string
  outputsPerScene: number
  // Bước 4 Tự động hóa
  fullyAutomatic: boolean
  reviewIdea: boolean
  reviewScript: boolean
  reviewScene: boolean
  reviewCharacter: boolean
  reviewMedia: boolean
  reviewPublish: boolean
  retryOnError: boolean
  exponentialBackoff: boolean
  idempotent: boolean
  stopOnFatal: boolean
  autoResumeQueue: boolean
  concurrentMedia: number
  singleRender: boolean
  flowAutoOpen: boolean
  flowAutoPrompt: boolean
  flowAutoModel: boolean
  flowAutoProject: boolean
  flowAutoTrack: boolean
  flowAutoDownload: boolean
  flowAttachRefs: boolean
  flowSendFastAPI: boolean
  flowFfprobe: boolean
  outSubtitles: boolean
  outMusic: boolean
  outLogo: boolean
  outDraftRender: boolean
  outFinalRender: boolean
}

const DEFAULT_CONFIG: WizardConfig = {
  name: "",
  topic: "",
  projectType: "ai_studio",
  videoType: "long",
  aspectRatio: "16:9",
  language: "vi",
  targetDuration: 120,
  imageSource: "ai",
  videoKind: "documentary",
  niche: "",
  seriesStyle: "",
  channelDescription: "",
  contentDirection: "",
  writingStyle: "",
  hookStyle: "",
  audience: "",
  ttsProvider: "edge",
  ttsVoice: "vi-VN-HoaiMyNeural",
  ttsSpeed: 1.0,
  ttsPitch: 0,
  consistency: true,
  identityLock: 80,
  flowEnabled: true,
  localLibrary: false,
  mixedSource: false,
  mixMode: "both",
  sceneDuration: "5–8 giây",
  imageModel: "Nano Banana 2",
  videoModel: "Veo 3.1",
  outputsPerScene: 1,
  fullyAutomatic: false,
  reviewIdea: true,
  reviewScript: true,
  reviewScene: true,
  reviewCharacter: true,
  reviewMedia: false,
  reviewPublish: true,
  retryOnError: true,
  exponentialBackoff: true,
  idempotent: true,
  stopOnFatal: true,
  autoResumeQueue: true,
  concurrentMedia: 2,
  singleRender: true,
  flowAutoOpen: true,
  flowAutoPrompt: true,
  flowAutoModel: true,
  flowAutoProject: true,
  flowAutoTrack: true,
  flowAutoDownload: true,
  flowAttachRefs: true,
  flowSendFastAPI: true,
  flowFfprobe: true,
  outSubtitles: true,
  outMusic: true,
  outLogo: true,
  outDraftRender: true,
  outFinalRender: true,
}

const STEPS = [
  { label: "Thông tin", icon: Layers },
  { label: "Cấu hình kênh", icon: Palette },
  { label: "Giọng & Hình", icon: Mic2 },
  { label: "Tự động hóa", icon: Robot },
]

function SectionTitle({ title }: { title: string }) {
  return <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-amber-300">{title}</h3>
}

function ConfigRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 text-xs last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className={`text-right font-medium ${ok ? "text-emerald-400" : "text-slate-200"}`}>{value}</span>
    </div>
  )
}

export default function WizardPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [cfg, setCfg] = useState<WizardConfig>({ ...DEFAULT_CONFIG })
  const [creating, setCreating] = useState(false)
  const [channelId, setChannelId] = useState<number | null>(null)
  const [channels, setChannels] = useState<Array<{ id: number; name: string }>>([])
  const [outputFolder, setOutputFolder] = useState("")

  useEffect(() => {
    api.listChannels().then((items) => {
      setChannels(items)
      if (items.length === 1) setChannelId(items[0].id)
    }).catch(() => undefined)
  }, [])

  const set = <K extends keyof WizardConfig>(k: K, v: WizardConfig[K]) => setCfg((c) => ({ ...c, [k]: v }))

  const configForSave = useMemo(() => ({
    channel: {
      image_source: cfg.imageSource,
      video_kind: cfg.videoKind,
      niche: cfg.niche,
      series_style: cfg.seriesStyle,
      description: cfg.channelDescription,
      content_direction: cfg.contentDirection,
      writing_style: cfg.writingStyle,
      hook_style: cfg.hookStyle,
      audience: cfg.audience,
    },
    voice: {
      provider: cfg.ttsProvider,
      voice: cfg.ttsVoice,
      speed: cfg.ttsSpeed,
      pitch: cfg.ttsPitch,
    },
    media: {
      flow_enabled: cfg.flowEnabled,
      local_library: cfg.localLibrary,
      mixed_source: cfg.mixedSource,
      mix_mode: cfg.mixMode,
      scene_duration: cfg.sceneDuration,
      image_model: cfg.imageModel,
      video_model: cfg.videoModel,
      outputs_per_scene: cfg.outputsPerScene,
      consistency: cfg.consistency,
      identity_lock: cfg.identityLock,
    },
    automation: {
      mode: cfg.fullyAutomatic ? "full_auto" : "step_review",
      review_checkpoints: {
        idea: cfg.reviewIdea,
        script: cfg.reviewScript,
        scene: cfg.reviewScene,
        character: cfg.reviewCharacter,
        media: cfg.reviewMedia,
        publish: cfg.reviewPublish,
      },
      retry_on_error: cfg.retryOnError,
      exponential_backoff: cfg.exponentialBackoff,
      idempotent: cfg.idempotent,
      stop_on_fatal: cfg.stopOnFatal,
      auto_resume_queue: cfg.autoResumeQueue,
      concurrent_media: cfg.concurrentMedia,
      single_render_mutex: cfg.singleRender,
      flow_automation: {
        auto_open: cfg.flowAutoOpen,
        auto_prompt: cfg.flowAutoPrompt,
        auto_model: cfg.flowAutoModel,
        auto_project: cfg.flowAutoProject,
        auto_track: cfg.flowAutoTrack,
        auto_download: cfg.flowAutoDownload,
        attach_refs: cfg.flowAttachRefs,
        send_fastapi: cfg.flowSendFastAPI,
        ffprobe_verify: cfg.flowFfprobe,
      },
      output: {
        subtitles: cfg.outSubtitles,
        music: cfg.outMusic,
        logo: cfg.outLogo,
        draft_render: cfg.outDraftRender,
        final_render: cfg.outFinalRender,
      },
    },
  }), [cfg])

  const validName = cfg.name.trim().length > 0 && cfg.name.trim().length <= 100

  const createDraft = async (openStudio = false) => {
    setCreating(true)
    try {
      const res = await api.createProject({
        name: cfg.name.trim(),
                channel_id: channelId,

        topic: cfg.topic || cfg.name.trim(),
        video_type: cfg.videoType,
        aspect_ratio: cfg.aspectRatio,
        language: cfg.language,
        target_duration: cfg.targetDuration,
        project_type: cfg.projectType,
        output_folder: outputFolder.trim() || undefined,
      })
      const projectId: number = res.id
      await api.updateProjectConfig(projectId, configForSave as Record<string, unknown>)
      toast({ title: openStudio ? "Đã tạo dự án" : "Đã lưu nháp", description: cfg.name.trim() })
      if (openStudio) {
        navigate(`/projects/${projectId}`, { replace: true })
      } else {
        navigate("/projects", { replace: true })
      }
    } catch (e) {
      toast({ title: "Không tạo được dự án", description: String(e), variant: "destructive" })
      setCreating(false)
    }
  }

  const canFinish = validName && (step === 3 || step === 0)
  void canFinish

  const inputCls = "border-white/10 bg-white/[0.03] text-sm text-slate-200 placeholder:text-slate-600"
  const selectCls = "h-9 rounded-md border border-white/10 bg-white/[0.03] px-2 text-sm text-slate-200 outline-none focus:border-amber-500/50"

  return (
    <div className="min-h-full space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/projects" className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {step === 0 ? "Tạo dự án mới" : `Tạo dự án mới · ${STEPS[step].label}`}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">Bước {step + 1}/{STEPS.length} — {STEPS[step].label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-white/10 text-slate-300" onClick={() => navigate("/projects")}>
            Hủy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-white/10 text-slate-300"
            disabled={creating}
            onClick={() => createDraft(false)}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" /> Lưu nháp
          </Button>
        </div>
      </div>

      {/* Stepper */}
      <div className="vas-card flex items-center gap-2 p-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="flex flex-1 items-center gap-2">
              <Button variant="ghost"
                onClick={() => i <= step && setStep(i)}
                className={`flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  i === step
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : i < step
                      ? "text-emerald-400/80 hover:bg-white/5"
                      : "text-slate-600 cursor-default"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                  i < step ? "border-emerald-400/40 bg-emerald-400/10" : i === step ? "border-amber-400 bg-amber-500/20" : "border-slate-700"
                }`}>
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {s.label}
                <Icon className="ml-auto h-3.5 w-3.5 opacity-60" />
              </Button>
              {i < STEPS.length - 1 && <div className="mx-1 h-px flex-1 bg-white/5" />}
            </div>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main form */}
        <Card className="vas-card">
          <CardContent className="space-y-5 p-6">
            {step === 0 && (
              <>
                <SectionTitle title="Thông tin dự án" />
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Tên dự án <span className="text-slate-600">({cfg.name.length}/100)</span></label>
                    <Input value={cfg.name} maxLength={100} onChange={(e) => set("name", e.target.value)}
                      placeholder="VD: Smart Living — 60 giây ứng dụng" className={inputCls} autoFocus />
                  </div>
                                  <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Kênh sản xuất</label>
                  <select value={channelId ? String(channelId) : "none"} onChange={(e) => setChannelId(e.target.value === "none" ? null : Number(e.target.value))} className={selectCls}>
                    <option value="none">Không gắn kênh</option>
                    {channels.map((channel) => <option key={channel.id} value={String(channel.id)}>{channel.name}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-500">Kênh quyết định phong cách, giọng mặc định và cấu hình media cho project.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Thư mục dự án</label>
                  <div className="flex gap-2">
                    <Input value={outputFolder} onChange={(e) => setOutputFolder(e.target.value)} placeholder="Để trống để dùng thư mục mặc định" className={`${inputCls} flex-1`} />
                    <Button type="button" variant="outline" onClick={async () => { const selected = await selectDirectory(); if (selected) setOutputFolder(selected) }}>Chọn thư mục</Button>
                  </div>
                  <p className="text-[11px] text-slate-500">Media, audio, subtitle và output.mp4 sẽ được lưu trong thư mục này.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Loại dự án</label>

                    <div className="grid grid-cols-2 gap-3">
                      {(["ai_studio", "recap"] as const).map((t) => (
                        <Button variant="ghost"
                          key={t}
                          onClick={() => set("projectType", t)}
                          className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all ${
                            cfg.projectType === t
                              ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                              : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="font-semibold">{t === "ai_studio" ? "AI Studio" : "Recap"}</div>
                          <div className="text-[11px] font-normal opacity-70">
                            {t === "ai_studio" ? "Video AI hoàn toàn từ kịch bản" : "Video tóm tắt từ nguồn có sẵn"}
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Định dạng đầu ra</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(["long", "short"] as const).map((v) => (
                        <Button variant="ghost"
                          key={v}
                          onClick={() => { set("videoType", v); set("aspectRatio", v === "long" ? "16:9" : "9:16") }}
                          className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all ${
                            cfg.videoType === v
                              ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                              : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                          }`}
                        >
                          {v === "long" ? "16:9 Video dài" : "9:16 Shorts"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">Thời lượng mục tiêu (giây)</label>
                      <Input type="number" min={5} max={3600} value={cfg.targetDuration}
                        onChange={(e) => set("targetDuration", Math.max(5, Number(e.target.value) || 0))} className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">Ngôn ngữ mặc định</label>
                      <select value={cfg.language} onChange={(e) => set("language", e.target.value)} className={selectCls}>
                        <option value="vi">Tiếng Việt</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <SectionTitle title="Cấu hình kênh" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Nguồn hình</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ["ai", "AI tạo mới"],
                        ["library", "Kho media"],
                        ["mixed", "Kết hợp"],
                      ] as const).map(([v, label]) => (
                        <Button variant="ghost" key={v} onClick={() => set("imageSource", v)}
                          className={`rounded-md border px-2 py-2 text-xs font-medium transition-all ${
                            cfg.imageSource === v
                              ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                              : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                          }`}>{label}</Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Kiểu video</label>
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        ["documentary", "Documentary"],
                        ["storytelling", "Kể chuyện"],
                        ["recap", "Recap"],
                        ["listicle", "Listicle"],
                      ] as const).map(([v, label]) => (
                        <Button variant="ghost" key={v} onClick={() => set("videoKind", v)}
                          className={`rounded-md border px-1 py-2 text-[11px] font-medium transition-all ${
                            cfg.videoKind === v
                              ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                              : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                          }`}>{label}</Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Ngách nội dung</label>
                    <Input value={cfg.niche} onChange={(e) => set("niche", e.target.value)} placeholder="VD: Công nghệ & AI" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Chuỗi tập</label>
                    <Input value={cfg.seriesStyle} onChange={(e) => set("seriesStyle", e.target.value)} placeholder="VD: Chuỗi tập có chủ đề" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Phong cách viết</label>
                    <Input value={cfg.writingStyle} onChange={(e) => set("writingStyle", e.target.value)} placeholder="VD: Gần gũi, ngắn gọn" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Kiểu Hook</label>
                    <Input value={cfg.hookStyle} onChange={(e) => set("hookStyle", e.target.value)} placeholder="VD: Đặt câu hỏi, gây tò mò" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Đối tượng mục tiêu</label>
                    <Input value={cfg.audience} onChange={(e) => set("audience", e.target.value)} placeholder="VD: 18–35 tuổi, yêu công nghệ" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Định hướng nội dung</label>
                    <Input value={cfg.contentDirection} onChange={(e) => set("contentDirection", e.target.value)} placeholder="VD: Giáo dục & Phân tích" className={inputCls} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Mô tả kênh <span className="text-slate-600">({cfg.channelDescription.length}/500)</span></label>
                    <Textarea value={cfg.channelDescription} maxLength={500} rows={3}
                      onChange={(e) => set("channelDescription", e.target.value)} placeholder="Mô tả định hướng kênh..." className={inputCls} />
                  </div>
                </div>
                <p className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Info className="h-3.5 w-3.5" /> Cấu hình kênh được lưu nháp cùng dự án, có thể chỉnh sửa sau trong Studio.
                </p>
              </>
            )}

            {step === 2 && (
              <>
                <SectionTitle title="Giọng đọc" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Nhà cung cấp TTS</label>
                    <select value={cfg.ttsProvider} disabled className={`${selectCls} opacity-70`}>
                      <option value="edge">Edge TTS (cục bộ, không cần API key)</option>
                    </select>
                    <p className="text-[11px] text-slate-600">Giọng đọc thật được tạo bằng Edge TTS trong pipeline.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Giọng đọc</label>
                    <select value={cfg.ttsVoice} onChange={(e) => set("ttsVoice", e.target.value as WizardConfig["ttsVoice"])} className={selectCls}>
                      <option value="vi-VN-HoaiMyNeural">Hoài My (Nữ, miền Bắc)</option>
                      <option value="vi-VN-NamMinhNeural">Nam Minh (Nam, miền Bắc)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Tốc độ ({cfg.ttsSpeed.toFixed(1)}x)</label>
                    <input type="range" min={0.5} max={2} step={0.1} value={cfg.ttsSpeed}
                      onChange={(e) => set("ttsSpeed", Number(e.target.value))} className="w-full accent-amber-500" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Cao độ ({cfg.ttsPitch})</label>
                    <input type="range" min={-50} max={50} step={1} value={cfg.ttsPitch}
                      onChange={(e) => set("ttsPitch", Number(e.target.value))} className="w-full accent-amber-500" />
                  </div>
                </div>

                <SectionTitle title="Nguồn hình & Video" />
                <div className="grid grid-cols-3 gap-3">
                  <Button variant="ghost" onClick={() => { set("flowEnabled", true); set("localLibrary", false); set("mixedSource", false) }}
                    className={`rounded-lg border p-3 text-left text-xs font-medium transition-all ${
                      cfg.flowEnabled && !cfg.mixedSource
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                        : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                    }`}>
                    <div className="font-semibold">Google Flow Extension</div>
                    <div className="mt-0.5 text-[11px] font-normal opacity-70">UTO Flow — nguồn chính</div>
                  </Button>
                  <Button variant="ghost" onClick={() => { set("flowEnabled", false); set("localLibrary", true); set("mixedSource", false) }}
                    className={`rounded-lg border p-3 text-left text-xs font-medium transition-all ${
                      cfg.localLibrary && !cfg.mixedSource
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                        : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                    }`}>
                    <div className="font-semibold">Kho media cục bộ</div>
                    <div className="mt-0.5 text-[11px] font-normal opacity-70">Tải lên thủ công</div>
                  </Button>
                  <Button variant="ghost" onClick={() => { set("flowEnabled", true); set("localLibrary", true); set("mixedSource", true) }}
                    className={`rounded-lg border p-3 text-left text-xs font-medium transition-all ${
                      cfg.mixedSource
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                        : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                    }`}>
                    <div className="font-semibold">Chế độ hỗn hợp</div>
                    <div className="mt-0.5 text-[11px] font-normal opacity-70">Flow + kho media</div>
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Chế độ kết hợp</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ["image", "Chỉ hình ảnh"],
                        ["video", "Chỉ video"],
                        ["both", "Kết hợp"],
                      ] as const).map(([v, label]) => (
                        <Button variant="ghost" key={v} onClick={() => set("mixMode", v)}
                          className={`rounded-md border px-2 py-2 text-[11px] font-medium transition-all ${
                            cfg.mixMode === v
                              ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                              : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                          }`}>{label}</Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Thời lượng cảnh mặc định</label>
                    <Input value={cfg.sceneDuration} onChange={(e) => set("sceneDuration", e.target.value)} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Mô hình hình ảnh</label>
                    <select value={cfg.imageModel} onChange={(e) => set("imageModel", e.target.value)} className={selectCls}>
                      <option>Nano Banana 2</option>
                      <option>ImageFX Default</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Mô hình video</label>
                    <select value={cfg.videoModel} onChange={(e) => set("videoModel", e.target.value)} className={selectCls}>
                      <option>Veo 3.1</option>
                      <option>Vidu 1.6</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Số lượng đầu ra mỗi cảnh</label>
                    <Input type="number" min={1} max={4} value={cfg.outputsPerScene}
                      onChange={(e) => set("outputsPerScene", Math.max(1, Number(e.target.value) || 1))} className={inputCls} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div>
                      <div className="text-xs font-medium text-slate-300">Duy trì nhất quán nhân vật</div>
                      <div className="text-[11px] text-slate-600">Ảnh tham chiếu gắn vào task Flow</div>
                    </div>
                    <Switch checked={cfg.consistency} onCheckedChange={(v) => set("consistency", v)} />
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <SectionTitle title="Chế độ pipeline" />
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="ghost" onClick={() => set("fullyAutomatic", true)}
                    className={`rounded-lg border p-3 text-left text-xs font-medium transition-all ${
                      cfg.fullyAutomatic
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                        : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                    }`}>
                    <div className="font-semibold">Tự động hoàn toàn</div>
                    <div className="mt-0.5 text-[11px] font-normal opacity-70">Chạy liên tục đến video hoàn chỉnh</div>
                  </Button>
                  <Button variant="ghost" onClick={() => set("fullyAutomatic", false)}
                    className={`rounded-lg border p-3 text-left text-xs font-medium transition-all ${
                      !cfg.fullyAutomatic
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                        : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                    }`}>
                    <div className="font-semibold">Từng bước thủ công</div>
                    <div className="mt-0.5 text-[11px] font-normal opacity-70">Dừng tại các điểm kiểm duyệt</div>
                  </Button>
                </div>

                <SectionTitle title="Điểm kiểm duyệt" />
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["reviewIdea", "Duyệt ý tưởng"],
                    ["reviewScript", "Duyệt kịch bản"],
                    ["reviewScene", "Duyệt phân cảnh"],
                    ["reviewCharacter", "Duyệt nhân vật"],
                    ["reviewMedia", "Duyệt media"],
                    ["reviewPublish", "Duyệt trước xuất bản"],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                      <Switch checked={(cfg as unknown as Record<string, boolean>)[k]}
                        onCheckedChange={(v) => set(k as keyof WizardConfig, v as WizardConfig[keyof WizardConfig])} />
                      {label}
                    </label>
                  ))}
                </div>

                <SectionTitle title="Xử lý khi lỗi" />
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["retryOnError", "Thử lại mỗi phần cảnh lỗi tối đa 3 lần"],
                    ["exponentialBackoff", "Chờ tăng dần theo cấp số nhân"],
                    ["idempotent", "Không chạy lại các bước đã hoàn thành"],
                    ["stopOnFatal", "Dừng dự án nếu gặp lỗi nghiêm trọng"],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                      <Switch checked={(cfg as unknown as Record<string, boolean>)[k]}
                        onCheckedChange={(v) => set(k as keyof WizardConfig, v as WizardConfig[keyof WizardConfig])} />
                      {label}
                    </label>
                  ))}
                </div>

                <SectionTitle title="Hàng đợi & tài nguyên" />
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                    <Switch checked={cfg.autoResumeQueue} onCheckedChange={(v) => set("autoResumeQueue", v)} />
                    Tự động tiếp tục hàng đợi sau khi khởi động lại ứng dụng
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                    <Switch checked={cfg.singleRender} onCheckedChange={(v) => set("singleRender", v)} />
                    Chỉ 1 tác vụ render chính tại 1 thời điểm
                  </label>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Số media xử lý đồng thời</label>
                    <Input type="number" min={1} max={8} value={cfg.concurrentMedia}
                      onChange={(e) => set("concurrentMedia", Math.max(1, Number(e.target.value) || 1))} className={inputCls} />
                  </div>
                </div>

                <SectionTitle title="Tự động hóa với Flow" />
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["flowAutoOpen", "Tự động mở Flow"],
                    ["flowAutoPrompt", "Tự gửi prompt từng cảnh"],
                    ["flowAutoModel", "Tự chọn model & tỷ lệ"],
                    ["flowAutoProject", "Tự tạo/tái sử dụng project"],
                    ["flowAutoTrack", "Theo dõi đến hoàn thành"],
                    ["flowAutoDownload", "Tự tải media về"],
                    ["flowAttachRefs", "Gắn tham chiếu nhân vật"],
                    ["flowSendFastAPI", "Gửi media về FastAPI"],
                    ["flowFfprobe", "Xác minh FFprobe"],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                      <Switch checked={(cfg as unknown as Record<string, boolean>)[k]}
                        onCheckedChange={(v) => set(k as keyof WizardConfig, v as WizardConfig[keyof WizardConfig])} />
                      {label}
                    </label>
                  ))}
                </div>

                <SectionTitle title="Đầu ra tự động" />
                <div className="grid grid-cols-5 gap-2">
                  {([
                    ["outSubtitles", "Tạo phụ đề"],
                    ["outMusic", "Thêm nhạc nền"],
                    ["outLogo", "Chèn logo"],
                    ["outDraftRender", "Render bản nháp"],
                    ["outFinalRender", "Render bản cuối"],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-2 text-[11px] text-slate-300">
                      <Switch checked={(cfg as unknown as Record<string, boolean>)[k]}
                        onCheckedChange={(v) => set(k as keyof WizardConfig, v as WizardConfig[keyof WizardConfig])} />
                      {label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right preview panel */}
        <div className="space-y-4">
          <Card className="vas-card">
            <CardContent className="space-y-1 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
                <Check className="h-3.5 w-3.5" /> Bản xem trước cấu hình
              </h3>
              <ConfigRow label="Tên dự án" value={cfg.name.trim() || "—"} />
              <ConfigRow label="Tỷ lệ" value={`${cfg.aspectRatio} · ${cfg.videoType === "long" ? "Video dài" : "Shorts"}`} />
              <ConfigRow label="Kiểu video" value={cfg.videoKind} />
              <ConfigRow label="Ngách" value={cfg.niche || "—"} />
              <ConfigRow label="Giọng đọc" value={cfg.ttsVoice.replace("vi-VN-", "")} />
              <ConfigRow label="Nguồn hình" value={cfg.flowEnabled ? "Google Flow" : cfg.localLibrary ? "Kho media" : "—"} />
              <ConfigRow label="Model ảnh" value={cfg.imageModel} />
              <ConfigRow label="Pipeline" value={cfg.fullyAutomatic ? "Tự động hoàn toàn" : "Từng bước duyệt"} />
              <ConfigRow label="Điểm kiểm duyệt"
                value={`${[cfg.reviewIdea, cfg.reviewScript, cfg.reviewScene, cfg.reviewCharacter, cfg.reviewMedia, cfg.reviewPublish].filter(Boolean).length} bật`} />
              <ConfigRow label="Khử lỗi" value="Idempotent + retry + FFprobe" ok />
            </CardContent>
          </Card>

          <Card className="vas-card border-emerald-500/20">
            <CardContent className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Sparkles className="h-3.5 w-3.5" /> Sẵn sàng tạo dự án
              </h3>
              <div className="space-y-1.5 text-[11px] text-slate-400">
                <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-400" /> Gemini (text) phân tích kịch bản & chia cảnh</p>
                <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-400" /> UTO Flow sinh hình/video từng cảnh</p>
                <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-400" /> Edge TTS tạo giọng đọc thật</p>
                <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-400" /> FFmpeg ghép media + phụ đề + kiểm nghiệm FFprobe</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="vas-card flex items-center justify-between p-4">
        <Button variant="outline" size="sm" className="border-white/10 text-slate-300" disabled={step === 0 || creating}
          onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Quay lại
        </Button>
        <div className="flex items-center gap-2">
          {step < 3 ? (
            <Button size="sm" className="gap-1.5 bg-gradient-continue text-white shadow-continue hover:brightness-110"
              disabled={step === 0 && !validName} onClick={() => setStep((s) => Math.min(3, s + 1))}>
              Tiếp tục: {STEPS[Math.min(3, step + 1)].label} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" disabled={creating} className="gap-1.5 bg-gradient-continue text-white shadow-continue hover:brightness-110"
              onClick={() => createDraft(true)}>
              {creating ? <Wand2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Tạo dự án & mở Studio
            </Button>
          )}
        </div>
      </div>
      <Progress value={((step + (validName || step > 0 ? 1 : 0)) / 4) * 100} className="h-0.5 [&>div]:bg-gradient-to-r [&>div]:from-amber-600 [&>div]:to-amber-400" />
    </div>
  )
}
