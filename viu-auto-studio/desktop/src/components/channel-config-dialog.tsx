import { getCountryBadge } from "@/components/voice-studio-panel"
import { useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  DialogFooter,
} from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/design-system"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/design-system"
import { api, mediaUrl } from "@/services/api"
import type { TTSVoice } from "@/types"
import { toast } from "@/hooks/use-toast"

const STYLE_CHIPS = ["Kể chuyện tâm tình", "Sắc gọn kiểu tin tức", "Hài hước đời thường", "Tài liệu căng thẳng"]

const VOICE_STYLE_5AXES = [
  {
    title: "1. Xưng hô",
    bad: "✗ 'Thân thiện'",
    good: "✓ Xưng 'mình', gọi người xem là 'bạn'",
  },
  {
    title: "2. Nhịp câu",
    bad: "✗ 'Nhịp cuốn hút'",
    good: "✓ Câu 6–12 từ, xen câu ngắn",
  },
  {
    title: "3. Vào đề",
    bad: "✗ 'Mở bài hấp dẫn'",
    good: "✓ Mở ngay giữa câu chuyện",
  },
  {
    title: "4. Cấm gì",
    bad: "✗ 'Đừng nhàm chán'",
    good: "✓ Cấm giảng đạo, cấm số liệu khô khan",
  },
  {
    title: "5. Kết",
    bad: "✗ 'Kết ấn tượng'",
    good: "✓ Kết bằng một hình ảnh/câu ngắn",
  },
]

type Config = Record<string, unknown>

const CONFIG_KEYS = new Set(["image_source", "video_style", "niche", "series_type", "description", "direction", "script_style", "hook", "long_video_duration", "short_video_duration", "target_audience", "content_rating", "thumbnail_style", "subtitle_style", "ai_provider", "tts_provider", "voice", "character_sync", "image_generator", "image_mode", "static_image_seconds", "video_model", "review_mode", "suggested_time", "language"])

const DEFAULT_CONFIG: Config = {
  image_source: "ai",
  video_style: "",
  niche: "",
  series_type: "anthology",
  description: "",
  direction: "",
  script_style: "",
  hook: "",
  long_video_duration: "3 - 5 phút",
  short_video_duration: "90 - 120 giây",
  target_audience: "",
  content_rating: "general",
  thumbnail_style: "auto",
  subtitle_style: "default",
  ai_provider: "default",
  tts_provider: "",
  voice: "",
  character_sync: "channel",
  image_generator: "google_flow",
  image_mode: "mix",
  static_image_seconds: 5,
  video_model: "Veo 3.1 Lite",
  review_mode: "script_first",
  suggested_time: "07:00",
  language: "vi",
}

