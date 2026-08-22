import { getCountryBadge, getSampleTextForVoice } from "@/components/voice-studio-panel"
import { useEffect, useState } from "react"
import { Play, RefreshCw, Sparkles, Wand2, Mic2, Image as ImageIcon, Video, Bot, Globe } from "lucide-react"

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
import type { TTSVoice, TTSConfig } from "@/types"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/utils/cn"

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

const CONFIG_KEYS = new Set([
  "image_source", "video_style", "niche", "series_type", "description", "direction",
  "script_style", "hook", "long_video_duration", "short_video_duration", "target_audience",
  "content_rating", "thumbnail_style", "subtitle_style", "ai_provider", "tts_provider",
  "voice", "character_sync", "image_generator", "image_mode", "static_image_seconds",
  "video_model", "review_mode", "suggested_time", "language"
])

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
  tts_provider: "default",
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
  const [originalVoice, setOriginalVoice] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [testingVoice, setTestingVoice] = useState(false)
  const [previewingVoice, setPreviewingVoice] = useState(false)
  const [voices, setVoices] = useState<TTSVoice[]>([])
  const [styles, setStyles] = useState<Array<{ key: string; name: string; desc: string; tier: string }>>([])
  
  // Global settings reflection
  const [globalSettings, setGlobalSettings] = useState<Record<string, unknown>>({})
  const [globalTtsConfig, setGlobalTtsConfig] = useState<TTSConfig | null>(null)

  useEffect(() => {
    if (!open || (!channelId && !projectId)) return
    let cancelled = false
    setLoading(true)
    const load = async () => {
      try {
        const [source, st, gSettings, gTts] = await Promise.all([
          channelId ? api.channelGetConfig(channelId) : api.getProjectConfig(projectId),
          api.videoStyles(),
          api.getSettings().catch(() => ({})),
          api.ttsGetConfig().catch(() => null),
        ])
        if (cancelled) return
        setGlobalSettings(gSettings || {})
        setGlobalTtsConfig(gTts)

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
        if (!loaded.ai_provider) loaded.ai_provider = "default"
        if (!loaded.tts_provider) loaded.tts_provider = "default"

        setStyles(st)
        const finalConfig = { ...DEFAULT_CONFIG, ...loaded }
        setConfig(finalConfig)
        setOriginalVoice(String(finalConfig.voice || ""))
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
    const resolvedProv = provider === "default" || !provider ? undefined : provider
    api.ttsListVoices(resolvedProv).then(setVoices).catch(() => setVoices([]))
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
      const prov = String(config.tts_provider || "")
      const resolvedProv = prov === "default" || !prov ? undefined : prov
      const result = await api.ttsTestConnection({ provider: resolvedProv })
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
      const selectedVoice = voices.find((v) => v.id === String(config.voice))
      const text = getSampleTextForVoice(selectedVoice)
      const prov = String(config.tts_provider || "")
      const resolvedProv = prov === "default" || !prov ? undefined : prov
      const result = await api.ttsPreview(text, {
        provider: resolvedProv,
        voice: String(config.voice || "") || undefined,
      })
      if (!result.ok || !result.audio_path) throw new Error(result.message || "Không tạo được audio mẫu")
      const audio = new Audio(`${mediaUrl(result.audio_path)}?t=${Date.now()}`)
      await audio.play()
      toast({ title: "Đang phát giọng mẫu", description: `Động cơ: ${result.actual_provider || resolvedProv || "Mặc định"} · Giọng: ${selectedVoice?.name || String(config.voice || "Mặc định")}` })
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

      // If voice or TTS provider was modified, clear existing voice audio on scenes so next pipeline run re-synthesizes with the new voice!
      const currentVoice = String(nextConfig.voice || "")
      if (originalVoice && currentVoice && originalVoice !== currentVoice) {
        try {
          const scenes = await api.listScenes(projectId)
          for (const sc of scenes) {
            if (sc.audio_path) {
              await api.updateScene(projectId, sc.id, { audio_path: "", status: "pending" })
            }
          }
        } catch {
          // Ignore
        }
      }

      setConfig({ ...DEFAULT_CONFIG, ...nextConfig })
      setOriginalVoice(currentVoice)
      setDirty(false)
      setSavedAt(Date.now())
      toast({
        title: "Đã lưu cấu hình kênh & áp dụng",
        description: "Mọi thay đổi về giọng đọc, AI và nguồn hình sẽ được áp dụng ngay vào quy trình tiếp theo.",
      })
      onSaved?.(nextConfig)
      onOpenChange(false)
    } catch (e) {
      toast({ title: "Không thể lưu", description: String(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Compute display names for global defaults
  const globalAiName = (() => {
    const prov = String(globalSettings.ai_translation_provider || "gemini").toLowerCase()
    const geminiModel = String(globalSettings.gemini_model || "3.5 Flash")
    if (prov === "deepseek") return "DeepSeek (API key)"
    if (prov === "chatgpt") return "ChatGPT (tài khoản)"
    if (prov === "openrouter") return "OpenRouter"
    if (prov === "local") return "Cục bộ"
    return `Gemini (${geminiModel})`
  })()

  const globalTtsName = (() => {
    const prov = String(globalTtsConfig?.provider || "edge").toLowerCase()
    if (prov === "elevenlabs") return "ElevenLabs"
    if (prov === "kokoro_vi") return "Kokoro VN"
    if (prov === "gemini_tts") return "Gemini TTS"
    if (prov === "vbee") return "Vbee"
    if (prov === "azure_tts") return "Azure TTS"
    return "Edge TTS (Miễn phí)"
  })()

  const globalVoiceName = globalTtsConfig?.voice || "Hoài My (Nữ Bắc)"

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto border border-white/10 bg-[#080d11] p-0 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#0c1419]/95 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                ⚙️ Cấu hình kênh
                <span className="text-xs font-normal text-amber-400/90 font-mono">
                  — {channelName} · cấu hình riêng
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Bộ não AI, giọng đọc, hình ảnh và lịch sản xuất cho project hiện tại.
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && !dirty && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-xs">
                ✓ Đã đồng bộ
              </Badge>
            )}
            {dirty && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-xs animate-pulse">
                Có thay đổi chưa lưu
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-6 p-6">
          {/* SECTION 1: NỘI DUNG & BỘ NÃO */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 shadow-lg shadow-black/10 space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-300">
              <Sparkles className="h-4 w-4" />
              1. Nội dung & Bộ não — quyết định chủ đề & chất riêng của kênh
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Kiểu video (bộ não AI)</Label>
                <Select value={String(config.video_style || "")} onValueChange={(v) => set("video_style", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue placeholder="— Chọn kiểu —" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200">
                    {styles.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.name} ({s.desc})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Ngách của kênh (gõ cụ thể để khác biệt)</Label>
                <Input
                  className="border-white/10 bg-[#0c1419] text-sm text-slate-200 placeholder:text-slate-600"
                  placeholder="Vd: Sinh tồn của thợ săn voi mùa đông vùng Siberia"
                  value={String(config.niche || "")}
                  onChange={(e) => set("niche", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Kiểu chuỗi tập (chống trùng chủ đề)</Label>
                <Select value={String(config.series_type)} onValueChange={(v) => set("series_type", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200">
                    <SelectItem value="anthology">Tuyển tập — mỗi tập một chủ đề MỚI (khuyên dùng)</SelectItem>
                    <SelectItem value="sequential">Nối tiếp — tập sau tiếp cốt truyện tập trước</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Đối tượng xem mặc định</Label>
                <Input
                  className="border-white/10 bg-[#0c1419] text-sm text-slate-200 placeholder:text-slate-600"
                  placeholder="Vd: Người mới bắt đầu, 18–35 tuổi"
                  value={String(config.target_audience || "")}
                  onChange={(e) => set("target_audience", e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Mô tả chi tiết kênh (nói cụ thể về gì)</Label>
                <Textarea
                  className="border-white/10 bg-[#0c1419] font-mono text-sm text-slate-200 placeholder:text-slate-600"
                  placeholder="Vd: Kênh kể chuyện sinh tồn của người tiền sử ở vùng băng giá..."
                  value={String(config.description || "")}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Định hướng kênh (thiên về điều gì hơn)</Label>
                <Textarea
                  className="border-white/10 bg-[#0c1419] font-mono text-sm text-slate-200 placeholder:text-slate-600"
                  placeholder="Vd: Nghiêng về cảm xúc & kịch tính sinh tồn hơn là số liệu khoa học; khán giả phổ thông yêu thích lịch sử."
                  value={String(config.direction || "")}
                  onChange={(e) => set("direction", e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-400">Phong cách viết kịch bản (giọng riêng của kênh)</Label>
              <Textarea
                className="border-white/10 bg-[#0c1419] font-mono text-sm text-slate-200 placeholder:text-slate-600"
                placeholder="Viết thành quy tắc cụ thể. Tránh các tính từ chung chung như 'hấp dẫn, chuyên nghiệp, cuốn hút'."
                value={String(config.script_style || "")}
                onChange={(e) => set("script_style", e.target.value)}
                rows={4}
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-500">Mẫu nhanh:</span>
                {STYLE_CHIPS.map((chip) => (
                  <Button
                    variant="ghost"
                    key={chip}
                    type="button"
                    onClick={() => set("script_style", chip)}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-amber-500/15 hover:text-amber-300"
                  >
                    {chip}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-400">Hook của kênh (câu chốt thương hiệu — AI lồng sau đoạn mở đầu)</Label>
              <Input
                className="border-white/10 bg-[#0c1419] text-sm text-slate-200 placeholder:text-slate-600"
                placeholder="Vd: Mình là recap — kể cho bạn nghe chuyện thật mà không cần xem hết cả bộ phim."
                value={String(config.hook || "")}
                onChange={(e) => set("hook", e.target.value)}
              />
            </div>
          </section>

          {/* SECTION 2: GIỌNG ĐỌC & HÌNH ẢNH (ĐỒNG BỘ THẬT SỰ) */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 shadow-lg shadow-black/10 space-y-5">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-300">
              <Mic2 className="h-4 w-4" />
              2. Giọng đọc & Nguồn hình — áp dụng trực tiếp khi duyệt & xuất video
            </h3>

            <div className="grid gap-5 sm:grid-cols-2">
              {/* AI Provider */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5 text-amber-400" />
                  Nhà cung cấp AI (Kịch bản & Phân tích)
                </Label>
                <Select value={String(config.ai_provider || "default")} onValueChange={(v) => set("ai_provider", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200">
                    <SelectItem value="default">
                      Mặc định (theo Cài đặt: {globalAiName})
                    </SelectItem>
                    <SelectItem value="gemini">Gemini (Google AI / Tài khoản)</SelectItem>
                    <SelectItem value="chatgpt">ChatGPT (OpenAI / Tài khoản)</SelectItem>
                    <SelectItem value="deepseek">DeepSeek (API key)</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="local">Cục bộ (không cần key)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">Được dùng khi sinh kịch bản, chia cảnh semantic và tạo visual prompt.</p>
              </div>

              {/* TTS Provider */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Mic2 className="h-3.5 w-3.5 text-sky-400" />
                  Nhà cung cấp Giọng đọc (TTS)
                </Label>
                <Select
                  value={String(config.tts_provider || "default")}
                  onValueChange={async (v) => {
                    const prov = v === "default" ? "" : v
                    set("tts_provider", v)
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
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200">
                    <SelectItem value="default">
                      Mặc định (theo Cài đặt: {globalTtsName})
                    </SelectItem>
                    <SelectItem value="edge">Edge TTS (miễn phí, chất lượng cao)</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs (cao cấp, AI)</SelectItem>
                    <SelectItem value="kokoro_vi">Kokoro Việt Nam (local offline)</SelectItem>
                    <SelectItem value="gemini_tts">Gemini TTS (AI Studio)</SelectItem>
                    <SelectItem value="vbee">Vbee (giọng Việt đa vùng miền)</SelectItem>
                    <SelectItem value="azure_tts">Azure TTS (Microsoft)</SelectItem>
                    <SelectItem value="kokoro">Kokoro TTS (Anh/Mỹ/..., local)</SelectItem>
                    <SelectItem value="local">Piper / Local TTS</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">Tạo file âm thanh thật cho từng phân cảnh trong quy trình sản xuất.</p>
              </div>

              {/* Giọng cụ thể */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold text-slate-300">
                  Giọng đọc cụ thể
                </Label>
                <Select value={String(config.voice || "__default__")} onValueChange={(v) => set("voice", v === "__default__" ? "" : v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200 max-h-60">
                    <SelectItem value="__default__">Mặc định (Cài đặt chung: {globalVoiceName})</SelectItem>
                    {String(config.voice || "").trim() && !voices.some((v) => v.id === String(config.voice)) && (
                      <SelectItem value={String(config.voice)}>Đang chọn: {String(config.voice)}</SelectItem>
                    )}
                    {voices.map((voice) => {
                      const badge = getCountryBadge(voice.language, voice.id)
                      return (
                        <SelectItem key={voice.id} value={voice.id}>
                          {badge.flag} {voice.name} ({voice.gender === "female" ? "Nữ" : "Nam"}) · {voice.language}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>

                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-xs border-white/10 bg-white/[0.02] hover:bg-white/10 gap-1.5 text-slate-200"
                    disabled={previewingVoice}
                    onClick={previewVoice}
                  >
                    {previewingVoice ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                    {previewingVoice ? "Đang phát..." : "▶ Nghe thử giọng đã chọn"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-xs border-white/10 bg-white/[0.02] hover:bg-white/10 gap-1.5 text-slate-200"
                    disabled={testingVoice}
                    onClick={testVoiceConnection}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", testingVoice && "animate-spin text-amber-400")} />
                    {testingVoice ? "Đang kiểm tra..." : "Kiểm tra kết nối TTS"}
                  </Button>
                </div>
              </div>

              {/* Nguồn hình & Chế độ hình */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
                  Nguồn hình ảnh & Video
                </Label>
                <Select value={String(config.image_generator || "google_flow")} onValueChange={(v) => set("image_generator", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200">
                    <SelectItem value="google_flow">🤖 Google Flow (Veo / Imagen tự động)</SelectItem>
                    <SelectItem value="local_library">📁 Kho media cục bộ / Tải lên thủ công</SelectItem>
                    <SelectItem value="mixed">🔀 Chế độ hỗn hợp (Flow + Kho media)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5 text-purple-400" />
                  Chế độ kết hợp media
                </Label>
                <Select value={String(config.image_mode || "mix")} onValueChange={(v) => set("image_mode", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200">
                    <SelectItem value="mix">Trộn ảnh + video (Khuyên dùng)</SelectItem>
                    <SelectItem value="image_only">Chỉ hình ảnh (Ken Burns chuyển động)</SelectItem>
                    <SelectItem value="video_only">Chỉ video AI (Veo 3.1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Model video & Đồng bộ nhân vật */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Model Video Google Flow</Label>
                <Select value={String(config.video_model || "Veo 3.1 Lite")} onValueChange={(v) => set("video_model", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200">
                    <SelectItem value="Veo 3.1 Lite">Veo 3.1 Lite · 10 credits (Nhanh, tiết kiệm)</SelectItem>
                    <SelectItem value="Veo 3.1 Fast">Veo 3.1 Fast · 20 credits (Cân bằng)</SelectItem>
                    <SelectItem value="Veo 3.1 Quality">Veo 3.1 Quality · 100 credits (Chất lượng cao nhất)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Đồng bộ nhân vật</Label>
                <Select value={String(config.character_sync || "channel")} onValueChange={(v) => set("character_sync", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200">
                    <SelectItem value="channel">Cả kênh (dùng lại ảnh tham chiếu mọi video)</SelectItem>
                    <SelectItem value="video">Từng video riêng biệt</SelectItem>
                    <SelectItem value="off">Tắt đồng bộ nhân vật</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* SECTION 3: NGÔN NGỮ & PHỤ ĐỀ */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 shadow-lg shadow-black/10 space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-300">
              <Globe className="h-4 w-4" />
              3. Ngôn ngữ sản xuất
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Ngôn ngữ sản xuất</Label>
                <Select value={String(config.language || "vi")} onValueChange={(v) => set("language", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200">
                    <SelectItem value="vi">🇻🇳 Tiếng Việt (vi)</SelectItem>
                    <SelectItem value="en">🇺🇸 Tiếng Anh (en)</SelectItem>
                    <SelectItem value="ja">🇯🇵 Tiếng Nhật (ja)</SelectItem>
                    <SelectItem value="ko">🇰🇷 Tiếng Hàn (ko)</SelectItem>
                    <SelectItem value="zh">🇨🇳 Tiếng Trung (zh)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Kiểu phụ đề</Label>
                <Select value={String(config.subtitle_style || "default")} onValueChange={(v) => set("subtitle_style", v)}>
                  <SelectTrigger className="w-full border-white/10 bg-[#0c1419] text-sm text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1419] border-white/10 text-slate-200">
                    <SelectItem value="default">Mặc định theo Cài đặt chung</SelectItem>
                    <SelectItem value="highlight">Nổi bật (Viền vàng đen bắt mắt)</SelectItem>
                    <SelectItem value="karaoke">Karaoke (Từng từ phát sáng)</SelectItem>
                    <SelectItem value="simple">Đơn giản (Trắng viền đen)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-white/10 bg-[#0c1419]/95 px-6 py-4 backdrop-blur-md">
          <div className="text-xs text-slate-500">
            {savedAt ? `Đã lưu & đồng bộ lúc ${new Date(savedAt).toLocaleTimeString("vi-VN")}` : "Chưa lưu thay đổi"}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={close} disabled={saving} className="text-slate-400 hover:text-slate-200">
              Đóng
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-[#121820] font-bold text-sm shadow-lg shadow-amber-500/20 hover:brightness-110"
            >
              {saving ? "Đang lưu..." : "💾 Lưu cấu hình & Áp dụng"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
