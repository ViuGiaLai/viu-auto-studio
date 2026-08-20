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

const CONFIG_KEYS = new Set(["image_source", "video_style", "niche", "series_type", "description", "direction", "script_style", "hook", "long_video_duration", "short_video_duration", "ai_provider", "tts_provider", "voice", "character_sync", "image_generator", "image_mode", "static_image_seconds", "video_model", "review_mode", "suggested_time", "language"])

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
  ai_provider: "default",
  tts_provider: "",
  voice: "",
  character_sync: "channel",
  image_generator: "google_flow",
  image_mode: "mix",
  static_image_seconds: 5,
  video_model: "omni_flash",
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
        setStyles(st)
        setConfig({ ...DEFAULT_CONFIG, ...loaded })
        setDirty(false)
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
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(config.suggested_time || ""))) {
      toast({ title: "Giờ đề xuất không hợp lệ", description: "Dùng định dạng HH:MM.", variant: "destructive" })
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
      setConfig({ ...DEFAULT_CONFIG, ...nextConfig })
      setDirty(false)
      toast({ title: "Đã lưu cấu hình kênh" })
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
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto border-cyan-500/20 bg-[#0c141b] p-0">
        <DialogHeader className="sticky top-0 z-10 border-b border-white/10 bg-[#0c141b]/95 px-6 py-4 backdrop-blur">
          <DialogTitle className="flex items-center gap-2 text-lg">
            ⚙️ Cấu hình kênh
            {channelName && <span className="text-sm font-normal text-muted-foreground">— {channelName}</span>}
            {dirty && <Badge variant="outline" className="border-amber-400/40 text-amber-300">Chưa lưu</Badge>}
          </DialogTitle>
          <DialogDescription>bộ não AI, giọng, lịch tự đề xuất</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* 🧠 Nội dung & Bộ não */}
            <section>
              <h3 className="mb-3 text-sm font-bold">🧠 Nội dung & Bộ não — quyết định chủ đề & chất riêng của kênh</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nguồn hình</Label>
                  <Select value={String(config.image_source)} onValueChange={(v) => set("image_source", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai">🤖 AI tạo hình (Flow/Meta)</SelectItem>
                      <SelectItem value="stock">📦 Kho ảnh/video có sẵn</SelectItem>
                      <SelectItem value="mixed">🔀 Kết hợp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Kiểu video (bộ não AI)</Label>
                  <Select value={String(config.video_style)} onValueChange={(v) => set("video_style", v)}>
                    <SelectTrigger className="w-full text-sm">
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
                  <Label className="text-xs">Ngách của kênh (gõ cụ thể để khác biệt)</Label>
                  <Input
                    placeholder="Vd: Sinh tồn của thợ săn voi mùa đông vùng Siberia"
                    value={String(config.niche || "")}
                    onChange={(e) => set("niche", e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Kiểu chuỗi tập (chống trùng chủ đề)</Label>
                  <Select value={String(config.series_type)} onValueChange={(v) => set("series_type", v)}>
                    <SelectTrigger className="w-full text-sm">
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

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mô tả chi tiết kênh (nói cụ thể về gì)</Label>
                  <Textarea
                    placeholder="Vd: Kênh kể chuyện sinh tồn của người tiền sử ở vùng băng giá..."
                    value={String(config.description || "")}
                    onChange={(e) => set("description", e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Định hướng kênh (thiên về điều gì hơn)</Label>
                  <Textarea
                    placeholder="Vd: Nghiêng về cảm xúc & kịch tính sinh tồn hơn là số liệu khoa học; khán giả phổ thông yêu thích lịch sử."
                    value={String(config.direction || "")}
                    onChange={(e) => set("direction", e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs">Phong cách viết kịch bản (giọng riêng của kênh)</Label>
                </div>
                <Textarea
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

            <hr className="border-border/60" />

            {/* 📝 5 trục + Hook */}
            <section>
              <h3 className="mb-3 text-sm font-bold">📝 Cách viết để AI thật sự rõ giọng — 5 trục</h3>
              <div className="grid gap-2 sm:grid-cols-5">
                {VOICE_STYLE_5AXES.map((a) => (
                  <div key={a.title} className="rounded-md border bg-background p-3 text-xs">
                    <div className="font-bold">{a.title}</div>
                    <div className="mt-1 text-muted-foreground">{a.bad}</div>
                    <div className="mt-0.5 text-emerald-300">{a.good}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-1.5">
                <Label className="text-xs">Hook của kênh (câu chốt thương hiệu — AI lồng sau đoạn mở đầu)</Label>
                <Textarea
                  placeholder="Vd: Mình là recap — kể cho bạn nghe chuyện thật mà không cần xem hết cả bộ phim."
                  value={String(config.hook || "")}
                  onChange={(e) => set("hook", e.target.value)}
                  rows={2}
                />
              </div>
            </section>

            <hr className="border-border/60" />

            {/* Độ dài */}
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Độ dài Video dài mục tiêu</Label>
                <Select value={String(config.long_video_duration)} onValueChange={(v) => set("long_video_duration", v)}>
                  <SelectTrigger className="w-full text-sm">
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
                <Label className="text-xs">Độ dài Shorts mục tiêu</Label>
                <Select value={String(config.short_video_duration)} onValueChange={(v) => set("short_video_duration", v)}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30 - 60 giây">30 - 60 giây</SelectItem>
                    <SelectItem value="90 - 120 giây">90 - 120 giây (Mặc định)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <hr className="border-border/60" />

            {/* 🎙 Giọng & Hình */}
            <section>
              <h3 className="mb-3 text-sm font-bold">🎙 Giọng & Hình</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">AI provider (văn bản)</Label>
                  <Select value={String(config.ai_provider)} onValueChange={(v) => set("ai_provider", v)}>
                    <SelectTrigger className="w-full text-sm">
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
                  <Label className="text-xs">Giọng đọc (TTS)</Label>
                  <Select value={String(config.tts_provider || "default")} onValueChange={(v) => set("tts_provider", v === "default" ? "" : v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Mặc định (theo Cài đặt chung)</SelectItem>
                      <SelectItem value="edge">Edge TTS (giọng thật)</SelectItem>
                      <SelectItem value="kokoro">Kokoro TTS (local)</SelectItem>
                      <SelectItem value="omnivoice">OmniVoice (voice clone/design)</SelectItem>
                      <SelectItem value="cloud">Cloud TTS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Giọng cụ thể</Label>
                  <Select value={String(config.voice || "__default__")} onValueChange={(v) => set("voice", v === "__default__" ? "" : v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Mặc định hệ thống</SelectItem>
                      {String(config.voice || "").trim() && !voices.some((voice) => voice.id === String(config.voice)) && (
                        <SelectItem value={String(config.voice)}>Đang dùng: {String(config.voice)}</SelectItem>
                      )}
                      {voices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name} ({voice.language}){voice.downloaded ? "" : " · cần tải"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="mt-2"
                    placeholder="Hoặc nhập voice ID tùy chỉnh"
                    value={String(config.voice || "")}
                    onChange={(e) => set("voice", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Đồng bộ nhân vật</Label>
                  <Select value={String(config.character_sync)} onValueChange={(v) => set("character_sync", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="channel">Cả kênh (dùng lại mọi video)</SelectItem>
                      <SelectItem value="video">Từng video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tạo ảnh/video bằng</Label>
                  <Select value={String(config.image_generator)} onValueChange={(v) => set("image_generator", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google_flow">Google Flow (Veo/Imagen)</SelectItem>
                      <SelectItem value="meta">Meta AI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Chế độ hình</Label>
                  <Select value={String(config.image_mode)} onValueChange={(v) => set("image_mode", v)}>
                    <SelectTrigger className="w-full text-sm">
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
                  <Label className="text-xs">Thời gian ảnh tĩnh (giây)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={String(config.static_image_seconds ?? 5)}
                    onChange={(e) => set("static_image_seconds", Number(e.target.value) || 5)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Model video</Label>
                  <Select value={String(config.video_model)} onValueChange={(v) => set("video_model", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="omni_flash">Omni Flash (mặc định)</SelectItem>
                      <SelectItem value="veo">Veo</SelectItem>
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

            <hr className="border-border/60" />

            {/* ⏰ Tự động & Lịch */}
            <section>
              <h3 className="mb-3 text-sm font-bold">⏰ Tự động & Lịch</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Chế độ duyệt</Label>
                  <Select value={String(config.review_mode)} onValueChange={(v) => set("review_mode", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="script_first">📄 Duyệt kịch bản trước (Mặc định)</SelectItem>
                      <SelectItem value="auto">🤖 Tự động hoàn toàn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Giờ đề xuất</Label>
                  <Input
                    type="time"
                    value={String(config.suggested_time || "07:00")}
                    onChange={(e) => set("suggested_time", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ngôn ngữ sản xuất</Label>
                  <Select value={String(config.language)} onValueChange={(v) => set("language", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vi">Tiếng Việt (vi)</SelectItem>
                      <SelectItem value="en">English (en)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-3 rounded border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-muted-foreground">
                💡 Chế độ duyệt đang chọn: dùng chờ bạn đọc & sửa kịch bản trước khi lồng tiếng và sinh ảnh.
              </p>
            </section>
          </div>
        )}

        <DialogFooter className="sticky bottom-0 z-10 border-t border-white/10 bg-[#0c141b]/95 px-6 py-4 backdrop-blur">
          <Button variant="ghost" onClick={close}>
            Đóng
          </Button>
          <Button onClick={save} disabled={saving || loading} className="bg-gradient-to-r from-amber-500 to-pink-500 hover:opacity-90">
            {saving ? "Đang lưu..." : "💾 Lưu cấu hình"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