export function ChannelConfigDialog({
  channelId,
  projectId,
  channelName,
  open,
  onOpenChange,
  onSaved,
}: {
  channelId?: number | null
  projectId: number
  channelName: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved?: (config: Config) => void
}) {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [testingVoice, setTestingVoice] = useState(false)
  const [previewingVoice, setPreviewingVoice] = useState(false)
  const [voices, setVoices] = useState<TTSVoice[]>([])
  const [styles, setStyles] = useState<Array<{ key: string; name: string; desc: string; tier: string }>>([])

  useEffect(() => {
    if (!open || (!channelId && !projectId)) return
    let cancelled = false
    setLoading(true)
    const load = async () => {
      try {
        const [source, st] = await Promise.all([
          channelId ? api.channelGetConfig(channelId) : api.getProjectConfig(projectId),
          api.videoStyles(),
        ])
        if (cancelled) return
        let loaded: Config = {}
        if ("config" in source) {
          loaded = source.config
        } else if (source.config_json) {
          try {
            const projectConfig = JSON.parse(source.config_json) as Record<string, unknown>
            const nested = projectConfig.channel
            if (nested && typeof nested === "object" && !Array.isArray(nested)) {
              loaded = nested as Config
            } else {
              loaded = Object.fromEntries(Object.entries(projectConfig).filter(([key]) => CONFIG_KEYS.has(key)))
            }
          } catch {
            loaded = {}
          }
        }
        if (["omni_flash", "veo", ""].includes(String(loaded.video_model || ""))) loaded.video_model = "Veo 3.1 Lite"
        if (loaded.image_mode === "mixed") loaded.image_mode = "mix"
        if (loaded.image_mode === "images") loaded.image_mode = "image_only"
        if (loaded.image_mode === "video") loaded.image_mode = "video_only"
        setStyles(st)
        setConfig({ ...DEFAULT_CONFIG, ...loaded })
        setDirty(false)
        setSavedAt(Date.now())
      } catch (error) {
        if (!cancelled) toast({ title: "Không thể tải cấu hình kênh", description: String(error), variant: "destructive" })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [open, channelId, projectId])

  useEffect(() => {
    if (!open) return
    const provider = String(config.tts_provider || "").trim()
    api.ttsListVoices(provider || undefined).then(setVoices).catch(() => setVoices([]))
  }, [open, config.tts_provider])

  const set = (key: string, value: unknown) => {
    setConfig((c) => ({ ...c, [key]: value }))
    setDirty(true)
  }

  const close = () => {
    if (dirty && !window.confirm("Bạn có thay đổi chưa lưu. Đóng cấu hình kênh?")) return
    onOpenChange(false)
  }

  const testVoiceConnection = async () => {
    setTestingVoice(true)
    try {
      const result = await api.ttsTestConnection({ provider: String(config.tts_provider || "") || undefined })
      if (!result.ok) throw new Error(result.message || "Provider TTS chưa sẵn sàng")
      toast({ title: "TTS sẵn sàng", description: result.message || "Đã kiểm tra kết nối thành công" })
    } catch (e) {
      toast({ title: "TTS chưa sẵn sàng", description: String(e), variant: "destructive" })
    } finally {
      setTestingVoice(false)
    }
  }

  const previewVoice = async () => {
    setPreviewingVoice(true)
    try {
      const text = String(config.hook || "Đây là giọng đọc mẫu của kênh.")
      const result = await api.ttsPreview(text, {
        provider: String(config.tts_provider || "") || undefined,
        voice: String(config.voice || "") || undefined,
      })
      if (!result.ok || !result.audio_path) throw new Error(result.message || "Không tạo được audio mẫu")
      const audio = new Audio(mediaUrl(result.audio_path))
      await audio.play()
      toast({ title: "Đang phát giọng mẫu" })
    } catch (e) {
      toast({ title: "Không nghe thử được", description: String(e), variant: "destructive" })
    } finally {
      setPreviewingVoice(false)
    }
  }

  const save = async () => {
    const staticSeconds = Number(config.static_image_seconds)
    if (!Number.isFinite(staticSeconds) || staticSeconds < 1 || staticSeconds > 20) {
      toast({ title: "Thời gian ảnh tĩnh không hợp lệ", description: "Chọn giá trị từ 1 đến 20 giây.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      let nextConfig: Config = { ...config, static_image_seconds: staticSeconds }
      if (channelId) {
        const saved = await api.channelUpdateConfig(channelId, nextConfig)
        nextConfig = saved.config || nextConfig
      } else {
        const current = await api.getProjectConfig(projectId)
        let projectConfig: Record<string, unknown> = {}
        if (current.config_json) {
          try {
            const parsed = JSON.parse(current.config_json)
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) projectConfig = parsed
          } catch {
            projectConfig = {}
          }
        }
        await api.updateProjectConfig(projectId, { ...projectConfig, channel: nextConfig })
      }
      const currentProject = await api.getProject(projectId)
      const targetDuration = currentProject.video_type === "short"
        ? (String(nextConfig.short_video_duration || "").startsWith("30") ? 45 : 105)
        : String(nextConfig.long_video_duration || "").startsWith("3") ? 240
          : String(nextConfig.long_video_duration || "").startsWith("10") ? 900 : 450
      await api.updateProject(projectId, {
        language: String(nextConfig.language || "vi"),
        target_duration: targetDuration,
      })
      setConfig({ ...DEFAULT_CONFIG, ...nextConfig })
      setDirty(false)
      setSavedAt(Date.now())
      toast({ title: "Đã lưu cấu hình kênh", description: channelId ? "Cấu hình channel hiện tại đã được đồng bộ." : "Cấu hình riêng của project đã được lưu." })
      onSaved?.(nextConfig)
      onOpenChange(false)
    } catch (e) {
      toast({ title: "Không thể lưu", description: String(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[92vh] max-w-7xl overflow-y-auto rounded-2xl border border-cyan-400/20 bg-[#071017] p-0 shadow-2xl shadow-cyan-950/30">
        <DialogHeader className="sticky top-0 z-20 border-b border-white/10 bg-[#071017]/95 px-7 py-5 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-xl tracking-tight text-white">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-lg">⚙️</span>
                <span>Cấu hình kênh</span>
                {channelName && <span className="text-sm font-normal text-slate-400">— {channelName}</span>}
              </DialogTitle>
              <DialogDescription className="mt-2 text-xs text-slate-500">Bộ não AI, giọng đọc, hình ảnh và lịch sản xuất cho project hiện tại.</DialogDescription>
            </div>
            <Badge variant="outline" className={dirty ? "shrink-0 border-amber-400/40 bg-amber-400/10 text-amber-300" : "shrink-0 border-emerald-400/30 bg-emerald-400/10 text-emerald-300"}>
              {dirty ? "Đã thay đổi · Chưa lưu" : "Đã đồng bộ"}
            </Badge>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-5 bg-[#071017] px-7 py-6">
            {/* 🧠 Nội dung & Bộ não */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 shadow-lg shadow-black/10">
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold tracking-tight text-slate-100">🧠 Nội dung & Bộ não — quyết định chủ đề & chất riêng của kênh</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Nguồn hình</Label>
                  <Select value={String(config.image_source)} onValueChange={(v) => set("image_source", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai">🤖 Google Flow tự động</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Kiểu video (bộ não AI)</Label>
                  <Select value={String(config.video_style)} onValueChange={(v) => set("video_style", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue placeholder="— Chọn kiểu —" />
                    </SelectTrigger>
                    <SelectContent>
                      {styles.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          <span className="flex w-full items-center justify-between">
                            {s.name}
                            <Badge
                              variant={s.tier === "FREE" ? "secondary" : "outline"}
                              className="ml-2 text-[9px]"
                            >
                              {s.tier}
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Ngách của kênh (gõ cụ thể để khác biệt)</Label>
                  <Input
                    className="border-white/10 bg-[#0c1419] text-slate-200 placeholder:text-slate-500"
                    placeholder="Vd: Sinh tồn của thợ săn voi mùa đông vùng Siberia"
                    value={String(config.niche || "")}
                    onChange={(e) => set("niche", e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Kiểu chuỗi tập (chống trùng chủ đề)</Label>
                  <Select value={String(config.series_type)} onValueChange={(v) => set("series_type", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthology">Tuyển tập — mỗi tập một chủ đề MỚI (khuyên dùng)</SelectItem>
                      <SelectItem value="series">Chuỗi — các tập liên quan nhau</SelectItem>
                      <SelectItem value="random">Ngẫu nhiên</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!config.description && !config.direction && (
                <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  ⚠ Bạn chưa nhập Mô tả & Định hướng — ý tưởng sẽ dễ chung chung và trùng với kênh khác. Nên điền 2 ô dưới.
                </p>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Đối tượng xem mặc định</Label>
                  <Input
                    className="border-white/10 bg-[#0c1419] text-slate-200 placeholder:text-slate-500"
                    placeholder="Vd: Người mới bắt đầu, 18–35 tuổi"
                    value={String(config.target_audience || "")}
                    onChange={(e) => set("target_audience", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Phân loại nội dung</Label>
                  <Select value={String(config.content_rating || "general")} onValueChange={(v) => set("content_rating", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">Phổ thông — phù hợp đa số</SelectItem>
                      <SelectItem value="teen">13+ — có chủ đề trưởng thành nhẹ</SelectItem>
                      <SelectItem value="mature">18+ — nội dung trưởng thành</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Kiểu thumbnail</Label>
                  <Select value={String(config.thumbnail_style || "auto")} onValueChange={(v) => set("thumbnail_style", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Tự động theo nội dung</SelectItem>
                      <SelectItem value="custom">Theo concept/prompt tùy chỉnh</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Kiểu phụ đề mặc định</Label>
                  <Select value={String(config.subtitle_style || "default")} onValueChange={(v) => set("subtitle_style", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Mặc định theo Cài đặt chung</SelectItem>
                      <SelectItem value="clean">Sạch, dễ đọc</SelectItem>
                      <SelectItem value="bold">Đậm, tương phản cao</SelectItem>
                      <SelectItem value="cinematic">Điện ảnh, tối giản</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Mô tả chi tiết kênh (nói cụ thể về gì)</Label>
                  <Textarea
                    className="border-white/10 bg-[#0c1419] font-mono text-sm text-slate-200 placeholder:text-slate-500"
                    placeholder="Vd: Kênh kể chuyện sinh tồn của người tiền sử ở vùng băng giá..."
                    value={String(config.description || "")}
                    onChange={(e) => set("description", e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Định hướng kênh (thiên về điều gì hơn)</Label>
                  <Textarea
                    className="border-white/10 bg-[#0c1419] font-mono text-sm text-slate-200 placeholder:text-slate-500"
                    placeholder="Vd: Nghiêng về cảm xúc & kịch tính sinh tồn hơn là số liệu khoa học; khán giả phổ thông yêu thích lịch sử."
                    value={String(config.direction || "")}
                    onChange={(e) => set("direction", e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs font-medium text-slate-400">Phong cách viết kịch bản (giọng riêng của kênh)</Label>
                </div>
                  <Textarea
                    className="border-white/10 bg-[#0c1419] font-mono text-sm text-slate-200 placeholder:text-slate-500"
                    placeholder="Viết thành quy tắc cụ thể. Tránh các tính từ chung chung như 'hấp dẫn, chuyên nghiệp, cuốn hút'."
                    value={String(config.script_style || "")}
                  onChange={(e) => set("script_style", e.target.value)}
                  rows={5}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Mẫu nhanh — bấm để điền rồi sửa tiếp:</span>
                  {STYLE_CHIPS.map((chip) => (
                    <Button variant="ghost"
                      key={chip}
                      type="button"
                      onClick={() => set("script_style", chip)}
                      className="rounded-full border px-3 py-1 text-xs transition-colors hover:bg-primary/15 hover:text-primary"
                    >
                      {chip}
                    </Button>
                  ))}
                </div>
              </div>
            </section>

            <hr className="border-white/10" />

            {/* 📝 5 trục + Hook */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 shadow-lg shadow-black/10">
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold tracking-tight text-slate-100">📝 Cách viết để AI thật sự rõ giọng — 5 trục</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {VOICE_STYLE_5AXES.map((a) => (
                  <div key={a.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs shadow-sm shadow-black/10">
                    <div className="font-bold">{a.title}</div>
                    <div className="mt-1 text-muted-foreground">{a.bad}</div>
                    <div className="mt-0.5 text-emerald-300">{a.good}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Hook của kênh (câu chốt thương hiệu — AI lồng sau đoạn mở đầu)</Label>
                <Textarea
                    className="border-white/10 bg-[#0c1419] font-mono text-sm text-slate-200 placeholder:text-slate-500"
                  placeholder="Vd: Mình là recap — kể cho bạn nghe chuyện thật mà không cần xem hết cả bộ phim."
                  value={String(config.hook || "")}
                  onChange={(e) => set("hook", e.target.value)}
                  rows={2}
                />
              </div>
            </section>

            <hr className="border-white/10" />

            {/* Độ dài */}
            <section className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5 shadow-lg shadow-black/10 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Độ dài Video dài mục tiêu</Label>
                <Select value={String(config.long_video_duration)} onValueChange={(v) => set("long_video_duration", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3 - 5 phút">3 - 5 phút</SelectItem>
                    <SelectItem value="5 - 10 phút">5 - 10 phút</SelectItem>
                    <SelectItem value="10 - 20 phút">10 - 20 phút</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Độ dài Shorts mục tiêu</Label>
                <Select value={String(config.short_video_duration)} onValueChange={(v) => set("short_video_duration", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30 - 60 giây">30 - 60 giây</SelectItem>
                    <SelectItem value="90 - 120 giây">90 - 120 giây (Mặc định)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <hr className="border-white/10" />

            {/* 🎙 Giọng & Hình */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 shadow-lg shadow-black/10">
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold tracking-tight text-slate-100">🎙 Giọng & Hình</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">AI provider (văn bản)</Label>
                  <Select value={String(config.ai_provider)} onValueChange={(v) => set("ai_provider", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Mặc định (theo Cài đặt chung)</SelectItem>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                      <SelectItem value="gemini">Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Giọng đọc (TTS)</Label>
                  <Select
                    value={String(config.tts_provider || "default")}
                    onValueChange={async (v) => {
                      const prov = v === "default" ? "" : v
                      set("tts_provider", prov)
                      try {
                        const vs = await api.ttsListVoices(prov || undefined)
                        setVoices(vs)
                        set("voice", vs.length > 0 ? vs[0].id : "")
                      } catch {
                        setVoices([])
                        set("voice", "")
                      }
                    }}
                  >
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Mặc định (theo Cài đặt chung)</SelectItem>
                      <SelectItem value="edge">Edge TTS (miễn phí, cloud)</SelectItem>
                      <SelectItem value="elevenlabs">ElevenLabs (cao cấp, AI)</SelectItem>
                      <SelectItem value="kokoro_vi">Kokoro Việt Nam (local offline)</SelectItem>
                      <SelectItem value="gemini_tts">Gemini TTS (AI Studio)</SelectItem>
                      <SelectItem value="vbee">Vbee (giọng Việt đa vùng miền)</SelectItem>
                      <SelectItem value="google_cloud_tts">Google Cloud TTS</SelectItem>
                      <SelectItem value="azure_tts">Azure TTS</SelectItem>
                      <SelectItem value="kokoro">Kokoro TTS (Anh/Mỹ/..., local)</SelectItem>
                      <SelectItem value="omnivoice">OmniVoice (voice clone/design)</SelectItem>
                      <SelectItem value="local">Piper / Local TTS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Giọng cụ thể</Label>
                  <Select value={String(config.voice || "__default__")} onValueChange={(v) => set("voice", v === "__default__" ? "" : v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Mặc định hệ thống</SelectItem>
                      {String(config.voice || "").trim() && !voices.some((voice) => voice.id === String(config.voice)) && (
                        <SelectItem value={String(config.voice)}>Đang dùng: {String(config.voice)}</SelectItem>
                      )}
                      {voices.map((voice) => {
                        const badge = getCountryBadge(voice.language, voice.id)
                        return (
                          <SelectItem key={voice.id} value={voice.id}>
                            {badge.flag} {voice.name}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Đồng bộ nhân vật</Label>
                  <Select value={String(config.character_sync)} onValueChange={(v) => set("character_sync", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="channel">Cả kênh (dùng lại mọi video)</SelectItem>
                      <SelectItem value="video">Từng video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Tạo ảnh/video bằng</Label>
                  <Select value={String(config.image_generator)} onValueChange={(v) => set("image_generator", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google_flow">Google Flow (Veo/Imagen)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Chế độ hình</Label>
                  <Select value={String(config.image_mode)} onValueChange={(v) => set("image_mode", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mix">Trộn ảnh + video</SelectItem>
                      <SelectItem value="image_only">Chỉ ảnh</SelectItem>
                      <SelectItem value="video_only">Chỉ video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Model video</Label>
                  <Select value={String(config.video_model)} onValueChange={(v) => set("video_model", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Veo 3.1 Lite">Veo 3.1 Lite · 10 credits</SelectItem>
                      <SelectItem value="Veo 3.1 Fast">Veo 3.1 Fast · 20 credits</SelectItem>
                      <SelectItem value="Veo 3.1 Quality">Veo 3.1 Quality · 100 credits</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3">
                <Button type="button" variant="outline" size="sm" onClick={() => void previewVoice()} disabled={previewingVoice}>
                  {previewingVoice ? "Đang tạo mẫu..." : "▶ Nghe thử"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void testVoiceConnection()} disabled={testingVoice}>
                  {testingVoice ? "Đang kiểm tra..." : "Test kết nối"}
                </Button>
                <span className="text-[11px] text-muted-foreground">Thao tác gọi TTS backend thật; lỗi provider sẽ hiển thị ngay tại đây.</span>
              </div>
            </section>

            <hr className="border-white/10" />

            {/* Ngôn ngữ project */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 shadow-lg shadow-black/10">
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold tracking-tight text-slate-100">🌐 Ngôn ngữ sản xuất</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400">Ngôn ngữ sản xuất</Label>
                  <Select value={String(config.language)} onValueChange={(v) => set("language", v)}>
                    <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vi">Tiếng Việt (vi)</SelectItem>
                      <SelectItem value="en">English (en)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] px-4 py-3 text-xs leading-5 text-slate-300">
                Nút “Duyệt kịch bản & chạy tiếp” luôn chạy toàn bộ TTS → Flow → dựng phim. Không còn tùy chọn chỉ hiển thị nhưng không điều khiển pipeline.
              </p>
            </section>
          </div>
        )}

        <DialogFooter className="sticky bottom-0 z-20 flex items-center justify-between gap-4 border-t border-white/10 bg-[#071017]/95 px-7 py-4 backdrop-blur-xl">
          <div className="mr-auto text-xs text-slate-500">
            {saving ? "Đang lưu vào project..." : dirty ? "Có thay đổi chưa lưu" : savedAt ? `Đã đồng bộ lúc ${new Date(savedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "Đã tải cấu hình"}
          </div>
          <Button variant="ghost" onClick={close} disabled={saving} className="text-slate-300 hover:bg-white/[0.06]">
            Đóng
          </Button>
          <Button onClick={save} disabled={saving || loading || !dirty} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-900/30 hover:brightness-110 disabled:opacity-40">
            {saving ? "Đang lưu..." : "💾 Lưu cấu hình"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
